const {
  test,
  expect,
  navigate,
  modal,
  expectToast,
  expectNoModal,
  confirmDialog,
} = require('./fixtures');

function yearsAgo(years) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().split('T')[0];
}

function randomPhone() {
  return String(10000000 + Math.floor(Math.random() * 90000000));
}

async function addTeacher(page, { name, phone, gender = 'Male' }) {
  await navigate(page, 'شؤون المعلمين');
  await page.getByRole('button', { name: 'إضافة معلم' }).click();
  await expect(modal(page).locator('.modal-title', { hasText: 'إضافة معلم جديد' })).toBeVisible();

  await modal(page).locator('input[name="name"]').fill(name);
  await modal(page).locator('input[name="contact_info"]').fill(phone);
  await modal(page).locator('select[name="gender"]').selectOption(gender);

  await modal(page).getByRole('button', { name: 'إضافة المعلم' }).click();
  await expectToast(page, 'success', `تمت إضافة المعلم "${name}" بنجاح!`);
  await expectNoModal(page);
}

async function addStudent(page, name, gender = 'ذكر', age = 9) {
  await navigate(page, 'شؤون الطلاب');
  await page.getByRole('button', { name: 'إضافة طالب' }).click();
  await modal(page).locator('#formStudentName').fill(name);
  await modal(page).locator('#formStudentDob').fill(yearsAgo(age));
  await modal(page).locator('#formStudentGender').selectOption({ label: gender });
  await modal(page).getByRole('button', { name: 'إضافة الطالب' }).click();
  await expectToast(page, 'success', `تمت إضافة الطالب "${name}" بنجاح!`);
  await expect(modal(page)).toHaveCount(0);
}

async function addClass(page, name, status = 'active', ageGroup = 'الأطفال', teacherName = null) {
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

  if (teacherName) {
    await modal(page).locator('select[name="teacher_id"]').selectOption({ label: teacherName });
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

async function removeStudentFromEnrollment(page, studentName) {
  const enrolledList = modal(page).locator('.enrollment-list').first();
  const item = enrolledList.locator('.list-group-item', { hasText: studentName });
  await item.locator('button.text-danger').click();
}

test.describe('class management', () => {
  test('edits a class: changes name and assigns a teacher', async ({ authedPage: page }) => {
    const ts = Date.now();
    const teacherName = `معلم التحرير ${ts}`;
    const oldClassName = `فصل قديم ${ts}`;
    const newClassName = `فصل محدث ${ts}`;

    await addTeacher(page, { name: teacherName, phone: randomPhone(), gender: 'Male' });
    await addClass(page, oldClassName, 'active');

    await navigate(page, 'الفصول الدراسية');
    const row = page.locator('table tbody tr', { hasText: oldClassName });
    await expect(row).toBeVisible();

    await row.getByRole('button', { name: 'تعديل الفصل' }).click();
    await expect(modal(page).locator('.modal-title')).toHaveText('تعديل الفصل الدراسي');

    await modal(page).locator('input[name="name"]').fill(newClassName);
    await modal(page).locator('select[name="teacher_id"]').selectOption({ label: teacherName });

    await modal(page).getByRole('button', { name: 'حفظ التعديلات' }).click();
    await expectToast(page, 'success', `تم تحديث بيانات الفصل "${newClassName}" بنجاح!`);
    await expect(modal(page)).toHaveCount(0);

    const updatedRow = page.locator('table tbody tr', { hasText: newClassName });
    await expect(updatedRow).toBeVisible();
    await expect(updatedRow.locator('td:nth-child(3)', { hasText: teacherName })).toBeVisible();
    await expect(page.locator('table tbody tr', { hasText: oldClassName })).toHaveCount(0);
  });

  test('deletes a class after confirming the dialog', async ({ authedPage: page }) => {
    const ts = Date.now();
    const className = `فصل للحذف ${ts}`;

    await addClass(page, className, 'active');

    await navigate(page, 'الفصول الدراسية');
    const row = page.locator('table tbody tr', { hasText: className });
    await expect(row).toBeVisible();

    await row.getByRole('button', { name: 'حذف الفصل' }).click();
    await expect(modal(page).locator('.modal-title', { hasText: 'تأكيد حذف الفصل' })).toBeVisible();

    await confirmDialog(page, 'نعم، حذف');
    await expectToast(page, 'success', `تم حذف الفصل "${className}" بنجاح.`);

    await expect(page.locator('table tbody tr', { hasText: className })).toHaveCount(0);
  });

  test('class details modal shows name, teacher and age group', async ({ authedPage: page }) => {
    const ts = Date.now();
    const teacherName = `معلم التفاصيل ${ts}`;
    const className = `فصل تفاصيل ${ts}`;

    await addTeacher(page, { name: teacherName, phone: randomPhone(), gender: 'Male' });
    await addClass(page, className, 'active', 'الأطفال', teacherName);

    await navigate(page, 'الفصول الدراسية');
    const row = page.locator('table tbody tr', { hasText: className });
    await expect(row).toBeVisible();

    await row.locator('button[aria-label="عرض تفاصيل الفصل"]').click();
    await expect(modal(page).locator('.modal-title')).toContainText(className);

    const body = modal(page).locator('.modal-body');
    await expect(body.getByText(className, { exact: false }).first()).toBeVisible();
    await expect(body.getByText(teacherName)).toBeVisible();
    await expect(body.getByText('الأطفال')).toBeVisible();

    await modal(page).getByRole('button', { name: 'إغلاق' }).click();
    await expect(modal(page)).toHaveCount(0);
  });

  test('search filters classes by name and clearing restores the list', async ({
    authedPage: page,
  }) => {
    const ts = Date.now();
    const classA = `فصل بحث أول ${ts}`;
    const classB = `فصل بحث ثانٍ ${ts}`;

    await addClass(page, classA, 'active');
    await addClass(page, classB, 'active');

    await navigate(page, 'الفصول الدراسية');
    await expect(page.locator('table tbody tr', { hasText: classA })).toBeVisible();
    await expect(page.locator('table tbody tr', { hasText: classB })).toBeVisible();

    const search = page.getByPlaceholder('البحث باسم الفصل...');
    await search.fill(classA);

    await expect(page.locator('table tbody tr')).toHaveCount(1);
    await expect(page.locator('table tbody tr', { hasText: classA })).toBeVisible();
    await expect(page.locator('table tbody tr', { hasText: classB })).toHaveCount(0);

    await search.clear();
    await expect(search).toHaveValue('');
    await expect(page.locator('table tbody tr')).toHaveCount(2);
    await expect(page.locator('table tbody tr', { hasText: classA })).toBeVisible();
    await expect(page.locator('table tbody tr', { hasText: classB })).toBeVisible();
  });

  test('unenrolls a student and returns them to the available list', async ({
    authedPage: page,
  }) => {
    const ts = Date.now();
    const className = `فصل إلغاء التسجيل ${ts}`;
    const studentName = `طالب إلغاء ${ts}`;

    await addClass(page, className, 'active');
    await addStudent(page, studentName, 'ذكر', 9);
    await enrollStudent(page, className, studentName);

    await openEnrollment(page, className);
    await removeStudentFromEnrollment(page, studentName);

    await expect(
      modal(page).locator('.enrollment-list').first().locator('.list-group-item', {
        hasText: studentName,
      }),
    ).toHaveCount(0);
    await expect(
      modal(page).locator('.enrollment-list').nth(1).locator('.list-group-item', {
        hasText: studentName,
      }),
    ).toBeVisible();

    await modal(page).getByRole('button', { name: 'حفظ التغييرات' }).click();
    await expectToast(page, 'success', 'تم تحديث قائمة الطلاب بنجاح!');
    await expect(modal(page)).toHaveCount(0);

    await openEnrollment(page, className);
    await expect(
      modal(page).locator('.enrollment-list').first().locator('.list-group-item', {
        hasText: studentName,
      }),
    ).toHaveCount(0);
    await expect(
      modal(page).locator('.enrollment-list').nth(1).locator('.list-group-item', {
        hasText: studentName,
      }),
    ).toBeVisible();

    await modal(page).getByRole('button', { name: 'إلغاء', exact: true }).click();
    await expect(modal(page)).toHaveCount(0);
  });

  test('edits saved attendance from present to late and persists it', async ({
    authedPage: page,
  }) => {
    const ts = Date.now();
    const className = `فصل تعديل الحضور ${ts}`;
    const studentName = `طالب تعديل الحضور ${ts}`;

    await addClass(page, className, 'active');
    await addStudent(page, studentName, 'ذكر', 9);
    await enrollStudent(page, className, studentName);

    await navigate(page, 'الحضور والغياب');
    await expect(page.getByRole('heading', { name: 'تسجيل الحضور والغياب' })).toBeVisible();

    const classSelect = page.locator('select#classSelect');
    await expect(classSelect).not.toBeDisabled();
    await classSelect.selectOption({ label: className });

    const row = page.locator('table tbody tr', { hasText: studentName });
    await expect(row).toBeVisible();

    await row.getByRole('button', { name: 'حضور' }).click();
    await page.getByRole('button', { name: 'حفظ التغييرات' }).click();
    await expectToast(page, 'success', 'تم حفظ سجل الحضور بنجاح!');

    await page.getByRole('button', { name: 'تعديل' }).click();
    await row.getByRole('button', { name: 'تأخر' }).click();
    await page.getByRole('button', { name: 'حفظ التغييرات' }).click();
    await expectToast(page, 'success', 'تم حفظ سجل الحضور بنجاح!');

    await navigate(page, 'شؤون الطلاب');
    await expect(page.getByRole('heading', { name: 'شؤون الطلاب' })).toBeVisible();

    await navigate(page, 'الحضور والغياب');
    await expect(classSelect).not.toBeDisabled();
    await classSelect.selectOption({ label: className });

    const rowAfterNavigation = page.locator('table tbody tr', { hasText: studentName });
    await expect(rowAfterNavigation).toBeVisible();
    await expect(rowAfterNavigation.getByRole('button', { name: 'تأخر' })).toHaveClass(
      /btn-warning/,
    );
  });
});
