// A backup made by the desktop app's own code restores into a branch, and the desktop users
// sign in on the web with their old passwords.
//   npm run test:import   (needs PostgreSQL; TEST_DATABASE_URL, default qam_import_test)

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/qam_import_test';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qam-import-'));
process.env.LOG_LEVEL = 'error';

require('../server/bootstrap');
const { pool } = require('../server/db/pool');
const { migrateAll } = require('../server/db/migrate');
const branches = require('../server/services/branches');
const uploads = require('../server/services/uploads');
const { invoke } = require('../server/rpc/dispatch');
const { createApp } = require('../server/app');

const KEY = 'Desktop#Transfer-Key-2026';

test(
  'a desktop .qdb restores into a branch and its users sign in',
  { timeout: 120000 },
  async () => {
    const { rows } = await pool.query(
      "SELECT nspname FROM pg_namespace WHERE nspname LIKE 'branch\\_%'",
    );
    for (const { nspname } of rows) await pool.query(`DROP SCHEMA ${nspname} CASCADE`);
    await pool.query('DROP SCHEMA IF EXISTS platform CASCADE');
    await migrateAll(() => {});

    const qdb = path.join(process.env.DATA_DIR, 'desktop.qdb');
    execFileSync(process.execPath, [
      path.join(__dirname, 'helpers', 'makeDesktopBackup.js'),
      qdb,
      KEY,
    ]);
    assert.ok(fs.statSync(qdb).size > 1000, 'the desktop backup was written');

    const branch = await branches.create({ name: 'فرع الويب', slug: 'from-desktop' }, null);
    // The person restoring: the branch's web Superadmin.
    const bcrypt = require('bcryptjs');
    const { rows: admin } = await pool.query(
      `INSERT INTO ${branch.schema}.users (username, password, first_name, last_name, matricule)
     VALUES ('webadmin', $1, 'مدير', 'الويب', 'U-0001') RETURNING id`,
      [bcrypt.hashSync('Web#Pass-2026', 10)],
    );
    const user = { id: admin[0].id, username: 'webadmin', roles: ['Superadmin'] };
    const upload = uploads.save('s1', {
      originalname: 'desktop.qdb',
      buffer: fs.readFileSync(qdb),
      size: 1,
    });

    const wrongKey = await invoke({
      branch,
      user,
      sessionId: 's1',
      channel: 'db:import',
      args: [{ password: 'Web#Pass-2026', filePath: upload.id, backupPassword: 'not-the-key' }],
    });
    assert.strictEqual(wrongKey.result.success, false, 'a wrong key is refused');

    const out = await invoke({
      branch,
      user,
      sessionId: 's1',
      channel: 'db:import',
      args: [{ password: 'Web#Pass-2026', filePath: upload.id, backupPassword: KEY }],
    });
    assert.strictEqual(out.result.success, true, JSON.stringify(out.result));

    const count = async (sql) => (await pool.query(sql)).rows[0].n;
    assert.strictEqual(await count(`SELECT COUNT(*) AS n FROM ${branch.schema}.students`), 2);
    assert.strictEqual(
      await count(`SELECT COUNT(*) AS n FROM ${branch.schema}.users`),
      2,
      'the desktop users replace the branch users',
    );
    assert.strictEqual(
      await count(`SELECT COUNT(*) AS n FROM ${branch.schema}.attendance`),
      2,
      'the orphan attendance row is dropped',
    );
    assert.strictEqual(
      await count(
        `SELECT COUNT(*) AS n FROM ${branch.schema}.teachers WHERE years_of_experience IS NULL`,
      ),
      1,
      "'' in an INTEGER column becomes NULL",
    );
    const { rows: setting } = await pool.query(
      `SELECT value FROM ${branch.schema}.settings WHERE key = 'local_branch_name'`,
    );
    assert.strictEqual(setting[0].value, 'فرع سطح المكتب');
    assert.ok(
      fs.existsSync(
        path.join(
          process.env.DATA_DIR,
          'branches',
          String(branch.id),
          'assets',
          'logos',
          'desk-logo.png',
        ),
      ),
      'the logo came along',
    );

    // New rows get new ids after the imported ones.
    const added = await invoke({
      branch,
      user: { id: 1, username: 'deskadmin', roles: ['Superadmin'] },
      sessionId: 's1',
      channel: 'students:add',
      args: [{ name: 'طالب جديد', gender: 'Male', status: 'active' }],
    });
    assert.strictEqual(added.result.id, 3);

    // The desktop users sign in on the web with their desktop passwords.
    const server = createApp().listen(0);
    const port = server.address().port;
    const login = async (username, password) => {
      const res = await fetch(`http://localhost:${port}/api/b/${branch.slug}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-QAM': '1' },
        body: JSON.stringify({ username, password }),
      });
      return res.json();
    };
    const desk = await login('deskadmin', 'Desk#Pass1');
    assert.strictEqual(desk.success, true, JSON.stringify(desk));
    assert.deepStrictEqual(desk.user.roles, ['Superadmin']);
    const finance = await login('deskfinance', 'Desk#Pass1');
    assert.deepStrictEqual(finance.user.roles, ['FinanceManager']);
    assert.strictEqual(
      (await login('webadmin', 'Web#Pass-2026')).success,
      false,
      'the restore replaced the users',
    );
    server.close();
    await pool.end();
  },
);
