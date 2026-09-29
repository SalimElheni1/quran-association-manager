const { test, expect, navigate, modal, expectToast, expectNoModal } = require('./fixtures');

function yearsAgo(years) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().split('T')[0];
}

function formatDateEnGB(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-GB');
}

/**
 * Closes the open toasts. They sit over the top of the page (the saved-records panel
 * included) for 8s, and a later "saved" check could otherwise match an earlier toast.
 */
async function dismissToasts(page) {
  const toasts = page.locator('.Toastify__toast');
  await toasts.evaluateAll((els) => els.forEach((el) => el.click()));
  await expect(toasts).toHaveCount(0);
}

async function addStudent(page, name, gender = 'ذكر', age = 9) {
  await navigate(page, 'شؤون الطلاب');
  await page.getByRole('button', { name: 'إضافة طالب' }).click();
  await modal(page).locator('#formStudentName').fill(name);
  await modal(page).locator('#formStudentDob').fill(yearsAgo(age));
  await modal(page).locator('#formStudentGender').selectOption({ label: gender });
  await modal(page).getByRole('button', { name: 'إضافة الطالب' }).click();
  await expectToast(page, 'success', `تمت إضافة الطالب "${name}" بنجاح!`);
  await expectNoModal(page);
}

async function addClass(page, name, status = 'active', ageGroup = 'الأطفال') {
  await navigate(page, 'الفصول الدراسية');
  await page.getByRole('button', { name: 'إضافة فصل' }).click();
  await expect(modal(page).locator('.modal-title')).toHaveText('إضافة فصل جديد');
  await modal(page).locator('input[name="name"]').fill(name);

  const ageOption = modal(page).locator('select[name="age_group_id"] option', {
    hasText: ageGroup,
  });
  const ageGroupValue = await ageOption.getAttribute('value');
  await modal(page).locator('select[name="age_group_id"]').selectOption(ageGroupValue);

  if (status !== 'pending') {
    await modal(page).locator('select[name="status"]').selectOption(status);
  }

  await modal(page).getByRole('button', { name: 'إضافة الفصل' }).click();
  await expectToast(page, 'success', `تمت إضافة الفصل "${name}" بنجاح!`);
  await expectNoModal(page);
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
  await expectNoModal(page);
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
    await expectNoModal(page);
  });

  test('enrolls a matching student into a single-gender class without a warning', async ({
    authedPage: page,
  }) => {
    await addClass(page, 'فصل الناشئين', 'active', 'الناشئون (ذكور)');
    await addStudent(page, 'سليم الناشئ', 'ذكر', 13);

    // enrollStudent saves straight away; a gender warning modal would block it.
    await enrollStudent(page, 'فصل الناشئين', 'سليم الناشئ');
    await expectToast(page, 'success', 'تم تسجيل سليم الناشئ بنجاح.');
    await expect(page.getByText('تحذير التحقق من الصحة')).toHaveCount(0);
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

  test('marks student as late (تأخر) and allows cancelling edit', async ({ authedPage: page }) => {
    const className = `فصل الحفظ ${Date.now()}`;
    const studentName = `طالب متأخر ${Date.now()}`;
    await addClass(page, className, 'active');
    await addStudent(page, studentName, 'ذكر');
    await enrollStudent(page, className, studentName);

    await navigate(page, 'الحضور والغياب');
    const classSelect = page.locator('select#classSelect');
    await classSelect.selectOption({ label: className });

    // Initial save (default present)
    await page.getByRole('button', { name: 'حفظ التغييرات' }).click();
    await expectToast(page, 'success', 'تم حفظ سجل الحضور بنجاح!');

    // Click edit
    await page.getByRole('button', { name: 'تعديل' }).click();

    // Change to late
    const row = page.locator('table tbody tr', { hasText: studentName });
    await row.getByRole('button', { name: 'تأخر' }).click();

    // Cancel edit: the student is back to present
    await page.getByRole('button', { name: 'إلغاء' }).click();
    await expectToast(page, 'info', 'تم إلغاء التعديلات.');
    await expect(row.locator('button.btn-success')).toBeVisible();
    await expect(row.locator('button.btn-warning')).toHaveCount(0);

    // Edit again and save as late
    await dismissToasts(page);
    await page.getByRole('button', { name: 'تعديل' }).click();
    await row.getByRole('button', { name: 'تأخر' }).click();
    await page.getByRole('button', { name: 'حفظ التغييرات' }).click();
    await expectToast(page, 'success', 'تم حفظ سجل الحضور بنجاح!');

    // The late mark was saved, not just shown
    await navigate(page, 'شؤون الطلاب');
    await navigate(page, 'الحضور والغياب');
    await page.locator('select#classSelect').selectOption({ label: className });
    const rowAfterNavigation = page.locator('table tbody tr', { hasText: studentName });
    await expect(rowAfterNavigation.locator('button.btn-warning')).toBeVisible();
  });

  test('selects a saved attendance record from the summary panel', async ({ authedPage: page }) => {
    const className = `فصل القراءات ${Date.now()}`;
    const studentName = `طالب القراءات ${Date.now()}`;
    await addClass(page, className, 'active');
    await addStudent(page, studentName, 'ذكر');
    await enrollStudent(page, className, studentName);

    await navigate(page, 'الحضور والغياب');
    const classSelect = page.locator('select#classSelect');
    await classSelect.selectOption({ label: className });

    // Save for today
    await page.getByRole('button', { name: 'حفظ التغييرات' }).click();
    await expectToast(page, 'success', 'تم حفظ سجل الحضور بنجاح!');

    const todayDate = await page.locator('#dateSelect').inputValue();
    const todayDisplay = formatDateEnGB(todayDate);

    // Change date to an earlier date
    const earlierDate = '2025-01-15';
    const earlierDisplay = formatDateEnGB(earlierDate);
    await page.locator('#dateSelect').fill(earlierDate);

    // Save attendance for earlier date
    const row = page.locator('table tbody tr', { hasText: studentName });
    await dismissToasts(page);
    await row.getByRole('button', { name: 'غياب' }).click();
    await page.getByRole('button', { name: 'حفظ التغييرات' }).click();
    await expectToast(page, 'success', 'تم حفظ سجل الحضور بنجاح!');

    // The summary panel now has both dates
    const summaryList = page.locator('.card .list-group-item');
    await expect(summaryList.filter({ hasText: todayDisplay })).toBeVisible();
    await expect(summaryList.filter({ hasText: earlierDisplay })).toBeVisible();

    // Click on today's record in the summary list (the toast would cover it)
    await dismissToasts(page);
    await summaryList.filter({ hasText: todayDisplay }).click();
    await expect(page.locator('#dateSelect')).toHaveValue(todayDate);
  });
});
