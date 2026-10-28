// The web replacement for src/db/db.js. The shared handlers require '../db/db' and get this
// module instead (see bootstrap.js), with the same functions. Every query runs on the
// connection of the current request, whose search_path is that request's branch schema:
// there is no global connection, and without a branch context no query runs at all.

const { pool } = require('./pool');
const context = require('../context');
const { render, toSqliteError } = require('./sql');

const SCHEMA_PATTERN = /^branch_\d+$/;

/**
 * The connection of the current request, checked out on first use.
 * @param {import('../context').RequestContext} ctx
 * @returns {Promise<import('pg').PoolClient>}
 */
async function getClient(ctx) {
  if (ctx.db.client) return ctx.db.client;
  if (!ctx.db.connecting) {
    ctx.db.connecting = (async () => {
      if (!ctx.branch || !SCHEMA_PATTERN.test(ctx.branch.schema)) {
        throw new Error('No branch selected for this request.');
      }
      const client = await pool.connect();
      try {
        await client.query(
          `SET search_path TO ${ctx.branch.schema}, compat; SET standard_conforming_strings = on`,
        );
      } catch (error) {
        client.release(error);
        throw error;
      }
      ctx.db.client = client;
      return client;
    })();
  }
  return ctx.db.connecting;
}

/**
 * Gives the connection back to the pool at the end of a request. An open transaction (a
 * handler that threw between BEGIN and COMMIT) is rolled back, and the search_path is reset
 * so the next request starts from nothing.
 * @param {import('../context').RequestContext} ctx
 */
async function releaseContext(ctx) {
  const client = ctx.db.client;
  if (!client) return;
  ctx.db.client = null;
  ctx.db.connecting = null;
  try {
    await ctx.db.queue.catch(() => {});
    if (ctx.db.txDepth > 0) await client.query('ROLLBACK');
    ctx.db.txDepth = 0;
    await client.query('RESET search_path');
    client.release();
  } catch (error) {
    client.release(error); // a broken connection is discarded, not reused
  }
}

/**
 * Serializes the statements of one request on its connection (a handler may start several
 * with Promise.all; they must not interleave inside a transaction).
 */
function serialize(ctx, fn) {
  const run = ctx.db.queue.then(fn, fn);
  ctx.db.queue = run.catch(() => {});
  return run;
}

/**
 * Runs one statement. Inside a transaction it is wrapped in a savepoint: a failed statement
 * is undone on its own and the transaction stays usable, as in SQLite (Postgres would abort
 * the whole transaction).
 */
async function runText(client, ctx, text) {
  if (ctx.db.txDepth === 0) return client.query(text);
  try {
    const results = await client.query(`SAVEPOINT qam_stmt; ${text}; RELEASE SAVEPOINT qam_stmt`);
    return results[results.length - 2];
  } catch (error) {
    await client.query('ROLLBACK TO SAVEPOINT qam_stmt; RELEASE SAVEPOINT qam_stmt');
    throw error;
  }
}

async function execute(sql, params) {
  const ctx = context.require();
  return serialize(ctx, async () => {
    const client = await getClient(ctx);
    const { text, isInsert } = render(sql, params);
    try {
      return { result: await runText(client, ctx, text), isInsert };
    } catch (error) {
      // SQLite stores '' in an INTEGER column; Postgres rejects it. Retry once with NULL,
      // which is what the forms mean by an empty field.
      const values = Array.isArray(params) ? params : [];
      if (error.code === '22P02' && /: ""/.test(error.message) && values.includes('')) {
        const retry = render(
          sql,
          values.map((v) => (v === '' ? null : v)),
        );
        try {
          return { result: await runText(client, ctx, retry.text), isInsert };
        } catch (retryError) {
          throw toSqliteError(retryError);
        }
      }
      throw toSqliteError(error);
    }
  });
}

/**
 * INSERT/UPDATE/DELETE. Resolves to { id, changes } like better-sqlite3's run().
 */
async function runQuery(sql, params = []) {
  const { result, isInsert } = await execute(sql, params);
  const rows = (result && result.rows) || [];
  const last = rows[rows.length - 1];
  return {
    id: isInsert && last && last.id !== undefined ? last.id : 0,
    changes: result ? result.rowCount || 0 : 0,
  };
}

/** First row, or undefined. */
async function getQuery(sql, params = []) {
  const { result } = await execute(sql, params);
  return result && result.rows ? result.rows[0] : undefined;
}

/** All rows. */
async function allQuery(sql, params = []) {
  const { result } = await execute(sql, params);
  return result && result.rows ? result.rows : [];
}

/** Several statements, no parameters. */
async function dbExec(_database, sql) {
  const ctx = context.require();
  return serialize(ctx, async () => {
    const client = await getClient(ctx);
    try {
      await client.query(sql);
    } catch (error) {
      throw toSqliteError(error);
    }
  });
}

/**
 * Runs callback in a transaction. Nested calls join the outer transaction, as in db.js.
 * @template T
 * @param {() => Promise<T>} callback
 * @returns {Promise<T>}
 */
async function withTransaction(callback) {
  const ctx = context.require();
  if (ctx.db.txDepth > 0) {
    ctx.db.txDepth += 1;
    try {
      return await callback();
    } finally {
      ctx.db.txDepth -= 1;
    }
  }
  await serialize(ctx, async () => (await getClient(ctx)).query('BEGIN'));
  ctx.db.txDepth = 1;
  try {
    const result = await callback();
    ctx.db.txDepth = 0;
    await serialize(ctx, () => ctx.db.client.query('COMMIT'));
    return result;
  } catch (error) {
    ctx.db.txDepth = 0;
    await serialize(ctx, () => ctx.db.client.query('ROLLBACK')).catch(() => {});
    throw error;
  }
}

async function hasSuperadmin() {
  const row = await getQuery(`
    SELECT u.id FROM users u
    JOIN user_roles ur ON u.id = ur.user_id
    JOIN roles r ON ur.role_id = r.id
    WHERE r.name = 'Superadmin' AND u.deleted_at IS NULL
  `);
  return !!row;
}

module.exports = {
  // Same surface as src/db/db.js.
  initializeDatabase: async () => {},
  closeDatabase: async () => {},
  runQuery,
  getQuery,
  allQuery,
  getDb: () => {
    throw new Error('Direct SQLite access is not available on the web server.');
  },
  getDatabasePath: () => {
    throw new Error('There is no database file on the web server.');
  },
  isDbOpen: () => !!(context.current() && context.current().branch),
  dbExec,
  withTransaction,
  hasSuperadmin,
  createSuperadminUser: async () => {
    throw new Error('On the web, a branch superadmin is created by invitation.');
  },
  rotateDatabaseKey: async () => {
    throw new Error('Not available on the web server.');
  },
  // Web only.
  releaseContext,
  getClient,
};
