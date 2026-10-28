// Creates the platform schema and the compat functions once, before the test files run.
module.exports = async () => {
  require('./setupEnv');
  const { migrateAll } = require('../../server/db/migrate');
  const { pool } = require('../../server/db/pool');
  await migrateAll(() => {});
  // Branch schemas left by an earlier run.
  const { rows } = await pool.query("SELECT nspname FROM pg_namespace WHERE nspname LIKE 'branch\\_%'");
  for (const { nspname } of rows) await pool.query(`DROP SCHEMA ${nspname} CASCADE`);
  await pool.query('TRUNCATE platform.branches RESTART IDENTITY CASCADE');
  await pool.end();
};
