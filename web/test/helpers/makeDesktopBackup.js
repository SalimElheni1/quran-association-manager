#!/usr/bin/env node
// Makes a backup file exactly as the desktop app does (src/main/backupManager.js runBackup),
// from a desktop-schema SQLite database holding a small branch, including the kind of data a
// real desktop database can have (an empty string in an INTEGER column, an attendance row of a
// student that no longer exists). Runs in its own process, outside the web bootstrap, with the
// desktop modules wired to that SQLite database.
//   node makeDesktopBackup.js <output.qdb> <transfer key>

const Module = require('module');
const os = require('os');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { buildDesktopSqlite } = require('../../server/db/desktopSchema');

const [output, transferKey] = process.argv.slice(2);
const ROOT = path.resolve(__dirname, '..', '..', '..');
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'qam-desktop-'));
const db = buildDesktopSqlite();

// The desktop modules, wired to this database.
const memoryStores = new Map();
class Store {
  constructor(options = {}) {
    const name = options.name || 'config';
    if (!memoryStores.has(name)) memoryStores.set(name, new Map());
    this.data = memoryStores.get(name);
  }
  get(k, d) {
    return this.data.has(k) ? this.data.get(k) : d;
  }
  set(k, v) {
    this.data.set(k, v);
  }
  has(k) {
    return this.data.has(k);
  }
  delete(k) {
    this.data.delete(k);
  }
}
const stubs = {
  electron: {
    app: { getPath: () => userData, isPackaged: true, getVersion: () => '1.4.0' },
    safeStorage: { isEncryptionAvailable: () => false },
  },
  'electron-store': Store,
  [path.join(ROOT, 'src', 'db', 'db.js')]: {
    allQuery: async (sql, params = []) => db.prepare(sql).all(...params),
    getQuery: async (sql, params = []) => db.prepare(sql).get(...params),
    runQuery: async (sql, params = []) => db.prepare(sql).run(...params),
  },
};
const originalLoad = Module._load;
Module._load = function load(request, parent, ...rest) {
  if (stubs[request]) return stubs[request];
  try {
    const resolved = Module._resolveFilename(request, parent, ...rest);
    if (stubs[resolved]) return stubs[resolved];
  } catch {
    // resolved by the original loader below
  }
  return originalLoad.call(this, request, parent, ...rest);
};

// A small desktop branch.
const hash = bcrypt.hashSync('Desk#Pass1', 10);
db.prepare(
  "INSERT INTO users (id, username, password, first_name, last_name, matricule, status) VALUES (1, 'deskadmin', ?, 'مدير', 'سطح المكتب', 'U-0001', 'active')",
).run(hash);
db.prepare(
  "INSERT INTO users (id, username, password, first_name, last_name, matricule, status) VALUES (2, 'deskfinance', ?, 'أمين', 'المال', 'U-0002', 'active')",
).run(hash);
db.prepare(
  "INSERT INTO user_roles (user_id, role_id) SELECT 1, id FROM roles WHERE name = 'Superadmin'",
).run();
db.prepare(
  "INSERT INTO user_roles (user_id, role_id) SELECT 2, id FROM roles WHERE name = 'FinanceManager'",
).run();
db.prepare(
  "INSERT INTO teachers (id, name, matricule, years_of_experience) VALUES (1, 'الشيخ أحمد', 'T-0001', '')",
).run();
db.prepare(
  "INSERT INTO students (id, matricule, name, gender, date_of_birth, status) VALUES (1, 'S-0001', 'يوسف بن علي', 'Male', '2014-02-03', 'active'), (2, 'S-0002', 'آمنة الطرابلسي', 'Female', '2013-07-08', 'active')",
).run();
db.prepare(
  "INSERT INTO classes (id, name, teacher_id, status, age_group_id) VALUES (1, 'حلقة الفجر', 1, 'active', 1)",
).run();
db.prepare('INSERT INTO class_students (class_id, student_id) VALUES (1, 1), (1, 2)').run();
db.prepare(
  "INSERT INTO attendance (student_id, class_id, date, status) VALUES (1, 1, '2026-10-20', 'present'), (2, 1, '2026-10-20', 'absent'), (99, 1, '2026-10-20', 'present')",
).run();
db.prepare(
  "INSERT OR REPLACE INTO settings (key, value) VALUES ('local_branch_name', 'فرع سطح المكتب'), ('association_transfer_key', ?)",
).run(transferKey);
fs.mkdirSync(path.join(userData, 'assets', 'logos'), { recursive: true });
fs.copyFileSync(
  path.join(ROOT, 'public', 'g247.png'),
  path.join(userData, 'assets', 'logos', 'desk-logo.png'),
);

(async () => {
  const backupManager = require(path.join(ROOT, 'src', 'main', 'backupManager.js'));
  const result = await backupManager.runBackup({ association_transfer_key: transferKey }, output);
  if (!result.success) throw new Error(result.message);
  fs.rmSync(userData, { recursive: true, force: true });
  console.log(JSON.stringify({ ok: true, size: result.size }));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
