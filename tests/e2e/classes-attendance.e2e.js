const { test, expect, navigate, modal, expectToast } = require('./fixtures');

function nineYearsAgo() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 9);
  return d.toISOString().split('T')[0];
}

function formatDateEnGB(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-GB');
}

async function addStudent(page, name, gender = 'ذكر') {
  await navigate(page, 'شؤون الطلاب');
  await page.getByRole('button', { name: 'إضافة طالب' }).click();
  await modal(page).locator('#formStudentName').fill(name);
  await modal(page).locator('#formStudentDob').fill(nineYearsAgo());
  await modal(page).locator('#formStudentGender').selectOption({ label: gender });
  await modal(page).getByRole('button', { name: 'إضافة الطالب' }).click();
  await expectToast(page, 'success', `تمت إضافة الطالب "${name}" بنجاح!`);
  await expect(modal(page)).toHaveCount(0);
}

async function addClass(page, name, status = 'active') {
  await navigate(page, 'الفصول الدراسية');
  await page.getByRole('button', { name: 'إضافة فصل' }).click();
  await expect(modal(page).locator('.modal-title')).toHaveText('إضافة فصل جديد');
  await modal(page).locator('input[name="name"]').fill(name);

  const ageOption = modal(page).locator('select[name="age_group_id"] option', {
    hasText: 'الأطفال',
  });
  const ageGroupValue = await ageOption.getAttribute('value');
  await modal(page).locator('select[name="age_group_id"]').selectOption(ageGroupValue);

  if (status !== 'pending') {
    await modal(page).locator('select[name="status"]').selectOption(status);
  }

  await modal(page).getByRole('button', { name: 'إضافة الفصل' }).click();
  await expectToast(page, 'success', `تمت إضافة الفصل "${name}" بنجاح!`);
  await expect(modal(page)).toHaveCount(0);
}

async function openEnrollment(page, className) {
  await navigate(page, 'الفصول الدراسية');
  const row = page.locator('table tbody tr', { hasText: className });
  await row.locator('button.btn-outline-primary').first().click();
  await expect(modal(page).locator('.modal-title')).toContainText(
    `إدارة الطلاب في فصل: ${className}`,
  );
}

async function enrollStudent(page, className, studentName) {
  await openEnrollment(page, className);
  const availableList = modal(page).locator('.enrollment-list').nth(1);
  const item = availableList.locator('.list-group-item', { hasText: studentName });
  await item.locator('button.text-success').click();
  await expect(
    modal(page).locator('.enrollment-list').first().locator('.list-group-item', {
      hasText: studentName,
    }),
  ).toBeVisible();
  await modal(page).getByRole('button', { name: 'حفظ التغييرات' }).click();
  await expectToast(page, 'success', 'تم تحديث قائمة الطلاب بنجاح!');
  await expect(modal(page)).toHaveCount(0);
}

test.describe('classes, enrollment and attendance', () => {
  test('creates an active class and shows it in the list', async ({ authedPage: page }) => {
    const className = `فصل التجويد ${Date.now()}`;
    await addClass(page, className, 'active');

    const row = page.locator('table tbody tr', { hasText: className });
    await expect(row).toBeVisible();
    await expect(row.locator('td:nth-child(5)', { hasText: 'الأطفال' })).toBeVisible();
    await expect(row.locator('.badge', { hasText: 'نشط' })).toBeVisible();
  });

  test('only active classes appear in the attendance class select', async ({
    authedPage: page,
  }) => {
    const activeClassName = `فصل نشط ${Date.now()}`;
    const pendingClassName = `فصل معلق ${Date.now()}`;
    await addClass(page, activeClassName, 'active');
    await addClass(page, pendingClassName, 'pending');

    await navigate(page, 'الحضور والغياب');
    await expect(page.getByRole('heading', { name: 'تسجيل الحضور والغياب' })).toBeVisible();

    const classSelect = page.locator('select#classSelect');
    await expect(classSelect).not.toBeDisabled();
    await expect(classSelect.locator('option', { hasText: activeClassName })).toBeAttached();
    await expect(classSelect.locator('option', { hasText: pendingClassName })).toHaveCount(0);
  });

  test('enrolls a student into an active class and persists enrollment', async ({
    authedPage: page,
  }) => {
    const className = `فصل التجويد ${Date.now()}`;
    const studentName = `طالب ${Date.now()}`;
    await addClass(page, className, 'active');
    await addStudent(page, studentName, 'ذكر');
    await enrollStudent(page, className, studentName);

    await openEnrollment(page, className);
    const enrolledList = modal(page).locator('.enrollment-list').first();
    await expect(enrolledList.locator('.list-group-item', { hasText: studentName })).toBeVisible();

    const availableList = modal(page).locator('.enrollment-list').nth(1);
    await expect(availableList.locator('.list-group-item', { hasText: studentName })).toHaveCount(
      0,
    );

    await modal(page).getByRole('button', { name: 'إلغاء', exact: true }).click();
    await expect(modal(page)).toHaveCount(0);
  });

  test('marks a student absent and persists attendance across navigation', async ({
    authedPage: page,
  }) => {
    const className = `فصل التجويد ${Date.now()}`;
    const studentName = `طالب ${Date.now()}`;
    await addClass(page, className, 'active');
    await addStudent(page, studentName, 'ذكر');
    await enrollStudent(page, className, studentName);

    await navigate(page, 'الحضور والغياب');
    await expect(page.getByRole('heading', { name: 'تسجيل الحضور والغياب' })).toBeVisible();

    const classSelect = page.locator('select#classSelect');
    await expect(classSelect).not.toBeDisabled();
    await classSelect.selectOption({ label: className });

    const row = page.locator('table tbody tr', { hasText: studentName });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'غياب' }).click();
    await page.getByRole('button', { name: 'حفظ التغييرات' }).click();
    await expectToast(page, 'success', 'تم حفظ سجل الحضور بنجاح!');

    await expect(page.locator('.alert-info')).toContainText('هذا السجل محفوظ ومغلق للتعديل');

    const selectedDate = await page.locator('#dateSelect').inputValue();
    const dateDisplay = formatDateEnGB(selectedDate);
    await expect(page.locator('.card .list-group-item', { hasText: dateDisplay })).toBeVisible();

    await navigate(page, 'شؤون الطلاب');
    await expect(page.getByRole('heading', { name: 'شؤون الطلاب' })).toBeVisible();

    await navigate(page, 'الحضور والغياب');
    await expect(classSelect).not.toBeDisabled();
    await classSelect.selectOption({ label: className });

    const rowAfterNavigation = page.locator('table tbody tr', { hasText: studentName });
    await expect(rowAfterNavigation.locator('button.btn-danger')).toBeVisible();
  });
});
