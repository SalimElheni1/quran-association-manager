/**
 * Real-world scenario, phase 1: run the app the way a branch would over its first weeks —
 * 120+ students (Excel import + manual), teachers, classes for every age group, bulk
 * enrollments, staff accounts per role, fees and payments, income, expenses, in-kind
 * donations, inventory and attendance — then check the app at that scale and leave a
 * backup + manifest in tests/e2e/realworld/.handoff for phase 2 (02-continue.e2e.js).
 */
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const {
  test,
  expect,
  navigate,
  modal,
  expectNoModal,
  expectToast,
  setupSuperadmin,
  login,
  logout,
  dismissOnboarding,
  createUser,
  SUPERADMIN,
} = require('../fixtures');
const {
  HANDOFF_DIR,
  ARTIFACTS_DIR,
  preserveAppData,
  buildStudents,
  TEACHERS,
  CLASSES,
  USERS,
  INCOMES,
  EXPENSES,
  writeManifest,
} = require('./data');

const ASSOCIATION = {
  national: 'الرابطة الوطنية للقرآن الكريم',
  regional: 'الفرع الجهوي بصفاقس',
  local: 'فرع ساقية الزيت',
  president: 'الحبيب بن صالح المستيري',
};
const ANNUAL_FEE = 120;
// Backups are encrypted with this key so another install can restore them; without it they
// are encrypted with this machine's own database key.
const TRANSFER_KEY = 'sakiet-ezzit-transfer-2026';
const IN_KIND = { itemName: 'مصاحف مجلدة', category: 'كتب ومراجع', quantity: 20, unitValue: 12 };
const INVENTORY = [
  { itemName: 'سبورة بيضاء كبيرة', category: 'أخرى', quantity: 3, unitValue: 90 },
  { itemName: 'كراسي خشبية', category: 'أخرى', quantity: 40, unitValue: 25 },
  { itemName: 'حاسوب مكتبي', category: 'إلكترونيات', quantity: 1, unitValue: 1200 },
];

const MANUAL_STUDENTS = [
  { name: 'عبد الله بن منصف البوغانمي', dob: yearsAgo(8), gender: 'Male', group: 'children' },
  { name: 'آية بنت حسين الكعبي', dob: yearsAgo(9), gender: 'Female', group: 'children' },
  { name: 'نادر بن رضا الورتاني', dob: yearsAgo(34), gender: 'Male', group: 'men' },
];

function yearsAgo(years) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setDate(d.getDate() - 30);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

function midMonthDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-15`;
}

const activePane = (page) => page.locator('.tab-pane.active');

async function openTab(page, title) {
  const tab = page.getByRole('tab', { name: title, exact: true });
  if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}

function formatNumber(page, value) {
  return page.evaluate(
    (v) =>
      new Intl.NumberFormat('ar-TN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
        v,
      ),
    value,
  );
}

// SummaryCard renders the value in the h3 right after its .card-title; cards can sit inside
// another card's body (fees tab), so anchor on the title, not on a containing .card-body.
function summaryValue(page, title) {
  return activePane(page)
    .locator('.card-title', { hasText: title })
    .locator('xpath=following-sibling::h3');
}

async function stubDialogs(electronApp, { saveTo, openFile, openDir }) {
  await electronApp.evaluate(
    ({ dialog }, target) => {
      if (target.saveTo) {
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: target.saveTo });
      }
      if (target.openFile || target.openDir) {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [target.openFile || target.openDir],
        });
      }
    },
    { saveTo, openFile, openDir },
  );
}

async function writeStudentWorkbook(filePath, students) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('الطلاب');
  sheet.views = [{ rightToLeft: true }];
  sheet.addRow(['⚠️ لا تعدل عناوين الأعمدة']);
  sheet.addRow(['الاسم واللقب', 'تاريخ الميلاد', 'الجنس', 'رقم الهاتف', 'الحالة']);
  students.forEach((s) => sheet.addRow([s.name, s.dob, s.genderAr, s.phone, 'نشط']));
  await workbook.xlsx.writeFile(filePath);
}

async function importStudents(page, electronApp, filePath, expectedCount) {
  await stubDialogs(electronApp, { openFile: filePath });
  await navigate(page, 'شؤون الطلاب');
  await page.getByRole('button', { name: 'استيراد البيانات' }).click();
  await modal(page).getByRole('button', { name: 'بدء معالج الاستيراد' }).click();
  const wizard = page.locator('.modal.show').last();
  await expect(wizard.locator('.modal-title')).toContainText('استيراد البيانات من Excel');
  await wizard.getByRole('button', { name: 'تصفح الملفات' }).click();
  await expect(wizard.locator('.card', { hasText: 'سجل ناجح' }).locator('.display-4')).toHaveText(
    String(expectedCount),
    { timeout: 60_000 },
  );
  await wizard.getByRole('button', { name: 'إغلاق' }).click();
  await modal(page).getByRole('button', { name: 'إغلاق' }).click();
  await expectNoModal(page);
}

async function addStudentManually(page, s) {
  await navigate(page, 'شؤون الطلاب');
  await page.getByRole('button', { name: 'إضافة طالب' }).click();
  await modal(page).locator('#formStudentName').fill(s.name);
  await modal(page).locator('#formStudentDob').fill(s.dob);
  await modal(page).locator('#formStudentGender').selectOption(s.gender);
  await modal(page).getByRole('button', { name: 'إضافة الطالب' }).click();
  await expectToast(page, 'success', `تمت إضافة الطالب "${s.name}" بنجاح!`);
  await expectNoModal(page);
}

async function addTeacher(page, t) {
  await page.getByRole('button', { name: 'إضافة معلم' }).click();
  await modal(page).locator('input[name="name"]').fill(t.name);
  await modal(page).locator('input[name="contact_info"]').fill(t.phone);
  await modal(page).locator('select[name="gender"]').selectOption(t.gender);
  await modal(page).getByRole('button', { name: 'إضافة المعلم' }).click();
  await expectToast(page, 'success', `تمت إضافة المعلم "${t.name}" بنجاح!`);
  await expectNoModal(page);
}

const WEEKDAYS_AR = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

async function addClass(page, c) {
  await page.getByRole('button', { name: 'إضافة فصل' }).click();
  const form = modal(page);
  await form.locator('input[name="name"]').fill(c.name);
  const option = form.locator('select[name="age_group_id"] option', { hasText: c.ageGroup });
  await form
    .locator('select[name="age_group_id"]')
    .selectOption(await option.getAttribute('value'));
  await form.locator('select[name="teacher_id"]').selectOption({ label: TEACHERS[c.teacher].name });
  if (c.status !== 'pending') await form.locator('select[name="status"]').selectOption('active');
  if (c.today) {
    await form
      .locator('label', { hasText: 'اليوم' })
      .locator('..')
      .locator('select')
      .selectOption(WEEKDAYS_AR[new Date().getDay()]);
    await form.locator('button', { hasText: 'بعد صلاة الفجر' }).first().click();
  }
  await form.getByRole('button', { name: 'إضافة الفصل' }).click();
  await expectToast(page, 'success', `تمت إضافة الفصل "${c.name}" بنجاح!`);
  await expectNoModal(page);
}

async function enrollStudents(page, className, names) {
  await navigate(page, 'الفصول الدراسية');
  await page
    .locator('tbody tr', { hasText: className })
    .locator('button.btn-outline-primary')
    .first()
    .click();
  await expect(modal(page).locator('.modal-title')).toContainText(className);
  const available = modal(page).locator('.enrollment-list').nth(1);
  for (const name of names) {
    await available
      .locator('.list-group-item', { hasText: name })
      .locator('input[type="checkbox"]')
      .check();
  }
  await modal(page)
    .getByRole('button', { name: `تسجيل (${names.length})` })
    .click();
  const enrolled = modal(page).locator('.enrollment-list').first();
  await expect(enrolled.locator('.list-group-item')).toHaveCount(names.length);
  await modal(page).getByRole('button', { name: 'حفظ التغييرات' }).click();
  await expectToast(page, 'success', 'تم تحديث قائمة الطلاب بنجاح!');
  await expectNoModal(page);
}

async function addTransaction(page, kind, t) {
  await openTab(page, kind === 'income' ? 'المداخيل' : 'المصاريف');
  await activePane(page)
    .getByRole('button', { name: kind === 'income' ? 'إضافة مدخول' : 'إضافة مصروف' })
    .click();
  const form = modal(page);
  await form.locator('input[name="transaction_date"]').fill(midMonthDate());
  if (t.category) await form.locator('select[name="category"]').selectOption(t.category);
  await form.locator('input[name="voucher_number"]').fill(t.voucher);
  if (t.receiptType) await form.locator('select[name="receipt_type"]').selectOption(t.receiptType);
  await form.locator('input[name="amount"]').fill(String(t.amount));
  if (t.paymentMethod) {
    await form.locator('select[name="payment_method"]').selectOption(t.paymentMethod);
    await form.locator('input[name="check_number"]').fill(t.check);
  }
  await form.getByRole('button', { name: 'حفظ' }).click();
  await expectToast(
    page,
    'success',
    kind === 'income' ? 'تم إضافة المدخول بنجاح' : 'تم إضافة المصروف بنجاح',
  );
  await modal(page).getByRole('button', { name: 'إغلاق', exact: true }).click();
  await expectNoModal(page);
}

async function recordFeePayment(page, name, amount, receipt) {
  const search = activePane(page).getByPlaceholder('البحث بالاسم...');
  await search.fill(name);
  const row = activePane(page).locator('tbody tr', { hasText: name });
  await expect(activePane(page).locator('tbody tr')).toHaveCount(1);
  await row.locator('button.btn-success').click();
  await expect(modal(page).locator('.modal-title')).toHaveText('تسجيل دفعة جديدة');
  await modal(page).locator('input[type="number"]').first().fill(String(amount));
  await modal(page).getByPlaceholder('أدخل رقم الوصل').fill(receipt);
  await modal(page).getByRole('button', { name: 'تسجيل الدفعة' }).click();
  await expectToast(page, 'success', 'تم تسجيل الدفعة بنجاح');
  await expectNoModal(page);
  await search.clear();
}

async function markAttendance(page, className, marks) {
  await navigate(page, 'الحضور والغياب');
  await page.locator('#classSelect').selectOption({ label: className });
  for (const [name, status] of marks) {
    await page.locator('tbody tr', { hasText: name }).getByRole('button', { name: status }).click();
  }
  await page.getByRole('button', { name: 'حفظ التغييرات' }).click();
  await expectToast(page, 'success', 'تم حفظ سجل الحضور بنجاح!');
  await expect(page.getByText('هذا السجل محفوظ ومغلق للتعديل')).toBeVisible();
}

async function relogin(page, user) {
  await logout(page);
  await login(page, user);
  await dismissOnboarding(page);
  await expect(page.locator('.topbar')).toBeVisible();
}

test('real-world seed: run a branch at scale and leave a backup for phase 2', async ({
  page,
  electronApp,
}) => {
  test.setTimeout(30 * 60_000);
  fs.rmSync(HANDOFF_DIR, { recursive: true, force: true });
  fs.mkdirSync(HANDOFF_DIR, { recursive: true });
  // A new seed starts a new set of artifacts (phase 2 adds its own folder).
  fs.rmSync(ARTIFACTS_DIR, { recursive: true, force: true });
  const artifacts = path.join(ARTIFACTS_DIR, '01-seed');
  fs.mkdirSync(artifacts, { recursive: true });

  const imported = buildStudents();
  const allStudents = [...imported, ...MANUAL_STUDENTS];
  const byGroup = (group) => allStudents.filter((s) => s.group === group).map((s) => s.name);
  const enrollments = {};
  const fees = { full: [], partial: [], byFinanceUser: [] };

  await test.step('first run: superadmin and association settings', async () => {
    await setupSuperadmin(page);
    await login(page);
    await dismissOnboarding(page);
    await navigate(page, 'الإعدادات');
    await page.locator('input[name="national_association_name"]').fill(ASSOCIATION.national);
    await page.locator('input[name="regional_association_name"]').fill(ASSOCIATION.regional);
    await page.locator('input[name="local_branch_name"]').fill(ASSOCIATION.local);
    await page.locator('input[name="president_full_name"]').fill(ASSOCIATION.president);
    await openTab(page, 'إعدادات الرسوم');
    await page.locator('input[name="annual_fee"]').fill(String(ANNUAL_FEE));
    await page.getByRole('button', { name: 'حفظ جميع التغييرات' }).click();
    await expectToast(page, 'success', /تم تحديث الإعدادات بنجاح/);
  });

  await test.step('staff accounts for every role', async () => {
    for (const user of Object.values(USERS)) await createUser(page, user, user.role);
  });

  await test.step(`import ${imported.length} students from Excel, add 3 by hand`, async () => {
    const workbook = path.join(artifacts, 'imported-students.xlsx');
    await writeStudentWorkbook(workbook, imported);
    await importStudents(page, electronApp, workbook, imported.length);
    for (const s of MANUAL_STUDENTS) await addStudentManually(page, s);
    await navigate(page, 'شؤون الطلاب');
    await expect(page.getByText(`من أصل ${allStudents.length} عنصر`)).toBeVisible();
  });

  await test.step(`${TEACHERS.length} teachers`, async () => {
    await navigate(page, 'شؤون المعلمين');
    for (const t of TEACHERS) await addTeacher(page, t);
  });

  await test.step(`${CLASSES.length} classes, 3 of them meeting today`, async () => {
    await navigate(page, 'الفصول الدراسية');
    for (const c of CLASSES) await addClass(page, c);
    await expect(page.locator('tbody tr')).toHaveCount(CLASSES.length);
  });

  await test.step('bulk enrollments per age group', async () => {
    const taken = new Set();
    for (const c of CLASSES.filter((x) => x.enroll > 0)) {
      const names = byGroup(c.group)
        .filter((n) => !taken.has(n))
        .slice(0, c.enroll);
      names.forEach((n) => taken.add(n));
      await enrollStudents(page, c.name, names);
      enrollments[c.name] = names;
    }
  });

  await test.step('income, expenses, in-kind donation and inventory', async () => {
    await navigate(page, 'الشؤون المالية');
    for (const t of INCOMES) await addTransaction(page, 'income', t);
    for (const t of EXPENSES) await addTransaction(page, 'expense', t);

    await openTab(page, 'الجرد');
    for (const item of INVENTORY) {
      await activePane(page).getByRole('button', { name: 'إضافة صنف جديد' }).click();
      const form = modal(page);
      await form.locator('input[name="item_name"]').fill(item.itemName);
      await form.locator('select[name="category"]').selectOption(item.category);
      await form.locator('input[name="quantity"]').fill(String(item.quantity));
      await form.locator('input[name="unit_value"]').fill(String(item.unitValue));
      await form.getByRole('button', { name: 'إضافة الصنف' }).click();
      await expectToast(page, 'success', 'تمت إضافة الصنف بنجاح.');
      await expectNoModal(page);
    }
    await activePane(page).locator('button.btn-success', { hasText: 'إضافة تبرع عيني' }).click();
    const form = modal(page);
    await form.locator('input[name="transaction_date"]').fill(midMonthDate());
    await form.locator('input[name="item_name"]').fill(IN_KIND.itemName);
    await form.locator('select[name="item_category"]').selectOption(IN_KIND.category);
    await form.locator('input[name="quantity"]').fill(String(IN_KIND.quantity));
    await form.locator('input[name="unit_value"]').fill(String(IN_KIND.unitValue));
    await form.getByRole('button', { name: 'حفظ' }).click();
    await expectToast(page, 'success', 'تم إضافة التبرع العيني بنجاح');
    await expectNoModal(page);
    await expect(activePane(page).locator('tbody tr')).toHaveCount(INVENTORY.length + 1);
  });

  await test.step('annual fees: generate charges, record full and partial payments', async () => {
    await openTab(page, 'رسوم الطلاب');
    await activePane(page).getByRole('button', { name: 'توليد الرسوم' }).click();
    await modal(page).getByRole('button', { name: 'توليد الرسوم' }).click();
    await expectToast(page, 'success', 'تم إنشاء جميع الرسوم بنجاح');
    await expectNoModal(page);

    const payers = allStudents.map((s) => s.name);
    fees.full = payers.slice(0, 10);
    fees.partial = payers.slice(10, 15);
    let receipt = 1;
    for (const name of fees.full) {
      await recordFeePayment(page, name, ANNUAL_FEE, `RW-FEE-${receipt++}`);
    }
    for (const name of fees.partial) {
      await recordFeePayment(page, name, 50, `RW-FEE-${receipt++}`);
    }
  });

  await test.step('today: attendance for the first children class', async () => {
    const names = enrollments[CLASSES[0].name];
    await markAttendance(page, CLASSES[0].name, [
      [names[0], 'غياب'],
      [names[1], 'غياب'],
      [names[2], 'غياب'],
      [names[3], 'تأخر'],
      [names[4], 'تأخر'],
    ]);
  });

  await test.step('session supervisor takes attendance for the second children class', async () => {
    await relogin(page, USERS.supervisor);
    await markAttendance(page, CLASSES[1].name, [[enrollments[CLASSES[1].name][0], 'غياب']]);
  });

  await test.step('finance manager records two more fee payments', async () => {
    await relogin(page, USERS.finance);
    await navigate(page, 'الشؤون المالية');
    await openTab(page, 'رسوم الطلاب');
    fees.byFinanceUser = allStudents.slice(15, 17).map((s) => s.name);
    await recordFeePayment(page, fees.byFinanceUser[0], ANNUAL_FEE, 'RW-FEE-FM-1');
    await recordFeePayment(page, fees.byFinanceUser[1], ANNUAL_FEE, 'RW-FEE-FM-2');
    await relogin(page, SUPERADMIN);
  });

  const feeIncome =
    (fees.full.length + fees.byFinanceUser.length) * ANNUAL_FEE + fees.partial.length * 50;
  const incomeTotal =
    INCOMES.reduce((sum, t) => sum + t.amount, 0) +
    IN_KIND.quantity * IN_KIND.unitValue +
    feeIncome;
  const expenseTotal = EXPENSES.reduce((sum, t) => sum + t.amount, 0);
  const transactionCount =
    INCOMES.length + EXPENSES.length + 1 + fees.full.length + fees.partial.length + 2;

  await test.step('home dashboard at scale', async () => {
    await navigate(page, 'الرئيسية');
    const stat = (title) => page.locator('.stat-card', { hasText: title }).locator('.card-text');
    await expect(stat('الطلاب النشطون')).toHaveText(String(allStudents.length));
    await expect(stat('المعلمون')).toHaveText(String(TEACHERS.length));
    await expect(stat('الفصول النشطة')).toHaveText(
      String(CLASSES.filter((c) => c.status !== 'pending').length),
    );
    for (const c of CLASSES.filter((x) => x.today)) {
      await expect(
        page.locator('.todays-classes-list .list-group-item', { hasText: c.name }),
      ).toBeVisible();
    }
  });

  await test.step('students list: pagination and search over 120+ students', async () => {
    await navigate(page, 'شؤون الطلاب');
    await expect(page.getByText(`عرض 1 إلى 25 من أصل ${allStudents.length} عنصر`)).toBeVisible();
    await page
      .locator('select', { has: page.locator('option[value="100"]') })
      .first()
      .selectOption('100');
    await expect(page.locator('table.students-table tbody tr')).toHaveCount(100);
    await page.getByRole('button', { name: 'التالي' }).click();
    await expect(page.locator('table.students-table tbody tr')).toHaveCount(
      allStudents.length - 100,
    );
    const target = imported[77].name;
    await page.getByPlaceholder('البحث بالاسم أو الرقم التعريفي...').fill(target);
    await expect(page.locator('table.students-table tbody tr')).toHaveCount(1);
    await expect(page.locator('table.students-table tbody tr')).toContainText(target);
  });

  await test.step('financial dashboard totals', async () => {
    await navigate(page, 'الشؤون المالية');
    await openTab(page, 'لوحة التحكم');
    await expect(summaryValue(page, 'إجمالي المداخيل')).toContainText(
      await formatNumber(page, incomeTotal),
    );
    await expect(summaryValue(page, 'إجمالي المصاريف')).toContainText(
      await formatNumber(page, expenseTotal),
    );
    await expect(summaryValue(page, 'الرصيد الصافي')).toContainText(
      await formatNumber(page, incomeTotal - expenseTotal),
    );
    await expect(summaryValue(page, 'عدد العمليات')).toContainText(
      await formatNumber(page, transactionCount),
    );
  });

  await test.step('fee status summary', async () => {
    await openTab(page, 'رسوم الطلاب');
    const paid = fees.full.length + fees.byFinanceUser.length;
    await expect(summaryValue(page, 'عدد الطلاب المسددين')).toContainText(
      await formatNumber(page, paid),
    );
    await expect(summaryValue(page, 'الطلاب الذين دفعوا جزئياً')).toContainText(
      await formatNumber(page, fees.partial.length),
    );
    await expect(summaryValue(page, 'الطلاب غير المسددين')).toContainText(
      await formatNumber(page, allStudents.length - paid - fees.partial.length),
    );
  });

  await test.step('export every student to Excel', async () => {
    const exportPath = path.join(artifacts, 'exported-students.xlsx');
    await stubDialogs(electronApp, { saveTo: exportPath });
    await navigate(page, 'شؤون الطلاب');
    await page.getByRole('button', { name: 'تصدير البيانات' }).click();
    await modal(page).getByRole('button', { name: 'تصدير إلى Excel' }).click();
    await expectToast(page, 'success', 'تم تصدير الملف بنجاح!');
    await modal(page).getByRole('button', { name: 'إغلاق' }).click();
    await expectNoModal(page);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(exportPath);
    const cells = [];
    workbook.getWorksheet('الطلاب').eachRow((row) => cells.push(...row.values.map(String)));
    for (const s of [imported[0], imported[119], MANUAL_STUDENTS[2]]) {
      expect(cells).toContain(s.name);
    }
  });

  await test.step('export the financial report (Word) and the cash ledger (Excel)', async () => {
    await navigate(page, 'الشؤون المالية');
    await openTab(page, 'التقارير المالية');
    for (const [file, button, success] of [
      ['financial-report.docx', 'تصدير التقرير المالي (Word)', 'تم تصدير التقرير المالي بنجاح!'],
      ['cash-ledger.xlsx', 'تصدير سجل المحاسبة (Excel)', 'تم تصدير سجل المحاسبة بنجاح!'],
    ]) {
      const target = path.join(artifacts, file);
      await stubDialogs(electronApp, { saveTo: target });
      await activePane(page).getByRole('button', { name: button }).click();
      await expect(activePane(page).locator('.alert-success', { hasText: success })).toBeVisible();
      expect(fs.statSync(target).size).toBeGreaterThan(0);
    }
  });

  await test.step('manual backup into the handoff folder', async () => {
    const backupDir = path.join(HANDOFF_DIR, 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    await stubDialogs(electronApp, { openDir: backupDir });
    await navigate(page, 'الإعدادات');
    await openTab(page, 'النسخ الاحتياطي');
    await activePane(page).locator('input[name="association_transfer_key"]').fill(TRANSFER_KEY);
    await page.getByRole('button', { name: 'حفظ جميع التغييرات' }).click();
    await expectToast(page, 'success', /تم تحديث الإعدادات بنجاح/);
    await activePane(page).getByRole('button', { name: 'اختيار...' }).click();
    await activePane(page).getByRole('button', { name: 'نسخ احتياطي الآن' }).click();
    await expectToast(page, 'success', /تم إنشاء النسخة الاحتياطية بنجاح/);
    const backups = fs.readdirSync(backupDir).filter((f) => f.endsWith('.qdb'));
    expect(backups).toHaveLength(1);
    fs.copyFileSync(path.join(backupDir, backups[0]), path.join(HANDOFF_DIR, 'realworld.qdb'));
    fs.copyFileSync(path.join(backupDir, backups[0]), path.join(artifacts, 'backup.qdb'));
  });

  writeManifest({
    createdAt: new Date().toISOString(),
    backupFile: 'realworld.qdb',
    transferKey: TRANSFER_KEY,
    superadmin: SUPERADMIN,
    users: USERS,
    association: ASSOCIATION,
    settings: { annualFee: ANNUAL_FEE },
    students: {
      total: allStudents.length,
      imported: imported.length,
      manual: MANUAL_STUDENTS.map((s) => s.name),
      sample: [imported[0], imported[50], imported[119]].map((s) => s.name),
    },
    teachers: TEACHERS.map((t) => t.name),
    classes: CLASSES.map((c) => ({
      name: c.name,
      ageGroup: c.ageGroup,
      teacher: TEACHERS[c.teacher].name,
      status: c.status || 'active',
      meetsToday: !!c.today,
      enrolled: enrollments[c.name] || [],
    })),
    finance: {
      incomes: INCOMES,
      expenses: EXPENSES,
      inKind: IN_KIND,
      inventory: INVENTORY,
      incomeTotal,
      expenseTotal,
      transactionCount,
    },
    fees: {
      paidInFull: [...fees.full, ...fees.byFinanceUser],
      partial: fees.partial,
      partialAmount: 50,
      unpaidCount:
        allStudents.length - fees.full.length - fees.byFinanceUser.length - fees.partial.length,
    },
    attendanceToday: {
      [CLASSES[0].name]: {
        absent: enrollments[CLASSES[0].name].slice(0, 3),
        late: enrollments[CLASSES[0].name].slice(3, 5),
      },
      [CLASSES[1].name]: { absent: enrollments[CLASSES[1].name].slice(0, 1), late: [] },
    },
  });
  fs.copyFileSync(
    path.join(HANDOFF_DIR, 'manifest.json'),
    path.join(ARTIFACTS_DIR, 'manifest.json'),
  );
  writeArtifactsReadme();

  await test.step('preserve the app data for inspection', async () => {
    await preserveAppData(electronApp, path.join(artifacts, 'app-data'));
  });
});

function writeArtifactsReadme() {
  const users = Object.values(USERS)
    .map((u) => `| ${u.role} | \`${u.username}\` | \`${u.password}\` |`)
    .join('\n');
  const readme = `# Real-world e2e scenario — artifacts

Generated by \`npm run test:e2e:realworld\` on ${new Date().toISOString()}.
Everything the scenario created is described in \`manifest.json\`.

## Open the data in the app

    npm run e2e:open-data            # after phase 2 (restored on a "new PC" + more work)
    npm run e2e:open-data -- 01-seed # right after phase 1

This opens a copy, so the artifacts here never change.

| Role | Username | Password |
|---|---|---|
| Superadmin | \`${SUPERADMIN.username}\` | \`${SUPERADMIN.password}\` |
${users}

Association transfer key (needed to restore the backups on another install): \`${TRANSFER_KEY}\`

## Files

- \`01-seed/\` — phase 1, a branch run at scale (${buildStudents().length + MANUAL_STUDENTS.length} students, ${TEACHERS.length} teachers, ${CLASSES.length} classes)
  - \`imported-students.xlsx\` — the workbook imported through the import wizard
  - \`exported-students.xlsx\` — the students export
  - \`financial-report.docx\` — monthly financial report (Word)
  - \`cash-ledger.xlsx\` — cash ledger export
  - \`backup.qdb\` — encrypted backup (restore it with the transfer key)
  - \`app-data/\` — the app's data folder (database + key store)
- \`02-continue/\` — phase 2, the backup restored on a fresh install plus more work
  - \`exported-students.xlsx\`, \`backup.qdb\`, \`app-data/\`
`;
  fs.writeFileSync(path.join(ARTIFACTS_DIR, 'README.md'), readme);
}
