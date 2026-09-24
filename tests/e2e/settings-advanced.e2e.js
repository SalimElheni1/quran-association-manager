const fs = require('fs');
const path = require('path');
const {
  test,
  expect,
  navigate,
  modal,
  expectToast,
  expectNoModal,
  confirmDialog,
} = require('./fixtures');

function activePane(page) {
  return page.locator('.tab-pane.active');
}

// Clicking an already-selected Bootstrap tab hangs on Playwright's stability
// check; only click unselected tabs.
async function openTab(page, title) {
  const tab = page.getByRole('tab', { name: title, exact: true });
  if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}

async function stubOpenDirectoryDialog(electronApp, dirPath) {
  await electronApp.evaluate(({ dialog }, target) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [target] });
  }, dirPath);
}

async function createAgeGroup(page, { name, gender = 'any', minAge, maxAge, description = '' }) {
  await activePane(page).getByRole('button', { name: 'إضافة فئة جديدة' }).click();
  const form = modal(page);
  await form.locator('input[name="name"]').fill(name);
  await form.locator('select[name="gender"]').selectOption(gender);
  await form.locator('input[name="min_age"]').fill(String(minAge));
  if (maxAge !== undefined && maxAge !== null) {
    await form.locator('input[name="max_age"]').fill(String(maxAge));
  }
  if (description) await form.locator('textarea[name="description"]').fill(description);
  await form.getByRole('button', { name: 'حفظ' }).click();
  await expectToast(page, 'success', 'تم إنشاء الفئة العمرية بنجاح.');
  await expectNoModal(page);
}

test.describe('الإعدادات المتقدمة - advanced settings', () => {
  test.beforeEach(async ({ authedPage }) => {
    await navigate(authedPage, 'الإعدادات');
    await expect(
      authedPage.getByRole('heading', { name: 'إعدادات النظام والنسخ الاحتياطي' }),
    ).toBeVisible();
  });

  test('fee settings persist after navigating away and back', async ({ authedPage }) => {
    const page = authedPage;
    await openTab(page, 'إعدادات الرسوم');

    const annualFee = String(100 + (Date.now() % 900));
    const monthlyFee = String(10 + (Date.now() % 90));

    await activePane(page).locator('input[name="annual_fee"]').fill(annualFee);
    await activePane(page).locator('input[name="standard_monthly_fee"]').fill(monthlyFee);
    await activePane(page).locator('select[name="kids_payment_frequency"]').selectOption('ANNUAL');

    await page.getByRole('button', { name: 'حفظ جميع التغييرات' }).click();
    // Saving non-zero fees may also generate charges, so the toast message can
    // have extra text appended. Match the required prefix only.
    await expectToast(page, 'success', /تم تحديث الإعدادات بنجاح/);

    await navigate(page, 'الرئيسية');
    await navigate(page, 'الإعدادات');
    await openTab(page, 'إعدادات الرسوم');

    await expect(activePane(page).locator('input[name="annual_fee"]')).toHaveValue(annualFee);
    await expect(activePane(page).locator('input[name="standard_monthly_fee"]')).toHaveValue(
      monthlyFee,
    );
    await expect(activePane(page).locator('select[name="kids_payment_frequency"]')).toHaveValue(
      'ANNUAL',
    );
  });

  test('created age group appears in the list and in the class form', async ({ authedPage }) => {
    const page = authedPage;
    const groupName = `فئة اختبار ${Date.now()}`;

    await openTab(page, 'فئات عمرية');
    await createAgeGroup(page, {
      name: groupName,
      gender: 'male_only',
      minAge: 7,
      maxAge: 9,
      description: 'فئة اختبارية للأطفال',
    });

    const row = activePane(page).locator('tbody tr', { hasText: groupName });
    await expect(row).toBeVisible();
    await expect(row).toContainText('7 - 9 سنة');

    await navigate(page, 'الفصول الدراسية');
    await page.getByRole('button', { name: 'إضافة فصل' }).click();
    await expect(modal(page).locator('.modal-title')).toHaveText('إضافة فصل جديد');

    const option = modal(page).locator('select[name="age_group_id"] option', {
      hasText: groupName,
    });
    await expect(option).toBeAttached();

    await modal(page).getByRole('button', { name: 'إلغاء', exact: true }).click();
    await expect(modal(page)).toHaveCount(0);
  });

  test('age group edit and delete reflect in the list', async ({ authedPage }) => {
    const page = authedPage;
    const groupToEdit = `فئة تعديل ${Date.now()}`;
    const groupToDelete = `فئة حذف ${Date.now()}`;

    await openTab(page, 'فئات عمرية');

    await createAgeGroup(page, { name: groupToEdit, gender: 'any', minAge: 5, maxAge: 8 });
    await createAgeGroup(page, { name: groupToDelete, gender: 'any', minAge: 5, maxAge: 8 });

    // Edit the first group.
    const rowToEdit = activePane(page).locator('tbody tr', { hasText: groupToEdit });
    await rowToEdit.getByRole('button', { name: 'تعديل' }).click();
    const editForm = modal(page);
    await expect(editForm.locator('.modal-title')).toHaveText('تعديل الفئة العمرية');
    await editForm.locator('input[name="min_age"]').fill('6');
    await editForm.locator('input[name="max_age"]').fill('10');
    await editForm.getByRole('button', { name: 'حفظ' }).click();
    await expectToast(page, 'success', 'تم تحديث الفئة العمرية بنجاح.');
    await expect(activePane(page).locator('tbody tr', { hasText: groupToEdit })).toContainText(
      '6 - 10 سنة',
    );

    // Delete the second group.
    const rowToDelete = activePane(page).locator('tbody tr', { hasText: groupToDelete });
    await rowToDelete.getByRole('button', { name: 'حذف' }).click();
    await expect(modal(page).locator('.modal-title')).toHaveText('تأكيد الحذف');
    await confirmDialog(page, 'حذف');
    await expectToast(page, 'success', 'تم إلغاء تفعيل الفئة العمرية بنجاح.');

    await expect(activePane(page).locator('tbody tr', { hasText: groupToDelete })).toHaveCount(0);
    await expect(activePane(page).locator('tbody tr', { hasText: groupToEdit })).toBeVisible();
  });

  test('backup tab warns while no association transfer key is set', async ({
    authedPage: page,
  }) => {
    await openTab(page, 'النسخ الاحتياطي');
    const warning = activePane(page).locator('.alert-warning', {
      hasText: 'لم يتم تعيين رمز النقل',
    });
    await expect(warning).toBeVisible();

    await activePane(page).locator('input[name="association_transfer_key"]').fill('branch-key-1');
    await expect(warning).toHaveCount(0);
    await page.getByRole('button', { name: 'حفظ جميع التغييرات' }).click();
    await expectToast(page, 'success', /تم تحديث الإعدادات بنجاح/);

    await navigate(page, 'الرئيسية');
    await navigate(page, 'الإعدادات');
    await openTab(page, 'النسخ الاحتياطي');
    await expect(activePane(page).locator('input[name="association_transfer_key"]')).toHaveValue(
      'branch-key-1',
    );
    await expect(warning).toHaveCount(0);
  });

  test('manual backup writes a non-empty backup file', async ({
    authedPage,
    electronApp,
  }, testInfo) => {
    const page = authedPage;
    const backupDir = testInfo.outputPath('backups');
    fs.mkdirSync(backupDir, { recursive: true });
    await stubOpenDirectoryDialog(electronApp, backupDir);

    await openTab(page, 'النسخ الاحتياطي');
    await activePane(page).getByRole('button', { name: 'اختيار...' }).click();
    const pathInput = activePane(page).locator('input[readonly]');
    await expect(pathInput).toHaveValue(backupDir);

    await activePane(page).getByRole('button', { name: 'نسخ احتياطي الآن' }).click();
    await expectToast(page, 'success', /تم إنشاء النسخة الاحتياطية بنجاح/);

    const files = fs.readdirSync(backupDir).filter((f) => f.endsWith('.qdb'));
    expect(files).toHaveLength(1);

    const backupFilePath = path.join(backupDir, files[0]);
    const stat = fs.statSync(backupFilePath);
    expect(stat.size).toBeGreaterThan(0);
  });
});
