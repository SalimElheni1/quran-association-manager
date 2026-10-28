// The PostgreSQL twin of tests/db/helpers/realDb.js (same API), used by jest.pg.config.js so
// the desktop's real-database tests run against a branch schema through the web adapter.
// Each test file gets its own branch schema; resetDatabase() recreates it.

const { execFileSync } = require('child_process');
const { pool } = require('../../server/db/pool');
const { createBranchSchema, branchSchemaName } = require('../../server/db/migrate');
const { render } = require('../../server/db/sql');
const context = require('../../server/context');
const adapter = require('../../server/db/adapter');

const SENDER_ID = 1;
const ALL_ROLES = ['Superadmin', 'Administrator', 'FinanceManager', 'SessionSupervisor'];

function useRealDb(options = {}) {
  const register = options.register || [];
  const ctx = { user: null, event: { sender: { id: SENDER_ID } }, dir: null };

  let branch = null;
  let electron;
  let sessionManager;
  let nextSenderId = 100;
  let kv = new Map();

  // Every call runs in its own request context, like an HTTP request on the server. The
  // electron-store values live for the whole test file (kv), as the in-memory mock does.
  const inBranch = async (fn) => {
    const reqCtx = context.createContext({ branch, user: ctx.user });
    reqCtx.kv = kv;
    return context.run(reqCtx, async () => {
      try {
        return await fn();
      } finally {
        await adapter.releaseContext(reqCtx);
      }
    });
  };

  function handlerFor(channel) {
    const handler = electron.ipcMain._handlers.get(channel);
    if (!handler) throw new Error(`No IPC handler registered for '${channel}'.`);
    return handler;
  }

  ctx.invoke = (channel, ...args) => inBranch(() => handlerFor(channel)(ctx.event, ...args));

  ctx.invokeAs = (roles, channel, ...args) => {
    const sender = { id: nextSenderId++ };
    sessionManager.createSession(sender, { id: ctx.user.id, username: 'limited', roles }, null);
    return inBranch(() => handlerFor(channel)({ sender }, ...args));
  };

  ctx.invokeWithoutSession = (channel, ...args) =>
    inBranch(() => handlerFor(channel)({ sender: { id: nextSenderId++ } }, ...args));

  // Synchronous SQL for assertions (the specs read results without await): one psql call.
  const psql = (text) =>
    execFileSync(
      'psql',
      [process.env.DATABASE_URL, '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c',
        `SET search_path TO ${branch.schema}, compat; ${text}`],
      { encoding: 'utf8' },
    ).trim();

  const rowsOf = (sql, params) => {
    const { text } = render(sql, params);
    return JSON.parse(psql(`SELECT COALESCE(json_agg(t), '[]') FROM (${text.replace(/;\s*$/, '')}) t`) || '[]');
  };

  ctx.get = (sql, params = []) => rowsOf(sql, params)[0];
  ctx.all = (sql, params = []) => rowsOf(sql, params);
  ctx.run = (sql, params = []) => {
    let { text } = render(sql, params);
    text = text.replace(/;\s*$/, '');
    if (!/\bRETURNING\b/i.test(text)) text += ' RETURNING *';
    const out = JSON.parse(
      psql(
        `WITH q AS (${text}) SELECT json_build_object('changes', count(*), 'lastInsertRowid', max((to_jsonb(q)->>'id')::bigint)) FROM q`,
      ),
    );
    return { changes: out.changes, lastInsertRowid: out.lastInsertRowid };
  };

  ctx.setSettings = (values) => {
    Object.entries(values).forEach(([key, value]) =>
      ctx.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [
        key,
        value === null || value === undefined ? '' : String(value),
      ]),
    );
  };

  async function openFreshDatabase() {
    sessionManager.revokeAllSessions();
    kv = new Map();
    if (!branch) {
      const { rows } = await pool.query(
        "INSERT INTO platform.branches (slug, name) VALUES ($1, 'Test') RETURNING id, slug, name, status",
        [`t-${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`],
      );
      branch = { ...rows[0], schema: branchSchemaName(rows[0].id) };
    } else {
      await pool.query(`DROP SCHEMA ${branch.schema} CASCADE`);
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await createBranchSchema(client, branch.id);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    // A real user row: audit columns such as created_by_user_id point at users.
    const { rows } = await pool.query(
      `INSERT INTO ${branch.schema}.users (username, password, first_name, last_name, email, matricule)
       VALUES ('test-admin', 'not-a-real-hash', 'Super', 'Admin', 'test-admin@local.local', 'U-0001') RETURNING id, username`,
    );
    await pool.query(
      `INSERT INTO ${branch.schema}.user_roles (user_id, role_id) SELECT $1, id FROM ${branch.schema}.roles WHERE name = 'Superadmin'`,
      [rows[0].id],
    );
    ctx.user = rows[0];
    sessionManager.createSession(ctx.event.sender, { id: ctx.user.id, username: ctx.user.username, roles: ALL_ROLES }, null);
  }

  ctx.resetDatabase = () => openFreshDatabase();

  ctx.rejectionMessage = async (promise) => {
    try {
      await promise;
    } catch (error) {
      return String(error && error.message);
    }
    throw new Error('Expected the call to fail, but it succeeded.');
  };

  let consoleSpies = [];
  const silence = (method) => {
    const spy = jest.spyOn(console, method).mockImplementation(() => {});
    consoleSpies.push(spy);
    return spy;
  };
  ctx.expectErrorLogs = () => silence('error');
  ctx.quietLogs = () => silence('log');
  afterEach(() => {
    consoleSpies.forEach((spy) => spy.mockRestore());
    consoleSpies = [];
  });

  beforeAll(async () => {
    electron = require('electron');
    sessionManager = require('../../../src/main/sessionManager');
    await openFreshDatabase();
    register.forEach((registerHandlers) => registerHandlers());
  });

  afterAll(async () => {
    if (sessionManager) sessionManager.revokeAllSessions();
    if (branch) {
      await pool.query(`DROP SCHEMA IF EXISTS ${branch.schema} CASCADE`);
      await pool.query('DELETE FROM platform.branches WHERE id = $1', [branch.id]);
    }
    await pool.end();
  });

  return ctx;
}

module.exports = { useRealDb, ALL_ROLES };
