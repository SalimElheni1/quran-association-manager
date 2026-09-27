const {
  test,
  expect,
  navigate,
  modal,
  expectNoModal,
  expectToast,
  confirmDialog,
} = require('./fixtures');

/**
 * Helper to add a teacher through the modal and assert success toast.
 * @param {import('@playwright/test').Page} page
 * @param {{ name: string, phone: string, gender?: 'Male' | 'Female' }} opts
 */
async function addTeacher(page, { name, phone, gender = 'Male' }) {
  await page.getByRole('button', { name: 'إضافة معلم' }).click();
  await expect(modal(page)).toBeVisible();
  await expect(modal(page).locator('.modal-title', { hasText: 'إضافة معلم جديد' })).toBeVisible();

  await modal(page).locator('input[name="name"]').fill(name);
  await modal(page).locator('input[name="contact_info"]').fill(phone);
  await modal(page).locator('select[name="gender"]').selectOption(gender);

  await modal(page).getByRole('button', { name: 'إضافة المعلم' }).click();

  await expectToast(page, 'success', `تمت إضافة المعلم "${name}" بنجاح!`);
  await expectNoModal(page);
}

test.describe('Teachers page (شؤون المعلمين)', () => {
  test('add a teacher -> success toast, row with name and phone visible in the table', async ({
    authedPage: page,
  }) => {
    await navigate(page, 'شؤون المعلمين');

    const teacherName = 'أحمد محمد علي';
    const teacherPhone = '22334455';

    await addTeacher(page, { name: teacherName, phone: teacherPhone, gender: 'Male' });

    await expect(page.locator('tbody tr', { hasText: teacherName })).toBeVisible();
    await expect(page.locator('tbody tr', { hasText: teacherPhone })).toBeVisible();
  });

  test('invalid phone (7 digits) is rejected -> error toast, modal still open, no row added', async ({
    authedPage: page,
  }) => {
    await navigate(page, 'شؤون المعلمين');

    await page.getByRole('button', { name: 'إضافة معلم' }).click();
    await expect(modal(page)).toBeVisible();
    await expect(modal(page).locator('.modal-title', { hasText: 'إضافة معلم جديد' })).toBeVisible();

    const teacherName = 'فاطمة الزهراء';
    const invalidPhone = '1234567';

    await modal(page).locator('input[name="name"]').fill(teacherName);
    await modal(page).locator('input[name="contact_info"]').fill(invalidPhone);
    await modal(page).locator('select[name="gender"]').selectOption('Male');

    await modal(page).getByRole('button', { name: 'إضافة المعلم' }).click();

    await expectToast(page, 'error', 'رقم الهاتف يجب أن يتكون من 8 أرقام.');

    await expect(modal(page)).toBeVisible();

    await expect(page.locator('tbody tr', { hasText: teacherName })).toHaveCount(0);
  });

  test('search: add two teachers, search one name -> only that row shown; clear search -> both shown', async ({
    authedPage: page,
  }) => {
    await navigate(page, 'شؤون المعلمين');

    const teachers = [
      { name: 'خديجة بنت خويلد', phone: '11223344' },
      { name: 'عائشة بنت أبي بكر', phone: '55667788' },
    ];

    for (const t of teachers) {
      await addTeacher(page, { name: t.name, phone: t.phone, gender: 'Female' });
    }

    await expect(page.locator('tbody tr', { hasText: teachers[0].name })).toBeVisible();
    await expect(page.locator('tbody tr', { hasText: teachers[1].name })).toBeVisible();

    const search = page.getByPlaceholder('البحث بالاسم أو الرقم التعريفي...');
    await search.fill(teachers[0].name);

    // Exactly one row means the filtered result has rendered; zero rows would also
    // match while the loading spinner replaces the table mid-fetch.
    await expect(page.locator('tbody tr')).toHaveCount(1);
    await expect(page.locator('tbody tr', { hasText: teachers[0].name })).toBeVisible();

    await search.clear();
    await expect(search).toHaveValue('');
    await expect(page.locator('tbody tr')).toHaveCount(2);
    await expect(page.locator('tbody tr', { hasText: teachers[0].name })).toBeVisible();
    await expect(page.locator('tbody tr', { hasText: teachers[1].name })).toBeVisible();
  });

  test("edit a teacher's name -> success toast, table shows the new name and not the old one", async ({
    authedPage: page,
  }) => {
    await navigate(page, 'شؤون المعلمين');

    const originalName = 'زينب بنت جحش';
    const updatedName = 'رقية بنت محمد';
    const phone = '99887766';

    await addTeacher(page, { name: originalName, phone, gender: 'Female' });

    await expect(page.locator('tbody tr', { hasText: originalName })).toBeVisible();

    const row = page.locator('tbody tr', { hasText: originalName });
    await row.getByRole('button', { name: 'تعديل المعلم' }).click();

    await expect(modal(page)).toBeVisible();
    await expect(
      modal(page).locator('.modal-title', { hasText: 'تعديل بيانات المعلم' }),
    ).toBeVisible();

    await modal(page).locator('input[name="name"]').fill(updatedName);
    await modal(page).getByRole('button', { name: 'حفظ التعديلات' }).click();

    await expectToast(page, 'success', `تم تحديث بيانات المعلم "${updatedName}" بنجاح!`);

    await expect(page.locator('tbody tr', { hasText: updatedName })).toBeVisible();
    await expect(page.locator('tbody tr', { hasText: originalName })).toHaveCount(0);
  });

  test('delete a teacher -> confirm -> success toast, row gone', async ({ authedPage: page }) => {
    await navigate(page, 'شؤون المعلمين');

    const teacherName = 'حفصة بنت عمر';
    const phone = '44556677';

    await addTeacher(page, { name: teacherName, phone, gender: 'Female' });

    await expect(page.locator('tbody tr', { hasText: teacherName })).toBeVisible();

    const row = page.locator('tbody tr', { hasText: teacherName });
    await row.getByRole('button', { name: 'حذف المعلم' }).click();

    await expect(
      modal(page).locator('.modal-title', { hasText: 'تأكيد حذف المعلم' }),
    ).toBeVisible();
    await confirmDialog(page, 'نعم، حذف');

    await expectToast(page, 'success', `تم حذف المعلم "${teacherName}" بنجاح.`);

    await expect(page.locator('tbody tr', { hasText: teacherName })).toHaveCount(0);
  });
});
