// Calls every desktop channel, as the browser would (rpc/dispatch.invoke), on a branch filled
// with realistic data: students, teachers, classes, attendance, fees, payments, transactions,
// inventory, groups, receipts, exports. A channel fails the sweep when it throws or answers
// with a database error (the SQLite → PostgreSQL translation is what this guards).
//   npm run test:sweep   (needs PostgreSQL; TEST_DATABASE_URL, default qam_sweep on localhost)

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/qam_sweep';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'qam-sweep-'));
process.env.LOG_LEVEL = 'error';

require('../server/bootstrap');
const { pool } = require('../server/db/pool');
const { migrateAll } = require('../server/db/migrate');
const branches = require('../server/services/branches');
const { invoke } = require('../server/rpc/dispatch');
const { loadHandlers } = require('../server/rpc/registry');
const uploads = require('../server/services/uploads');

const DB_ERROR = /syntax error|does not exist|operator|must appear in the GROUP BY|invalid input syntax|could not determine|is of type|ambiguous|violates|relation|function .* unknown|cannot cast|SQLITE_|constraint failed/i;

const SESSION = 'sweep-session';
const PASSWORD = 'Admin#2026';
const TRANSFER_KEY = 'Transfer#Key-2026';
const failures = [];
const results = {};
let branch;
let user;

async function callWithUploads(uploadIds, channel, ...args) {
  const out = await invoke({ branch, user, sessionId: SESSION, channel, args, uploadIds });
  results[channel] = out;
  return out.result;
}

async function call(channel, ...args) {
  if (process.env.SWEEP_DEBUG) fs.writeSync(2, `>> ${channel}\n`);
  try {
    const out = await invoke({ branch, user, sessionId: SESSION, channel, args });
    results[channel] = out;
    const r = out.result;
    const message = r && typeof r === 'object' && r.success === false ? String(r.message || r.error || '') : '';
    if (message && DB_ERROR.test(message)) failures.push(`${channel}: ${message}`);
    return r;
  } catch (error) {
    if (DB_ERROR.test(error.message) || !/[؀-ۿ]/.test(error.message)) {
      failures.push(`${channel}: THROW ${error.message}`);
    }
    results[channel] = { error: error.message };
    return undefined;
  }
}

async function freshDatabase() {
  const { rows } = await pool.query("SELECT nspname FROM pg_namespace WHERE nspname LIKE 'branch\\_%'");
  for (const { nspname } of rows) await pool.query(`DROP SCHEMA ${nspname} CASCADE`);
  await pool.query('DROP SCHEMA IF EXISTS platform CASCADE');
  await migrateAll(() => {});
}

test('every channel works on PostgreSQL', { timeout: 600000 }, async () => {
  await freshDatabase();
  loadHandlers();
  branch = await branches.create({ name: 'فرع الاختبار', slug: 'sweep' }, null);
  const { rows } = await pool.query(
    `INSERT INTO ${branch.schema}.users (username, password, first_name, last_name, matricule, national_id, phone_number)
     VALUES ('admin', $1, 'مدير', 'النظام', 'U-0001', '11111111', '22111111') RETURNING id`,
    [require('bcryptjs').hashSync(PASSWORD, 10)],
  );
  await pool.query(
    `INSERT INTO ${branch.schema}.user_roles (user_id, role_id) SELECT $1, id FROM ${branch.schema}.roles WHERE name = 'Superadmin'`,
    [rows[0].id],
  );
  user = { id: rows[0].id, username: 'admin', roles: ['Superadmin'] };

  // ---- Reference data and settings ----
  await call('settings:get');
  await call('settings:update', {
    national_association_name: 'الرابطة الوطنية للقرآن الكريم',
    local_branch_name: 'فرع الاختبار',
    annual_fee: 20,
    standard_monthly_fee: 15,
    academic_year_start_month: 9,
  });
  const logo = uploads.save(SESSION, {
    originalname: 'branch-logo.png',
    buffer: fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'g247.png')),
    size: 1,
  });
  const uploaded = await callWithUploads([logo.id], 'settings:uploadLogo');
  assert.ok(uploaded && uploaded.success, `logo upload: ${JSON.stringify(uploaded)}`);
  await call('settings:update', { regional_local_logo_path: uploaded.path });
  const shownLogo = await call('settings:getLogo');
  assert.strictEqual(shownLogo.path, `safe-image://${uploaded.path}`);
  const keySet = await call('backup:set-transfer-key', { password: PASSWORD, key: TRANSFER_KEY, confirmKey: TRANSFER_KEY });
  assert.ok(keySet && keySet.success, `transfer key: ${JSON.stringify(keySet)}`);
  await call('ageGroups:get');
  const ag = await call('ageGroups:create', { name: 'الكهول', min_age: 30, max_age: 60, gender: 'any', monthly_fee: 10, payment_frequency: 'MONTHLY' });
  const ageGroupId = ag?.ageGroupId;
  await call('ageGroups:update', ageGroupId, { name: 'الكهول (30-60)', min_age: 30, max_age: 60, gender: 'any', monthly_fee: 12, payment_frequency: 'MONTHLY' });
  await call('ageGroups:matchStudent', 35, 'Male');
  await call('ageGroups:validateStudentForClass', 35, 'Male', ageGroupId);
  await call('surahs:get');
  await call('hizbs:get');
  await call('accounts:get');
  await call('accounts:add', { name: 'الحساب البنكي', type: 'BANK', account_number: '123', initial_balance: 0 });
  await call('categories:get', 'INCOME');
  await call('categories:get', 'EXPENSE');

  // ---- People ----
  const teacher = await call('teachers:add', { name: 'الشيخ أحمد', contact_info: '22123456', gender: 'Male', email: 'ahmed@example.org', years_of_experience: '' });
  await call('teachers:get', { searchTerm: 'أحمد' });
  await call('teachers:getById', teacher?.id);
  await call('teachers:update', teacher?.id, { name: 'الشيخ أحمد بن علي', contact_info: '22123456', gender: 'Male' });

  const studentIds = [];
  for (let i = 0; i < 6; i += 1) {
    const s = await call('students:add', {
      name: `طالب ${i}`,
      gender: i % 2 ? 'Female' : 'Male',
      date_of_birth: i < 3 ? '1990-01-0' + (i + 1) : '2015-03-0' + (i + 1),
      status: 'active',
      fee_category: i === 5 ? 'EXEMPT' : 'CAN_PAY',
      contact_info: '2212345' + i,
      memorization_surah_ids: [1, 2],
      memorization_hizb_ids: [1],
    });
    if (s?.id) studentIds.push(s.id);
  }
  assert.ok(studentIds.length >= 5, 'students were created');
  await call('students:get', {});
  await call('students:get', { searchTerm: 'طالب', genderFilter: 'Male', page: 1, limit: 10 });
  await call('students:getById', studentIds[0]);
  await call('students:update', studentIds[0], { name: 'طالب 0 المعدل', gender: 'Male', date_of_birth: '1990-01-01', status: 'active', fee_category: 'CAN_PAY' });
  await call('students:getByAgeGroup', ageGroupId);

  // ---- Classes and groups ----
  const klass = await call('classes:add', {
    name: 'حلقة الفجر',
    teacher_id: teacher?.id,
    age_group_id: ageGroupId,
    schedule: JSON.stringify([{ day: 'Monday', time: 'after_fajr' }, { day: 'Thursday', time: 'after_fajr' }]),
    status: 'active',
    capacity: 20,
    gender: 'all',
    start_date: '2026-09-01',
  });
  const classId = klass?.id;
  await call('classes:get', {});
  await call('classes:getById', classId);
  await call('classes:getForStudent', { age: 36, gender: 'Male' });
  await call('classes:getEnrollmentData', { classId, classAgeGroupId: ageGroupId });
  await call('classes:updateEnrollments', { classId, studentIds: studentIds.slice(0, 3) });
  await call('classes:update', classId, { name: 'حلقة الفجر', teacher_id: teacher?.id, age_group_id: ageGroupId, status: 'active', capacity: 25, gender: 'all' });

  const group = await call('groups:add', { name: 'مجموعة الحفاظ', description: 'وصف', category: 'Men' });
  const groupId = group?.data?.id;
  await call('groups:get', {});
  await call('groups:addStudentToGroup', { studentId: studentIds[0], groupId });
  await call('groups:getGroupStudents', groupId);
  await call('groups:getStudentGroups', studentIds[0]);
  await call('groups:getAssignmentData', groupId);
  await call('groups:updateGroupStudents', { groupId, studentIds: studentIds.slice(0, 2) });
  await call('groups:getEligibleGroupsForClass', classId);
  await call('groups:getEligibleStudentsForGroup', 'Men');
  await call('groups:removeStudentFromGroup', { studentId: studentIds[1], groupId });
  await call('groups:update', groupId, { name: 'مجموعة الحفاظ', description: 'وصف جديد', category: 'Men' });

  // ---- Attendance ----
  await call('attendance:getClassesForDay', '2026-10-26');
  await call('attendance:getStudentsForClass', classId);
  await call('attendance:save', { classId, date: '2026-10-26', records: { [studentIds[0]]: 'present', [studentIds[1]]: 'absent', [studentIds[2]]: 'late' } });
  await call('attendance:getForDate', { classId, date: '2026-10-26' });
  await call('db:get-attendance-summary-for-class', classId);
  await call('get-dashboard-stats');
  await call('get-todays-classes');

  // ---- Fees ----
  await call('student-fees:getAcademicYear');
  const year = '2026-2027';
  await call('student-fees:generateAllCharges', year, false);
  await call('student-fees:getAll', year);
  await call('student-fees:getStatus', studentIds[0], year);
  await call('student-fees:getBalanceSummary', studentIds[0], year);
  await call('student-fees:getFeeGroup', studentIds[0]);
  await call('student-fees:setFeeGroup', { studentId: studentIds[0], ageGroupId });
  const payment = await call('student-fees:recordPayment', { student_id: studentIds[0], amount: 30, payment_method: 'CASH', academic_year: year });
  await call('student-fees:recordPayment', { student_id: studentIds[1], amount: 12, payment_method: 'CASH', academic_year: year });
  await call('student-fees:getPaymentHistory', { studentId: studentIds[0], academicYear: year });
  await call('student-fees:getClassesWithSpecialFees', studentIds[0]);
  await call('student-fees:refreshStudentCharges', { studentId: studentIds[0], academicYear: year });
  await call('student-fees:refreshAllStudentCharges', { academicYear: year });
  await call('student-fees:generateMonthlyCharges', { academicYear: year, month: 11 });
  await call('student-fees:generateAnnualCharges', year);
  const paymentId = payment?.paymentId || payment?.payment?.id || payment?.id;
  if (paymentId) await call('student-fees:refundPayment', { paymentId });
  await call('fee-charges:runManualCheck', false);

  // ---- Transactions, receipts, inventory ----
  const tx = await call('transactions:add', { type: 'INCOME', category: 'التبرعات النقدية', amount: 100, transaction_date: '2026-10-05', description: 'تبرع', payment_method: 'CASH', voucher_number: 'V-10', account_id: 1 });
  await call('transactions:add', { type: 'EXPENSE', category: 'كراء وفواتير', amount: 40, transaction_date: '2026-10-06', description: 'كراء', payment_method: 'CASH', voucher_number: 'E-10', account_id: 1 });
  await call('transactions:get', {});
  await call('transactions:get', { type: 'INCOME', startDate: '2026-10-01', endDate: '2026-10-31', search: 'تبرع' });
  await call('transactions:update', tx?.id, { type: 'INCOME', category: 'التبرعات النقدية', amount: 110, transaction_date: '2026-10-05', description: 'تبرع معدل', payment_method: 'CASH', voucher_number: 'V-10', account_id: 1 });
  await call('transactions:get-earliest-date');
  await call('financial:get-summary', { startDate: '2026-10-01', endDate: '2026-10-31' });
  await call('financial:get-summary', 2026);
  await call('financial:reconcile');
  await call('in-kind-categories:get', {});
  const cat = await call('in-kind-categories:add', 'أثاث');
  await call('in-kind-categories:update', cat?.id || cat?.categoryId, 'أثاث وتجهيزات');
  const item = await call('inventory:add', { item_name: 'مصحف', category: 'كتب ومراجع', quantity: 10, unit_value: 15, acquisition_date: '2026-10-01', acquisition_source: 'donation', condition_status: 'New' });
  await call('inventory:get', {});
  await call('inventory:check-uniqueness', { itemName: 'مصحف' });
  await call('inventory:update', { id: item?.id, item_name: 'مصحف', category: 'كتب ومراجع', quantity: 12, unit_value: 15, acquisition_date: '2026-10-01', condition_status: 'New' });
  await call('receipt-books:get', {});
  await call('receipt-books:add', { book_number: 'B-1', start_receipt_number: 1, end_receipt_number: 50, receipt_type: 'payment', issued_date: '2026-10-01' });
  const books = await call('receipt-books:get', {});
  const book = Array.isArray(books) ? books[0] : (books?.books || books?.data || [])[0];
  await call('receipt-books:update', { ...book, notes: 'دفتر الوصولات' });
  await call('receipt-books:get-active', 'payment');
  await call('receipt-books:get-next-number', 'payment');
  await call('receipt-books:check-exists', { receiptNumber: '5', receiptType: 'payment' });
  await call('receipts:getStats', 2026);
  await call('receipts:generate', { type: 'payment' });
  await call('receipts:validate', 'R-1');

  // ---- Users and profile ----
  await call('users:get', {});
  const added = await call('users:add', { username: 'finance1', password: 'Finance#2026', first_name: 'أمين', last_name: 'المال', national_id: '22222222', phone_number: '22222222', roles: ['FinanceManager'], employment_type: 'volunteer' });
  await call('users:getById', added?.id);
  await call('users:update', { id: added?.id, userData: { username: 'finance1', first_name: 'أمين', last_name: 'المال', national_id: '22222222', phone_number: '22222222', roles: ['FinanceManager', 'SessionSupervisor'], status: 'active' } });
  await call('users:updateGuide', { id: user.id, guideData: { need_guide: 0, current_step: 3 } });
  await call('auth:getProfile');
  await call('auth:updateProfile', { profileData: { username: 'admin', first_name: 'مدير', last_name: 'النظام', national_id: '11111111', phone_number: '22111111', status: 'active' } });

  // ---- Exports (each must produce a file to download) ----
  const exportsToRun = [
    ['students', [{ header: 'الرقم', key: 'matricule' }, { header: 'الاسم', key: 'name' }]],
    ['teachers', [{ header: 'الاسم', key: 'name' }, { header: 'الهاتف', key: 'contact_info' }]],
    ['admins', [{ header: 'اسم المستخدم', key: 'username' }, { header: 'الاسم', key: 'first_name' }]],
    ['classes', [{ header: 'الفصل', key: 'name' }, { header: 'المعلم', key: 'teacher_name' }]],
    ['attendance', [{ header: 'الطالب', key: 'student_name' }, { header: 'الحالة', key: 'status' }]],
    ['inventory', [{ header: 'العنصر', key: 'item_name' }, { header: 'الكمية', key: 'quantity' }]],
    ['student-fees', [{ header: 'الطالب', key: 'student_name' }, { header: 'المبلغ', key: 'amount' }]],
    ['expenses', [{ header: 'الفئة', key: 'category' }, { header: 'المبلغ', key: 'amount' }]],
    ['income', [{ header: 'الفئة', key: 'category' }, { header: 'المبلغ', key: 'amount' }]],
  ];
  const noFile = [];
  for (const [exportType, columns] of exportsToRun) {
    for (const format of ['xlsx', 'pdf', 'docx']) {
      const options = exportType === 'attendance' ? { startDate: '2026-10-01', endDate: '2026-10-31', classId } : {};
      const r = await call('export:generate', { exportType, format, columns, options });
      const out = results['export:generate'];
      if (r && r.success && !(out.downloads && out.downloads.length)) noFile.push(`${exportType}.${format}`);
      if (r && !r.success && !/No data/.test(r.message)) noFile.push(`${exportType}.${format}: ${r.message}`);
    }
  }
  const period = { startDate: '2026-09-01', endDate: '2026-10-31' };
  for (const [channel, arg] of [
    ['financial-export:cash-ledger', { period }],
    ['financial-export:inventory-ledger', undefined],
    ['financial-export:inventory-register', { period }],
    ['financial-export:financial-summary', { period }],
    ['financial-export:word-report', { period }],
    ['import:generate-template', undefined],
    ['generate-import-template', {}],
    ['backup:run', {}],
  ]) {
    const r = arg === undefined ? await call(channel) : await call(channel, arg);
    const out = results[channel];
    if (!out.downloads || !out.downloads.length) noFile.push(`${channel}: ${String(JSON.stringify(r)).slice(0, 200)}`);
  }

  // ---- Backup round trip: the downloaded .qdb, uploaded back and restored ----
  const downloads = require('../server/services/downloads');
  const backupFile = downloads.take(results['backup:run'].downloads[0].id, SESSION);
  const countStudents = async () =>
    (await pool.query(`SELECT COUNT(*) AS n FROM ${branch.schema}.students`)).rows[0].n;
  const before = await countStudents();
  await pool.query(`DELETE FROM ${branch.schema}.attendance`);
  const upload = uploads.save(SESSION, { originalname: 'backup.qdb', buffer: fs.readFileSync(backupFile.path), size: 1 });
  const restored = await call('db:import', { password: PASSWORD, filePath: upload.id, backupPassword: TRANSFER_KEY });
  assert.ok(restored && restored.success, `restore: ${JSON.stringify(restored)}`);
  assert.strictEqual(await countStudents(), before, 'the restore brings every student back');
  const attendance = (await pool.query(`SELECT COUNT(*) AS n FROM ${branch.schema}.attendance`)).rows[0].n;
  assert.strictEqual(attendance, 3, 'the restore brings the attendance back');

  // ---- Excel import: the import template, uploaded back ----
  await call('import:get-sheets');

  // ---- Deletes and restores ----
  await call('students:delete', studentIds[4]);
  await call('students:restore', studentIds[4]);
  await call('inventory:delete', item?.id);
  await call('inventory:restore', item?.id);
  await call('transactions:delete', tx?.id);
  await call('groups:delete', groupId);
  await call('groups:restore', groupId);
  await call('users:delete', added?.id);
  await call('users:restore', added?.id);
  await call('teachers:delete', teacher?.id);
  await call('teachers:restore', teacher?.id);
  await call('classes:delete', classId);
  await call('classes:restore', classId);
  await call('backup:getStatus');
  await call('backup:get-reminder-status');
  await call('student-fees:resetCharges', year);
  const changed = await call('auth:updatePassword', {
    passwordData: { current_password: PASSWORD, new_password: 'New#Admin-2026', confirm_new_password: 'New#Admin-2026' },
  });
  assert.ok(changed && changed.success, `password change: ${JSON.stringify(changed)}`);

  // ---- Every registered channel was called at least once (or is known not to need it) ----
  const notCalled = [...loadHandlers().keys()].filter(
    (ch) =>
      !(ch in results) &&
      !/^web:|^logs:|^auth:(login|setup)|^dialog:|^app:|^get-(is-packaged|initial|app)|^db:import|^import:(excel|execute|get-sheet-info)|^backup:reveal|^financial:export-|^export:generate-dev|delete|restore|deletePayment|in-kind-categories:delete/.test(ch),
  );

  if (process.env.SWEEP_DEBUG) {
    for (const [ch, out] of Object.entries(results)) {
      const r = out && out.result;
      if (out.error || (r && r.success === false)) fs.writeSync(2, `SOFT ${ch}: ${out.error || r.message}\n`);
    }
    for (const ch of ['groups:add', 'teachers:add', 'classes:add', 'inventory:add', 'in-kind-categories:add', 'student-fees:recordPayment', 'users:add']) {
      fs.writeSync(2, `RESULT ${ch}: ${JSON.stringify(results[ch]).slice(0, 300)}\n`);
    }
  }
  uploads.cleanup();
  await pool.end();

  assert.deepStrictEqual(failures, [], `Channels failing on PostgreSQL:\n${failures.join('\n')}`);
  assert.deepStrictEqual(noFile, [], `Exports without a file:\n${noFile.join('\n')}`);
  assert.deepStrictEqual(notCalled, [], `Channels the sweep does not cover:\n${notCalled.join('\n')}`);
});
