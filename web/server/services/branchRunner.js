// Runs code "inside a branch": a fresh request context bound to the branch's schema, with its
// electron-store values loaded, and everything released afterwards.

const context = require('../context');
const adapter = require('../db/adapter');
const { pool } = require('../db/pool');

async function loadKv(branchId) {
  const { rows } = await pool.query(
    'SELECT store, key, value FROM platform.branch_kv WHERE branch_id = $1',
    [branchId],
  );
  const kv = new Map();
  for (const row of rows) {
    if (!kv.has(row.store)) kv.set(row.store, {});
    kv.get(row.store)[row.key] = row.value;
  }
  return kv;
}

async function flushKv(ctx) {
  if (!ctx.kvDirty.size || !ctx.branch) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const entry of ctx.kvDirty) {
      const [store, key] = JSON.parse(entry);
      const values = ctx.kv.get(store) || {};
      if (values[key] === undefined) {
        await client.query(
          'DELETE FROM platform.branch_kv WHERE branch_id = $1 AND store = $2 AND key = $3',
          [ctx.branch.id, store, key],
        );
      } else {
        await client.query(
          `INSERT INTO platform.branch_kv (branch_id, store, key, value) VALUES ($1, $2, $3, $4)
           ON CONFLICT (branch_id, store, key) DO UPDATE SET value = EXCLUDED.value`,
          [ctx.branch.id, store, key, JSON.stringify(values[key])],
        );
      }
    }
    await client.query('COMMIT');
    ctx.kvDirty.clear();
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * @template T
 * @param {import('../context').BranchRef} branch
 * @param {Partial<import('../context').RequestContext>} init
 * @param {(ctx: import('../context').RequestContext) => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function runInBranch(branch, init, fn) {
  const ctx = context.createContext({ ...init, branch });
  return context.run(ctx, async () => {
    try {
      ctx.kv = await loadKv(branch.id);
      const result = await fn(ctx);
      await flushKv(ctx);
      return result;
    } finally {
      await adapter.releaseContext(ctx);
    }
  });
}

module.exports = { runInBranch };
