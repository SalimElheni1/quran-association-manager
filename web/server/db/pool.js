// The PostgreSQL connection pool, with the result types better-sqlite3 would give.

const { Pool, types } = require('pg');
const { config } = require('../config');

// COUNT(*) and SUM(integer) are bigint, AVG is numeric: numbers in SQLite, strings in pg.
types.setTypeParser(types.builtins.INT8, (v) => (v === null ? null : Number(v)));
types.setTypeParser(types.builtins.NUMERIC, (v) => (v === null ? null : Number(v)));
// SQLite has no booleans: `x IS NULL` gives 0/1.
types.setTypeParser(types.builtins.BOOL, (v) => (v === null ? null : v === 't' ? 1 : 0));

const pool = new Pool({
  connectionString: config.databaseUrl,
  max: Number(process.env.PG_POOL_MAX) || 20,
  idleTimeoutMillis: 30000,
});

pool.on('error', (error) => {
  // An idle client lost its connection; the pool replaces it.
  console.error('[pg] idle client error:', error.message);
});

/**
 * Runs a platform query (schema-qualified SQL with $n parameters).
 * @param {string} text
 * @param {Array} [values]
 */
function query(text, values) {
  return pool.query(text, values);
}

/**
 * Runs fn with a client inside a transaction.
 * @template T
 * @param {(client: import('pg').PoolClient) => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, transaction };
