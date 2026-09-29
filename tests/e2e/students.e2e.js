const {
  test,
  expect,
  navigate,
  modal,
  expectToast,
  confirmDialog,
  expectNoModal,
} = require('./fixtures');

function yearsAgoISODate(years) {
  const date = new Date();
  date.setFullYear(date.getFullYear() - years);
  return date.toISOString().split('T')[0];
}

function matriculeCell(row) {
  return row.locator('td').nth(1);
}

function nameCell(row) {
  return row.locator('td').nth(2);
}

async function addStudent(page, { name, dob, gender = 'Male' }) {
  await page.getByRole('button', { name: 'إضافة طالب' }).click();
  await expect(modal(page).locator('.modal-title')).toHaveText('إضافة طالب جديد');

  await modal(page).locator('input[name="name"]').fill(name);
  if (dob) {
    await modal(page).locator('input[name="date_of_birth"]').fill(dob);
  }
  await modal(page).locator('select[name="gender"]').selectOption(gender);
  await modal(page).getByRole('button', { name: 'إضافة الطالب' }).click();

  await expectToast(page, 'success', `تمت إضافة الطالب "${name}" بنجاح!`);
  await expectNoModal(page);
}

test.describe('students page', () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await navigate(page, 'شؤون الطلاب');
    await expect(page.getByRole('heading', { name: 'شؤون الطلاب' })).toBeVisible();
  });

  test('add a student with name, date of birth and gender', async ({ authedPage: page }) => {
    const studentName = 'أحمد بن علي';
    const dob = yearsAgoISODate(9);

    await addStudent(page, { name: studentName, dob });

    const row = page.locator('table.students-table tbody tr', { hasText: studentName });
    await expect(row).toBeVisible();
    await expect(matriculeCell(row)).not.toHaveText('');
    await expect(nameCell(row)).toHaveText(studentName);
  });

  test('a name shorter than 3 characters is rejected', async ({ authedPage: page }) => {
    await page.getByRole('button', { name: 'إضافة طالب' }).click();
    await expect(modal(page).locator('.modal-title')).toHaveText('إضافة طالب جديد');

    await modal(page).locator('input[name="name"]').fill('أب');
    await modal(page).getByRole('button', { name: 'إضافة الطالب' }).click();

    await expectToast(page, 'error', 'يجب أن يكون الاسم 3 أحرف على الأقل');
    await expect(modal(page)).toHaveCount(1);

    await expect(page.locator('table.students-table tbody tr', { hasText: 'أب' })).toHaveCount(0);
  });

  test('a student younger than 4 is rejected by the client check', async ({ authedPage: page }) => {
    const studentName = 'طفل صغير';
    const dob = yearsAgoISODate(2);

    await page.getByRole('button', { name: 'إضافة طالب' }).click();
    await expect(modal(page).locator('.modal-title')).toHaveText('إضافة طالب جديد');

    await modal(page).locator('input[name="name"]').fill(studentName);
    await modal(page).locator('input[name="date_of_birth"]').fill(dob);
    await modal(page).locator('select[name="gender"]').selectOption('Male');
    await modal(page).getByRole('button', { name: 'إضافة الطالب' }).click();

    await expectToast(page, 'error', /^عمر الطالب أقل من الحد الأدنى/);
    await expect(modal(page)).toHaveCount(1);

    await expect(
      page.locator('table.students-table tbody tr', { hasText: studentName }),
    ).toHaveCount(0);
  });

  test('search filters the students table and clears back to all rows', async ({
    authedPage: page,
  }) => {
    const firstName = 'يوسف الخطاب';
    const secondName = 'عمر بن الخطاب';

    await addStudent(page, { name: firstName, dob: yearsAgoISODate(10) });
    await addStudent(page, { name: secondName, dob: yearsAgoISODate(11) });

    const search = page.getByPlaceholder('البحث بالاسم أو الرقم التعريفي...');

    await search.fill('يوسف');
    await expect(page.locator('table.students-table tbody tr')).toHaveCount(1);
    await expect(
      page.locator('table.students-table tbody tr', { hasText: firstName }),
    ).toBeVisible();
    await expect(
      page.locator('table.students-table tbody tr', { hasText: secondName }),
    ).toHaveCount(0);

    await search.fill('xyz123 nonsense');
    await expect(page.getByText('لا توجد نتائج تطابق معايير البحث.')).toBeVisible();
    await expect(page.locator('table.students-table tbody tr')).toHaveCount(1);

    await search.clear();
    await expect(page.locator('table.students-table tbody tr')).toHaveCount(2);
    await expect(
      page.locator('table.students-table tbody tr', { hasText: firstName }),
    ).toBeVisible();
    await expect(
      page.locator('table.students-table tbody tr', { hasText: secondName }),
    ).toBeVisible();
  });

  test('filters students table by gender select option', async ({ authedPage: page }) => {
    const maleName = 'أمين التونسي';
    const femaleName = 'مريم التونسية';

    await addStudent(page, { name: maleName, dob: yearsAgoISODate(8), gender: 'Male' });
    await addStudent(page, { name: femaleName, dob: yearsAgoISODate(9), gender: 'Female' });

    const genderSelect = page.getByRole('combobox', { name: 'Filter by gender' });

    // Filter Male
    await genderSelect.selectOption('Male');
    await expect(page.locator('table.students-table tbody tr')).toHaveCount(1);
    await expect(page.locator('table.students-table tbody tr', { hasText: maleName })).toBeVisible();

    // Filter Female
    await genderSelect.selectOption('Female');
    await expect(page.locator('table.students-table tbody tr')).toHaveCount(1);
    await expect(
      page.locator('table.students-table tbody tr', { hasText: femaleName }),
    ).toBeVisible();

    // Reset All
    await genderSelect.selectOption('all');
    await expect(page.locator('table.students-table tbody tr')).toHaveCount(2);
  });

  test('views student details modal and closes it', async ({ authedPage: page }) => {
    const studentName = 'عبد الله الرواشدة';
    await addStudent(page, { name: studentName, dob: yearsAgoISODate(10), gender: 'Male' });

    const row = page.locator('table.students-table tbody tr', { hasText: studentName });
    await row.getByRole('button', { name: 'عرض تفاصيل الطالب' }).click();

    await expect(modal(page)).toBeVisible();
    await expect(modal(page).locator('.modal-title')).toContainText(studentName);
    await expect(modal(page).getByText('المعلومات الشخصية')).toBeVisible();
    await expect(modal(page).getByText('معلومات الجمعية')).toBeVisible();

    await modal(page).getByRole('button', { name: 'إغلاق' }).click();
    await expectNoModal(page);
  });

  test('edit a student name', async ({ authedPage: page }) => {
    const oldName = 'خالد بن الوليد';
    const newName = 'خالد بن الوليد المحدث';

    await addStudent(page, { name: oldName, dob: yearsAgoISODate(12) });

    const row = page.locator('table.students-table tbody tr', { hasText: oldName });
    await row.getByRole('button', { name: 'تعديل الطالب' }).click();

    await expect(modal(page).locator('.modal-title')).toHaveText('تعديل بيانات الطالب');
    await modal(page).locator('input[name="name"]').fill(newName);
    await modal(page).getByRole('button', { name: 'حفظ التعديلات' }).click();

    await expectToast(page, 'success', `تم تحديث بيانات الطالب "${newName}" بنجاح!`);
    await expectNoModal(page);

    await expect(page.locator('table.students-table tbody tr')).toHaveCount(1);
    const updatedRow = page.locator('table.students-table tbody tr').first();
    await expect(nameCell(updatedRow)).toHaveText(newName);
  });

  test('delete a student', async ({ authedPage: page }) => {
    const studentName = 'بلال بن رباح';

    await addStudent(page, { name: studentName, dob: yearsAgoISODate(13) });

    const row = page.locator('table.students-table tbody tr', { hasText: studentName });
    await row.getByRole('button', { name: 'حذف الطالب' }).click();

    await expect(modal(page).locator('.modal-title')).toHaveText('تأكيد حذف الطالب');
    await confirmDialog(page);

    await expectToast(page, 'success', `تم حذف الطالب "${studentName}" بنجاح.`);
    await expect(
      page.locator('table.students-table tbody tr', { hasText: studentName }),
    ).toHaveCount(0);
  });
});
