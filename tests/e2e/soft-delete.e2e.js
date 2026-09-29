const fs = require('fs');
const ExcelJS = require('exceljs');
const {
  test,
  expect,
  navigate,
  modal,
  expectNoModal,
  expectToast,
  confirmDialog,
  createUser,
  logout,
  login,
  dismissOnboarding,
} = require('./fixtures');

// Deleting records keeps them (soft delete): their money stays in the reports, they leave the
// lists, and «عرض المحذوفات» shows them with a restore button.

const ANNUAL_FEE = 120;

function yearsAgo(years) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().split('T')[0];
}

async function configureAnnualFee(page) {
  await navigate(page, 'الإعدادات');
  await page.getByRole('tab', { name: 'إعدادات الرسوم' }).click();
  await page.locator('input[name="annual_fee"]').fill(String(ANNUAL_FEE));
  await page.getByRole('button', { name: 'حفظ جميع التغييرات' }).click();
  await expectToast(page, 'success', 'تم تحديث الإعدادات بنجاح.');
}

async function addStudent(page, name) {
  await navigate(page, 'شؤون الطلاب');
  await page.getByRole('button', { name: 'إضافة طالب' }).click();
  await modal(page).locator('#formStudentName').fill(name);
  await modal(page).locator('#formStudentDob').fill(yearsAgo(9));
  await modal(page).getByRole('button', { name: 'إضافة الطالب' }).click();
  await expectToast(page, 'success', `تمت إضافة الطالب "${name}" بنجاح!`);
  await expectNoModal(page);
}

async function openFeesTab(page) {
  await navigate(page, 'الشؤون المالية');
  await page.getByRole('tab', { name: 'رسوم الطلاب' }).click();
}

function feeRow(page, name) {
  return page.locator('.tab-pane.active tbody tr', { hasText: name });
}

async function recordPayment(page, name, { amount, receipt }) {
  await feeRow(page, name).locator('button.btn-success').click();
  await expect(modal(page).locator('.modal-title')).toHaveText('تسجيل دفعة جديدة');
  await modal(page).locator('input[type="number"]').first().fill(String(amount));
  await modal(page).getByPlaceholder('أدخل رقم الوصل').fill(receipt);
  await modal(page).getByRole('button', { name: 'تسجيل الدفعة' }).click();
  await expectToast(page, 'success', 'تم تسجيل الدفعة بنجاح');
  await expectNoModal(page);
}

async function expectDashboardIncome(page, amount) {
  await navigate(page, 'الشؤون المالية');
  await page.getByRole('tab', { name: 'لوحة التحكم' }).click();
  const income = page
    .locator('.tab-pane.active .card-body', { hasText: 'إجمالي المداخيل' })
    .locator('h3');
  const expected = await page.evaluate(
    (value) =>
      new Intl.NumberFormat('ar-TN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
        value,
      ),
    amount,
  );
  await expect(income).toContainText(expected);
}

async function addClass(page, name) {
  await navigate(page, 'الفصول الدراسية');
  await page.getByRole('button', { name: 'إضافة فصل' }).click();
  await modal(page).locator('input[name="name"]').fill(name);
  const ageValue = await modal(page)
    .locator('select[name="age_group_id"] option', { hasText: 'الأطفال' })
    .getAttribute('value');
  await modal(page).locator('select[name="age_group_id"]').selectOption(ageValue);
  await modal(page).locator('select[name="status"]').selectOption('active');
  await modal(page).getByRole('button', { name: 'إضافة الفصل' }).click();
  await expectToast(page, 'success', `تمت إضافة الفصل "${name}" بنجاح!`);
  await expectNoModal(page);
}

async function openEnrollment(page, className) {
  await navigate(page, 'الفصول الدراسية');
  await row(page, className).locator('button.btn-outline-primary').first().click();
  await expect(modal(page).locator('.modal-title')).toContainText(className);
}

function enrolledList(page) {
  return modal(page).locator('.enrollment-list').first();
}

function availableList(page) {
  return modal(page).locator('.enrollment-list').nth(1);
}

async function enroll(page, className, studentName) {
  await openEnrollment(page, className);
  await availableList(page)
    .locator('.list-group-item', { hasText: studentName })
    .locator('button.text-success')
    .click();
  await modal(page).getByRole('button', { name: 'حفظ التغييرات' }).click();
  await expectToast(page, 'success', 'تم تحديث قائمة الطلاب بنجاح!');
  await expectNoModal(page);
}

async function deleteStudent(page, name) {
  await navigate(page, 'شؤون الطلاب');
  await row(page, name).getByRole('button', { name: 'حذف الطالب' }).click();
  await confirmDialog(page, 'نعم، حذف');
  await expectToast(page, 'success', `تم حذف الطالب "${name}" بنجاح.`);
}

async function studentsCard(page) {
  await navigate(page, 'الرئيسية');
  return page.locator('.stat-card', { hasText: 'الطلاب النشطون' }).locator('.card-text');
}

function row(page, text) {
  return page.locator('table tbody tr', { hasText: text });
}

test.describe('soft delete', () => {
  test("a deleted student's payment still counts, and a restore brings the student back", async ({
    authedPage: page,
  }) => {
    const name = 'يوسف بن علي';
    await configureAnnualFee(page);
    await addStudent(page, name);
    await openFeesTab(page);
    await recordPayment(page, name, { amount: 50, receipt: 'SOFT-1' });

    await navigate(page, 'شؤون الطلاب');
    await row(page, name).getByRole('button', { name: 'حذف الطالب' }).click();
    await confirmDialog(page, 'نعم، حذف');
    await expectToast(page, 'success', `تم حذف الطالب "${name}" بنجاح.`);
    await expect(row(page, name)).toHaveCount(0);

    // Gone from the fees list, but the money received stays in the reports
    await openFeesTab(page);
    await expect(feeRow(page, name)).toHaveCount(0);
    await expectDashboardIncome(page, 50);

    // Listed with the deleted students, then restored
    await navigate(page, 'شؤون الطلاب');
    await page.getByLabel('عرض المحذوفات').check();
    await expect(row(page, name)).toContainText('محذوف');
    await expect(row(page, name).getByRole('button', { name: 'حذف الطالب' })).toHaveCount(0);
    await row(page, name).getByRole('button', { name: 'استعادة الطالب' }).click();
    await expectToast(page, 'success', `تمت استعادة الطالب "${name}" بنجاح.`);
    await expect(row(page, name)).toHaveCount(0);
    await page.getByLabel('عرض المحذوفات').uncheck();
    await expect(row(page, name)).toBeVisible();

    // Their charges and payment are back as they were
    await openFeesTab(page);
    const cells = feeRow(page, name).locator('td');
    await expect(cells.nth(1)).toHaveText(`${ANNUAL_FEE.toFixed(2)} د.ت`);
    await expect(cells.nth(2)).toHaveText('50.00 د.ت');
    await expect(cells.nth(3)).toHaveText(`${(ANNUAL_FEE - 50).toFixed(2)} د.ت`);
  });

  test('a deleted student is left out of enrollment, attendance, counts and exports, and keeps their place', async ({
    authedPage: page,
    electronApp,
  }, testInfo) => {
    const kept = 'آمنة بنت وهب';
    const removed = 'زيد بن حارثة';
    const className = `حلقة الحذف ${Date.now()}`;
    await addStudent(page, kept);
    await addStudent(page, removed);
    await addClass(page, className);
    await enroll(page, className, kept);
    await enroll(page, className, removed);

    await deleteStudent(page, removed);

    // Home dashboard counts only the live student
    await expect(await studentsCard(page)).toHaveText('1');

    // Enrollment: nowhere in the dialog. Saving it must not drop the deleted student's place.
    await openEnrollment(page, className);
    await expect(enrolledList(page).locator('.list-group-item', { hasText: kept })).toBeVisible();
    await expect(modal(page).locator('.list-group-item', { hasText: removed })).toHaveCount(0);
    await modal(page).getByRole('button', { name: 'حفظ التغييرات' }).click();
    await expectToast(page, 'success', 'تم تحديث قائمة الطلاب بنجاح!');
    await expectNoModal(page);

    // Attendance: not on the class list
    await navigate(page, 'الحضور والغياب');
    await page.locator('select#classSelect').selectOption({ label: className });
    await expect(row(page, kept)).toBeVisible();
    await expect(row(page, removed)).toHaveCount(0);

    // Students export: only the live student
    const filePath = testInfo.outputPath('students.xlsx');
    await electronApp.evaluate(({ dialog }, target) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
    }, filePath);
    await navigate(page, 'شؤون الطلاب');
    await page.getByRole('button', { name: 'تصدير البيانات' }).click();
    await modal(page).getByRole('button', { name: 'تصدير إلى Excel' }).click();
    await expectToast(page, 'success', 'تم تصدير الملف بنجاح!');
    await modal(page).getByRole('button', { name: 'إغلاق', exact: true }).click();
    await expectNoModal(page);
    expect(fs.existsSync(filePath)).toBe(true);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const cells = [];
    workbook.getWorksheet('الطلاب').eachRow((r) => cells.push(...r.values.map(String)));
    expect(cells).toContain(kept);
    expect(cells).not.toContain(removed);

    // Restored: back in the class, the enrollment was kept all along
    await navigate(page, 'شؤون الطلاب');
    await page.getByLabel('عرض المحذوفات').check();
    await row(page, removed).getByRole('button', { name: 'استعادة الطالب' }).click();
    await expectToast(page, 'success', `تمت استعادة الطالب "${removed}" بنجاح.`);
    await openEnrollment(page, className);
    await expect(
      enrolledList(page).locator('.list-group-item', { hasText: removed }),
    ).toBeVisible();
    await modal(page).getByRole('button', { name: 'إلغاء', exact: true }).click();
    await expectNoModal(page);
    await expect(await studentsCard(page)).toHaveText('2');
  });

  test('a deleted user cannot log in until restored', async ({ authedPage: page }) => {
    const user = {
      username: 'softdeleted',
      password: 'soft-pass-1',
      firstName: 'سامي',
      lastName: 'المحذوف',
      nationalId: '42345678',
      phone: '93234567',
    };
    await createUser(page, user, 'Administrator');

    await row(page, user.username).getByRole('button', { name: 'حذف' }).click();
    await confirmDialog(page, 'نعم، قم بالحذف');
    await expectToast(page, 'success', 'تم حذف المستخدم بنجاح.');

    await logout(page);
    await login(page, user);
    await expect(page.locator('.alert-danger')).toContainText('هذا الحساب محذوف');
    await login(page);
    await dismissOnboarding(page);

    await navigate(page, 'إدارة المستخدمين');
    await page.getByLabel('عرض المحذوفات').check();
    await row(page, user.username).getByRole('button', { name: 'استعادة' }).click();
    await expectToast(page, 'success', `تمت استعادة المستخدم "${user.username}" بنجاح.`);

    await logout(page);
    await login(page, user);
    await dismissOnboarding(page);
    await expect(page.locator('.topbar')).toBeVisible();
  });

  test('deleted teachers and classes can be listed and restored', async ({ authedPage: page }) => {
    const teacher = 'خديجة بنت خويلد';
    await navigate(page, 'شؤون المعلمين');
    await page.getByRole('button', { name: 'إضافة معلم' }).click();
    await modal(page).locator('input[name="name"]').fill(teacher);
    await modal(page).locator('input[name="contact_info"]').fill('55667788');
    await modal(page).locator('select[name="gender"]').selectOption('Female');
    await modal(page).getByRole('button', { name: 'إضافة المعلم' }).click();
    await expectNoModal(page);

    await row(page, teacher).getByRole('button', { name: 'حذف المعلم' }).click();
    await confirmDialog(page, 'نعم، حذف');
    await expect(row(page, teacher)).toHaveCount(0);
    await page.getByLabel('عرض المحذوفات').check();
    await row(page, teacher).getByRole('button', { name: 'استعادة المعلم' }).click();
    await expectToast(page, 'success', `تمت استعادة المعلم "${teacher}" بنجاح.`);
    await page.getByLabel('عرض المحذوفات').uncheck();
    await expect(row(page, teacher)).toBeVisible();

    const className = `فصل محذوف ${Date.now()}`;
    await navigate(page, 'الفصول الدراسية');
    await page.getByRole('button', { name: 'إضافة فصل' }).click();
    await modal(page).locator('input[name="name"]').fill(className);
    const ageValue = await modal(page)
      .locator('select[name="age_group_id"] option', { hasText: 'الأطفال' })
      .getAttribute('value');
    await modal(page).locator('select[name="age_group_id"]').selectOption(ageValue);
    await modal(page).getByRole('button', { name: 'إضافة الفصل' }).click();
    await expectNoModal(page);

    await row(page, className).getByRole('button', { name: 'حذف الفصل' }).click();
    await confirmDialog(page, 'نعم، حذف');
    await expect(row(page, className)).toHaveCount(0);
    await page.getByLabel('عرض المحذوفات').check();
    await expect(row(page, className)).toContainText('محذوف');
    await row(page, className).getByRole('button', { name: 'استعادة الفصل' }).click();
    await expectToast(page, 'success', `تمت استعادة الفصل "${className}" بنجاح.`);
    await page.getByLabel('عرض المحذوفات').uncheck();
    await expect(row(page, className)).toBeVisible();
  });
});
