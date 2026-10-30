// Restoring a backup (importManager.replaceDatabase) against a real encrypted database: a real
// backup comes back, a crafted one can only bring rows, and a restore that fails leaves the
// data as it was.
const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');
const { useRealDb } = require('./helpers/realDb');
const { addStudent, addTeacher } = require('./helpers/fixtures');
const { registerStudentHandlers } = require('../../src/main/handlers/studentHandlers');
const { registerTeacherHandlers } = require('../../src/main/handlers/teacherHandlers');
const { runBackup, decryptBackup } = require('../../src/main/backupManager');
const { validateDatabaseFile, replaceDatabase } = require('../../src/main/importManager');
const db = require('../../src/db/db');

const ctx = useRealDb({ register: [registerStudentHandlers, registerTeacherHandlers] });

const TRANSFER_KEY = 'branch-transfer-key-123';

const studentNames = () => ctx.all('SELECT name FROM students ORDER BY name').map((r) => r.name);
const migrationCount = () => ctx.get('SELECT count(*) AS n FROM migrations').n;

/** A backup the way versions before 1.3.0 wrote them: a plain ZIP, no signature. */
function writeUnsignedBackup(name, sql) {
  const zip = new PizZip();
  zip.file('backup.sql', sql);
  zip.file('salt.json', JSON.stringify({ 'db-salt': 'a1b2c3d4e5f60718293a4b5c6d7e8f90' }));
  const file = path.join(ctx.dir, name);
  fs.writeFileSync(file, zip.generate({ type: 'nodebuffer' }));
  return file;
}

beforeEach(async () => {
  await ctx.resetDatabase();
  ctx.setSettings({ association_transfer_key: TRANSFER_KEY });
  ctx.quietLogs();
});

describe('restore of a backup made by the app', () => {
  test('brings back the backed-up data and keeps the previous database aside', async () => {
    await addStudent(ctx, { name: 'في النسخة' });
    const backupFile = path.join(ctx.dir, 'backup.qdb');
    const backup = await runBackup({ association_transfer_key: TRANSFER_KEY }, backupFile);
    expect(backup.success).toBe(true);
    await addStudent(ctx, { name: 'بعد النسخة' });

    expect(await validateDatabaseFile(backupFile, undefined, TRANSFER_KEY)).toEqual(
      expect.objectContaining({ isValid: true, unsigned: false }),
    );
    const result = await replaceDatabase(backupFile, 'pw', undefined, {
      association_transfer_key: TRANSFER_KEY,
    });

    expect(result.success).toBe(true);
    expect(studentNames()).toEqual(['في النسخة']);
    expect(fs.existsSync(`${db.getDatabasePath()}.pre-restore`)).toBe(true);
  });

  test('a backup whose SQL was changed is refused', async () => {
    const backupFile = path.join(ctx.dir, 'backup.qdb');
    await runBackup({ association_transfer_key: TRANSFER_KEY }, backupFile);
    // Decrypt, change the SQL, and pack it again as a plain ZIP with the old signature.
    const { decryptBackup } = require('../../src/main/backupManager');
    const zip = new PizZip(await decryptBackup(fs.readFileSync(backupFile), TRANSFER_KEY));
    zip.file('backup.sql', `${zip.file('backup.sql').asText()}\nDROP TABLE teachers;`);
    const tampered = path.join(ctx.dir, 'tampered.qdb');
    fs.writeFileSync(tampered, zip.generate({ type: 'nodebuffer' }));

    expect(await validateDatabaseFile(tampered, undefined, TRANSFER_KEY)).toEqual({
      isValid: false,
      message: 'توقيع النسخة الاحتياطية غير مطابق. قد يكون الملف تالفاً أو تم تعديله.',
    });
  });
});

describe('restore of an unsigned backup (before 1.3.0)', () => {
  test('is flagged as unsigned', async () => {
    const file = writeUnsignedBackup('old.qdb', "REPLACE INTO students (name) VALUES ('x');");

    expect(await validateDatabaseFile(file, undefined, TRANSFER_KEY)).toEqual(
      expect.objectContaining({ isValid: true, unsigned: true }),
    );
  });

  test('only brings rows: no schema change, trigger, attached file or migration entry', async () => {
    const attached = path.join(ctx.dir, 'attached.sqlite');
    const migrations = migrationCount();
    const file = writeUnsignedBackup(
      'crafted.qdb',
      `DROP TABLE teachers;
       ATTACH DATABASE '${attached}' AS evil;
       CREATE TABLE evil.t (x);
       CREATE TRIGGER wipe AFTER INSERT ON students BEGIN DELETE FROM teachers; END;
       REPLACE INTO migrations (name) VALUES ('999-never-run.sql');
       INSERT INTO teachers (name) SELECT username FROM users;
       REPLACE INTO students (id, matricule, name, status) VALUES (1, 'S-0001', 'طالب قديم', 'active');`,
    );

    const result = await replaceDatabase(file, 'pw', undefined, {});

    expect(result.success).toBe(true);
    expect(studentNames()).toEqual(['طالب قديم']);
    expect(ctx.get("SELECT name FROM sqlite_master WHERE name = 'teachers'")).toBeDefined();
    expect(ctx.get("SELECT name FROM sqlite_master WHERE type = 'trigger'")).toBeUndefined();
    expect(fs.existsSync(attached)).toBe(false);
    expect(migrationCount()).toBe(migrations);
    expect(ctx.get("SELECT 1 AS yes FROM migrations WHERE name = '999-never-run.sql'")).toBe(
      undefined,
    );
    // A teacher can still be added: the table is the app's own.
    await addTeacher(ctx);
  });

  test('a restore that fails half-way leaves the data as it was', async () => {
    await addStudent(ctx, { name: 'يبقى' });
    // The second row breaks a NOT NULL constraint after the first went in.
    const file = writeUnsignedBackup(
      'broken.qdb',
      `REPLACE INTO students (id, name, status) VALUES (1, 'من النسخة', 'active');
       REPLACE INTO students (id, name, status) VALUES (2, NULL, 'active');`,
    );
    ctx.expectErrorLogs();

    const result = await replaceDatabase(file, 'pw', undefined, {});

    expect(result.success).toBe(false);
    expect(result.message).toContain('NOT NULL');
    expect(result.message).toContain('بقيت البيانات السابقة كما هي');
    expect(db.isDbOpen()).toBe(true);
    expect(studentNames()).toEqual(['يبقى']);
    expect(fs.existsSync(`${db.getDatabasePath()}.pre-restore`)).toBe(false);
    // The database works as before.
    await addStudent(ctx, { name: 'بعد الفشل' });
    expect(studentNames()).toEqual(['بعد الفشل', 'يبقى']);
  });
});

describe('roles of restored users', () => {
  const rolesOf = (username) =>
    ctx
      .all(
        `SELECT r.name FROM users u JOIN user_roles ur ON ur.user_id = u.id
         JOIN roles r ON r.id = ur.role_id WHERE u.username = ? ORDER BY r.name`,
        [username],
      )
      .map((r) => r.name);

  test('a backup from before user_roles (1.0/1.1) gives each user the role they had', async () => {
    const file = writeUnsignedBackup(
      'v1.0.qdb',
      `REPLACE INTO "users" ("id", "username", "password", "role", "status") VALUES
         (10, 'boss', 'h', 'Superadmin', 'active'),
         (11, 'manager', 'h', 'Manager', 'active'),
         (12, 'supervisor', 'h', 'SessionSupervisor', 'active'),
         (13, 'cashier', 'h', 'FinanceManager', 'active');`,
    );

    const result = await replaceDatabase(file, 'pw', undefined, {});

    expect(result.success).toBe(true);
    expect(rolesOf('boss')).toEqual(['Superadmin']);
    expect(rolesOf('manager')).toEqual(['Administrator']);
    expect(rolesOf('supervisor')).toEqual(['SessionSupervisor']);
    expect(rolesOf('cashier')).toEqual(['FinanceManager']);
  });

  test('a user of a recent backup without a role does not become Administrator', async () => {
    const file = writeUnsignedBackup(
      'recent.qdb',
      `REPLACE INTO "users" ("id", "username", "password", "status") VALUES
         (10, 'boss', 'h', 'active'), (11, 'no_role', 'h', 'active');
       REPLACE INTO "user_roles" ("user_id", "role_id")
         VALUES (10, (SELECT id FROM roles WHERE name = 'Superadmin'));`,
    );

    const result = await replaceDatabase(file, 'pw', undefined, {});

    expect(result.success).toBe(true);
    expect(rolesOf('boss')).toEqual(['Superadmin']);
    expect(rolesOf('no_role')).toEqual([]);
  });
});

describe('fee charges of a backup', () => {
  const MONTHLY_CHARGE = `INSERT INTO student_fee_charges
    (student_id, charge_date, fee_type, amount, amount_paid, status, academic_year, billing_month)
    VALUES (?, '2026-10-01', 'MONTHLY', 30, ?, ?, '2026-2027', '2026-2027-10')`;
  const charges = () => ctx.all('SELECT amount_paid, status FROM student_fee_charges ORDER BY id');
  const uniqueIndexes = () =>
    ctx
      .all(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'uq_fee_charges_%' ORDER BY name",
      )
      .map((row) => row.name);

  const backUpAndRestore = async () => {
    const backupFile = path.join(ctx.dir, 'backup.qdb');
    expect((await runBackup({ association_transfer_key: TRANSFER_KEY }, backupFile)).success).toBe(
      true,
    );
    return replaceDatabase(backupFile, 'pw', undefined, {
      association_transfer_key: TRANSFER_KEY,
    });
  };

  test('duplicate charges from before the unique index all come back, paid one included', async () => {
    const studentId = await addStudent(ctx);
    ctx.run('DROP INDEX uq_fee_charges_monthly');
    ctx.run(MONTHLY_CHARGE, [studentId, 30, 'PAID']);
    ctx.run(MONTHLY_CHARGE, [studentId, 0, 'UNPAID']);

    const result = await backUpAndRestore();

    expect(result.success).toBe(true);
    expect(charges()).toEqual([
      { amount_paid: 30, status: 'PAID' },
      { amount_paid: 0, status: 'UNPAID' },
    ]);
    // The index waits until the duplicates are gone.
    expect(uniqueIndexes()).toEqual(['uq_fee_charges_annual']);
  });

  test('a backup without duplicates gets the unique indexes back', async () => {
    const studentId = await addStudent(ctx);
    ctx.run(MONTHLY_CHARGE, [studentId, 30, 'PAID']);

    expect((await backUpAndRestore()).success).toBe(true);
    expect(charges()).toEqual([{ amount_paid: 30, status: 'PAID' }]);
    expect(uniqueIndexes()).toEqual(['uq_fee_charges_annual', 'uq_fee_charges_monthly']);
  });
});

describe('the migrations of a backup', () => {
  const MIGRATIONS_DIR = path.join(__dirname, '..', '..', 'src', 'db', 'migrations');
  const migrationFiles = () => fs.readdirSync(MIGRATIONS_DIR).sort();
  const header = (names) => `-- qdb-migrations: ${JSON.stringify(names)}`;
  const recordedMigrations = () =>
    ctx.all('SELECT name FROM migrations ORDER BY name').map((r) => r.name);

  test('a backup starts with the list of the migrations its database had', async () => {
    const backupFile = path.join(ctx.dir, 'backup.qdb');
    await runBackup({ association_transfer_key: TRANSFER_KEY }, backupFile);

    const zip = new PizZip(await decryptBackup(fs.readFileSync(backupFile), TRANSFER_KEY));
    const firstLine = zip.file('backup.sql').asText().split('\n')[0];

    expect(firstLine).toBe(header(migrationFiles()));
  });

  test('the rows of an older backup go through the migrations that came after it', async () => {
    // A backup made before migration 058, with the duplicate September charge 058 removes.
    const file = writeUnsignedBackup(
      'older.qdb',
      `${header(migrationFiles().filter((name) => name < '058'))}
       REPLACE INTO students (id, matricule, name, status) VALUES (1, 'S-0001', 'طالب', 'active');
       REPLACE INTO student_fee_charges
         (id, student_id, charge_date, fee_type, amount, amount_paid, status, academic_year, billing_month)
       VALUES (1, 1, '2026-08-25', 'MONTHLY', 30, 0, 'UNPAID', '2025-2026', '2025-2026-09'),
              (2, 1, '2026-09-01', 'MONTHLY', 30, 0, 'UNPAID', '2026-2027', '2026-2027-09');`,
    );

    const result = await replaceDatabase(file, 'pw', undefined, {});

    expect(result.success).toBe(true);
    expect(
      ctx
        .all("SELECT billing_month FROM student_fee_charges WHERE billing_month LIKE '%-09'")
        .map((r) => r.billing_month),
    ).toEqual(['2026-2027-09']);
    expect(recordedMigrations()).toEqual(migrationFiles());
  });

  test('a backup from a newer version of the app is refused, and the data stays', async () => {
    await addStudent(ctx, { name: 'يبقى' });
    const file = writeUnsignedBackup(
      'newer.qdb',
      `${header([...migrationFiles(), '999-from-a-newer-version.sql'])}
       REPLACE INTO students (id, name, status) VALUES (1, 'من النسخة', 'active');`,
    );

    expect(await validateDatabaseFile(file, undefined, TRANSFER_KEY)).toEqual(
      expect.objectContaining({ isValid: false, message: expect.stringContaining('إصدار أحدث') }),
    );
    const result = await replaceDatabase(file, 'pw', undefined, {});

    expect(result.success).toBe(false);
    expect(result.message).toContain('إصدار أحدث');
    expect(studentNames()).toEqual(['يبقى']);
  });

  test('a migration list that is not a list of migration names is refused', async () => {
    const file = writeUnsignedBackup(
      'garbled.qdb',
      `-- qdb-migrations: ["../../etc/passwd"]
       REPLACE INTO students (id, name, status) VALUES (1, 'من النسخة', 'active');`,
    );

    expect(await validateDatabaseFile(file, undefined, TRANSFER_KEY)).toEqual(
      expect.objectContaining({ isValid: false, message: 'ملف النسخ الاحتياطي غير صالح أو تالف.' }),
    );
  });
});
