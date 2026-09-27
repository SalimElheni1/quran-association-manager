const {
  test,
  expect,
  navigate,
  modal,
  expectToast,
  confirmDialog,
  expectNoModal,
} = require('./fixtures');

/** Opens the 'إدارة الفئات' tab if not already active. */
async function openCategoriesTab(page) {
  const tab = page.getByRole('tab', { name: 'إدارة الفئات', exact: true });
  if ((await tab.getAttribute('aria-selected')) !== 'true') {
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
  }
}

/** Adds a category through the modal and asserts the success toast. */
async function addCategory(page, name) {
  await page.getByRole('button', { name: '+ إضافة فئة' }).click();
  await expect(modal(page).locator('.modal-title')).toHaveText('إضافة فئة جديدة');
  await modal(page).locator('input[placeholder="مثال: أثاث"]').fill(name);
  await modal(page).getByRole('button', { name: 'حفظ' }).click();
  await expectToast(page, 'success', 'تم إضافة الفئة بنجاح');
  await expectNoModal(page);
}

/** Edits a category by its current name and asserts the success toast. */
async function editCategory(page, oldName, newName) {
  const row = page.locator('tbody tr', { hasText: oldName });
  await row.getByRole('button', { name: 'تعديل' }).click();
  await expect(modal(page).locator('.modal-title')).toHaveText('تعديل فئة');
  await modal(page).locator('input[placeholder="مثال: أثاث"]').fill(newName);
  await modal(page).getByRole('button', { name: 'حفظ' }).click();
  await expectToast(page, 'success', 'تم تحديث الفئة بنجاح');
  await expectNoModal(page);
}

/** Deletes a category by its name and asserts the success toast. */
async function deleteCategory(page, name) {
  const row = page.locator('tbody tr', { hasText: name });
  await row.getByRole('button', { name: 'حذف' }).click();
  await expect(modal(page).locator('.modal-title')).toHaveText('تأكيد حذف الفئة');
  await confirmDialog(page);
  await expectToast(page, 'success', 'تم حذف الفئة بنجاح');
}

/**
 * Asserts the inventory add-item form offers a category. The form loads its categories
 * after opening, so use a retrying assertion rather than reading the options once.
 */
async function expectInventoryCategoryOption(page, name) {
  await openTab(page, 'الجرد');
  await page.getByRole('button', { name: 'إضافة صنف جديد' }).click();
  await expect(modal(page).locator('.modal-title')).toHaveText('إضافة صنف جديد');
  await expect(
    modal(page).locator('select[name="category"] option', { hasText: name }),
  ).toBeAttached();
  // InventoryFormModal has a close button (X) in header, not an "إلغاء" button
  await modal(page).locator('.btn-close').click();
  await expectNoModal(page);
}

/** Reusable openTab from financials.e2e.js to avoid clicking already-selected tabs. */
async function openTab(page, title) {
  const tab = page.getByRole('tab', { name: title, exact: true });
  if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}

test.describe('إدارة الفئات (in-kind donation categories)', () => {
  test.beforeEach(async ({ authedPage }) => {
    await navigate(authedPage, 'الشؤون المالية');
    await openCategoriesTab(authedPage);
  });

  test('add a category -> toast, it appears in the list', async ({ authedPage: page }) => {
    const name = 'أثاث مكتبي';
    await addCategory(page, name);
    await expect(page.locator('tbody tr', { hasText: name })).toBeVisible();
  });

  test('edit a category name -> toast, list shows new name and not the old one', async ({
    authedPage: page,
  }) => {
    const oldName = 'أجهزة إلكترونية';
    const newName = 'معدات تقنية';
    await addCategory(page, oldName);
    await editCategory(page, oldName, newName);
    await expect(page.locator('tbody tr', { hasText: newName })).toBeVisible();
    await expect(page.locator('tbody tr', { hasText: oldName })).toHaveCount(0);
  });

  test('delete a category -> confirm -> toast, gone from the list', async ({
    authedPage: page,
  }) => {
    const name = 'ملابس مستعملة';
    await addCategory(page, name);
    await deleteCategory(page, name);
    await expect(page.locator('tbody tr', { hasText: name })).toHaveCount(0);
  });

  test('a new category is offered in the inventory tab add-item form category select', async ({
    authedPage: page,
  }) => {
    const catName = 'أدوات مدرسية';
    await addCategory(page, catName);
    await expectInventoryCategoryOption(page, catName);
  });

  test('the save button is disabled while the name is empty', async ({ authedPage: page }) => {
    await page.getByRole('button', { name: '+ إضافة فئة' }).click();
    await expect(modal(page).locator('.modal-title')).toHaveText('إضافة فئة جديدة');
    const saveBtn = modal(page).getByRole('button', { name: 'حفظ' });
    await expect(saveBtn).toBeDisabled();
    await modal(page).locator('input[placeholder="مثال: أثاث"]').fill('فئة اختبار');
    await expect(saveBtn).toBeEnabled();
    await modal(page).getByRole('button', { name: 'إلغاء' }).click();
    await expectNoModal(page);
  });
});
