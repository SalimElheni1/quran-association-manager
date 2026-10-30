// import:excel against a real database and real Excel files: a sheet is only imported by a user
// holding the roles of the channel that writes its records, and the users sheet cannot hand out
// unknown roles or take the last Superadmin's role away.
const path = require('path');
const ExcelJS = require('exceljs');
const { useRealDb } = require('./helpers/realDb');
const { registerImportHandlers } = require('../../src/main/handlers/importHandlers');

const ctx = useRealDb({ register: [registerImportHandlers] });

const USER_HEADERS = [
  'اسم المستخدم',
  'الاسم الأول',
  'اللقب',
  'الدور',
  'نوع التوظيف',
  'الرقم التعريفي',
];
const STUDENT_HEADERS = ['الاسم واللقب', 'الجنس'];

let fileCounter = 0;

/** Writes an .xlsx with one sheet: a title row, the header row, then the data rows. */
async function workbook(sheetName, headers, rows) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet(sheetName);
  sheet.addRow([sheetName]);
  sheet.addRow(headers);
  rows.forEach((row) => sheet.addRow(headers.map((header) => row[header] ?? null)));
  const file = path.join(ctx.dir, `import-${++fileCounter}.xlsx`);
  await book.xlsx.writeFile(file);
  return file;
}

const userCount = () => ctx.get('SELECT count(*) AS n FROM users').n;
const rolesOf = (userId) =>
  ctx
    .all(
      'SELECT r.name FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = ?',
      [userId],
    )
    .map((r) => r.name)
    .sort();

beforeEach(async () => {
  await ctx.resetDatabase();
  ctx.run("UPDATE users SET status = 'active' WHERE id = ?", [ctx.user.id]);
});

describe('import:excel: each sheet needs the roles of its own write channel', () => {
  const newSuperadmin = {
    'اسم المستخدم': 'intruder',
    'الاسم الأول': 'Intruder',
    اللقب: 'X',
    الدور: 'Superadmin',
    'نوع التوظيف': 'volunteer',
  };

  test('a FinanceManager cannot import users (no account is created)', async () => {
    const file = await workbook('المستخدمون', USER_HEADERS, [newSuperadmin]);
    const before = userCount();

    const result = await ctx.invokeAs(['FinanceManager'], 'import:excel', file, ['المستخدمون']);

    expect(result).toEqual({ success: false, message: 'ليست لديك صلاحية استيراد: المستخدمون.' });
    expect(userCount()).toBe(before);
  });

  test('an Administrator cannot import users either', async () => {
    const file = await workbook('المستخدمون', USER_HEADERS, [newSuperadmin]);

    const result = await ctx.invokeAs(['Administrator'], 'import:excel', file, ['المستخدمين']);

    expect(result.success).toBe(false);
    expect(ctx.get("SELECT id FROM users WHERE username = 'intruder'")).toBeUndefined();
  });

  test('a FinanceManager cannot import students', async () => {
    const file = await workbook('الطلاب', STUDENT_HEADERS, [{ 'الاسم واللقب': 'طالب مستورد' }]);

    const result = await ctx.invokeAs(['FinanceManager'], 'import:excel', file, ['الطلاب']);

    expect(result).toEqual({ success: false, message: 'ليست لديك صلاحية استيراد: الطلاب.' });
    expect(ctx.get('SELECT count(*) AS n FROM students').n).toBe(0);
  });

  test('an Administrator imports students', async () => {
    const file = await workbook('الطلاب', STUDENT_HEADERS, [{ 'الاسم واللقب': 'طالب مستورد' }]);

    const result = await ctx.invokeAs(['Administrator'], 'import:excel', file, ['الطلاب']);

    expect(result.success).toBe(true);
    expect(result.data.successCount).toBe(1);
    expect(ctx.get('SELECT name FROM students').name).toBe('طالب مستورد');
  });

  test('a call without a sheet list imports nothing', async () => {
    const file = await workbook('الطلاب', STUDENT_HEADERS, [{ 'الاسم واللقب': 'طالب' }]);

    const result = await ctx.invoke('import:excel', file, []);

    expect(result.success).toBe(false);
    expect(ctx.get('SELECT count(*) AS n FROM students').n).toBe(0);
  });
});

describe('import:excel: the users sheet (Superadmin)', () => {
  test('creates the account with a random 10-character password', async () => {
    const file = await workbook('المستخدمون', USER_HEADERS, [
      {
        'اسم المستخدم': 'amina',
        'الاسم الأول': 'Amina',
        اللقب: 'B',
        الدور: 'محاسب',
        'نوع التوظيف': 'volunteer',
      },
    ]);

    const result = await ctx.invoke('import:excel', file, ['المستخدمون']);

    expect(result.data.errors).toEqual([]);
    const [created] = result.data.newUsers;
    expect(created.username).toBe('amina');
    expect(created.password).toMatch(/^[a-zA-Z2-9]{10}$/);
    const user = ctx.get("SELECT id FROM users WHERE username = 'amina'");
    expect(rolesOf(user.id)).toEqual(['FinanceManager']);
  });

  test('refuses an unknown role and leaves the existing roles alone', async () => {
    const matricule = ctx.get('SELECT matricule FROM users WHERE id = ?', [ctx.user.id]).matricule;
    ctx.run(
      "INSERT INTO users (username, password, first_name, last_name, matricule) VALUES ('sami', 'x', 'Sami', 'K', 'U-0900')",
    );
    const sami = ctx.get("SELECT id FROM users WHERE username = 'sami'");
    ctx.run(
      "INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE name = 'SessionSupervisor'",
      [sami.id],
    );
    const file = await workbook('المستخدمون', USER_HEADERS, [
      {
        'اسم المستخدم': 'sami',
        'الاسم الأول': 'Sami',
        اللقب: 'K',
        الدور: 'Owner',
        'نوع التوظيف': 'volunteer',
        'الرقم التعريفي': 'U-0900',
      },
    ]);

    const result = await ctx.invoke('import:excel', file, ['المستخدمون']);

    expect(result.data.errors).toEqual(['[المستخدمون] Row 3: الدور "Owner" غير معروف.']);
    expect(rolesOf(sami.id)).toEqual(['SessionSupervisor']);
    expect(matricule).toBeTruthy();
  });

  test("cannot take the last active Superadmin's role away", async () => {
    const { matricule } = ctx.get('SELECT matricule FROM users WHERE id = ?', [ctx.user.id]);
    const file = await workbook('المستخدمون', USER_HEADERS, [
      {
        'اسم المستخدم': 'test-admin',
        'الاسم الأول': 'Super',
        اللقب: 'Admin',
        الدور: 'Administrator',
        'نوع التوظيف': 'volunteer',
        'الرقم التعريفي': matricule,
      },
    ]);

    const result = await ctx.invoke('import:excel', file, ['المستخدمون']);

    expect(result.data.successCount).toBe(0);
    expect(result.data.errors[0]).toContain('آخر مدير نظام');
    expect(rolesOf(ctx.user.id)).toEqual(['Superadmin']);
  });
});
