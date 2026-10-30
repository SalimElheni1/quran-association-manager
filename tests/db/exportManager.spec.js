// export:generate's data queries (exportManager.fetchExportData) against the real schema: every
// column key an export screen offers produces valid SQL and comes back under its own key, and a
// key that is not on the list never reaches the database.
const fs = require('fs');
const path = require('path');
const { useRealDb } = require('./helpers/realDb');
const { addStudent, addTeacher, addAgeGroup, addClass } = require('./helpers/fixtures');
const { registerStudentHandlers } = require('../../src/main/handlers/studentHandlers');
const { registerTeacherHandlers } = require('../../src/main/handlers/teacherHandlers');
const { registerClassHandlers } = require('../../src/main/handlers/classHandlers');
const { registerSettingsHandlers } = require('../../src/main/handlers/settingsHandlers');
const { fetchExportData } = require('../../src/main/exportManager');

const ctx = useRealDb({
  register: [
    registerStudentHandlers,
    registerTeacherHandlers,
    registerClassHandlers,
    () => registerSettingsHandlers(async () => {}),
  ],
});

const RENDERER = path.join(__dirname, '..', '..', 'src', 'renderer');

// The field lists each export screen hands to ExportModal, read from the screens themselves so
// this test follows them.
const SCREENS = {
  students: ['pages/StudentsPage.jsx', ['studentsAdultFields', 'studentsKidsFields']],
  teachers: ['pages/TeachersPage.jsx', ['teachersFields']],
  admins: ['pages/UsersPage.jsx', ['adminsFields']],
  classes: ['pages/ClassesPage.jsx', ['classesFields']],
  attendance: ['pages/AttendancePage.jsx', ['attendanceFields']],
  inventory: ['components/financial/InventoryTab.jsx', ['inventoryFields']],
  'student-fees': ['components/financial/StudentFeesTab.jsx', ['studentPaymentFields']],
  expenses: ['pages/ExpensesPage.jsx', ['expenseFields']],
  income: ['pages/IncomePage.jsx', ['incomeFields']],
};

function screenKeys(type) {
  const [file, arrays] = SCREENS[type];
  const source = fs.readFileSync(path.join(RENDERER, file), 'utf8');
  const keys = new Set();
  for (const name of arrays) {
    const start = source.indexOf(`${name} = [`);
    if (start === -1) throw new Error(`${name} not found in ${file}`);
    const block = source.slice(start, source.indexOf('];', start));
    for (const match of block.matchAll(/key:\s*'([^']+)'/g)) keys.add(match[1]);
  }
  return [...keys];
}

const TRANSFER_KEY = 'branch-transfer-key-123';
const PERIOD = { startDate: '2026-01-01', endDate: '2026-12-31' };

beforeEach(async () => {
  await ctx.resetDatabase();
  ctx.setSettings({ association_transfer_key: TRANSFER_KEY });

  const ageGroupId = await addAgeGroup(ctx);
  const teacherId = await addTeacher(ctx);
  const classId = await addClass(ctx, { age_group_id: ageGroupId, teacher_id: teacherId });
  const studentId = await addStudent(ctx);
  ctx.run('INSERT INTO class_students (class_id, student_id) VALUES (?, ?)', [classId, studentId]);
  ctx.run(
    "INSERT INTO attendance (class_id, student_id, date, status) VALUES (?, ?, ?, 'present')",
    [classId, studentId, '2026-10-05'],
  );
  ctx.run(
    `INSERT INTO student_payments (student_id, amount, payment_method, academic_year, class_id,
       sponsor_name, payment_date)
     VALUES (?, 30, 'CASH', '2026-2027', ?, 'كافل', '2026-10-05 10:00:00')`,
    [studentId, classId],
  );
  for (const type of ['INCOME', 'EXPENSE']) {
    ctx.run(
      `INSERT INTO transactions (type, category, amount, transaction_date, description,
         payment_method, account_id, created_by_user_id)
       VALUES (?, 'تبرعات', 10, '2026-10-05', 'وصف', 'CASH', 1, ?)`,
      [type, ctx.user.id],
    );
  }
  ctx.run(
    `INSERT INTO inventory_items (matricule, item_name, category, quantity, unit_value, total_value)
     VALUES ('INV-0001', 'مصحف', 'كتب', 3, 5, 15)`,
  );
});

describe('fetchExportData with the real schema', () => {
  test.each(Object.keys(SCREENS))(
    '%s: every key the screen offers is exported under that key',
    async (type) => {
      const keys = screenKeys(type);
      expect(keys.length).toBeGreaterThan(0);

      const rows = await fetchExportData({ type, fields: keys, options: PERIOD });

      expect(rows.length).toBeGreaterThan(0);
      expect(Object.keys(rows[0]).sort()).toEqual([...keys].sort());
    },
  );

  test.each(Object.keys(SCREENS))(
    '%s: a key that is an SQL expression never reaches the database',
    async (type) => {
      const [firstKey] = screenKeys(type);
      const injected =
        "(SELECT value FROM settings WHERE key='association_transfer_key') AS leaked";

      const rows = await fetchExportData({
        type,
        fields: [firstKey, injected, 'u.password', 'password'],
        options: PERIOD,
      });

      expect(JSON.stringify(rows)).not.toContain(TRANSFER_KEY);
      expect(Object.keys(rows[0])).toEqual([firstKey]);
    },
  );

  test("students' memorisation column lists their memorised surahs and hizbs", async () => {
    const [student] = ctx.all('SELECT id FROM students');
    const fatiha = ctx.get('SELECT id, name_ar FROM surahs ORDER BY id LIMIT 1');
    const hizb = ctx.get('SELECT id, hizb_number FROM hizbs ORDER BY id LIMIT 1');
    ctx.run('INSERT INTO student_surahs (student_id, surah_id) VALUES (?, ?)', [
      student.id,
      fatiha.id,
    ]);
    ctx.run('INSERT INTO student_hizbs (student_id, hizb_id) VALUES (?, ?)', [student.id, hizb.id]);

    const [row] = await fetchExportData({ type: 'students', fields: ['memorization_level'] });

    expect(row.memorization_level).toBe(`${fatiha.name_ar} الحزب ${hizb.hizb_number}`);
  });

  test('a student who memorised nothing has an empty memorisation column', async () => {
    const [row] = await fetchExportData({ type: 'students', fields: ['memorization_level'] });

    expect(row.memorization_level).toBeNull();
  });
});
