// Before the browser tests: the platform administrator the fixtures sign in with. The
// database itself is emptied by `npm run test:e2e` (test/e2e/resetDb.js) before the server
// starts.
module.exports = async () => {
  process.env.DATABASE_URL = process.env.QAM_E2E_DATABASE_URL;
  const { migrateAll } = require('../../server/db/migrate');
  const { pool } = require('../../server/db/pool');
  const admins = require('../../server/services/platformAdmins');
  const { PLATFORM_ADMIN } = require('./fixtures');
  await migrateAll(() => {});
  const { rows } = await pool.query('SELECT 1 FROM platform.admins WHERE email = $1', [
    PLATFORM_ADMIN.email,
  ]);
  if (!rows.length) await admins.create({ ...PLATFORM_ADMIN, name: 'E2E' });
  await pool.end();
};
