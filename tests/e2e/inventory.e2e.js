const {
  test,
  expect,
  navigate,
  modal,
  expectToast,
  confirmDialog,
  expectNoModal,
} = require('./fixtures');

function activePane(page) {
  return page.locator('.tab-pane.active');
}

function midMonthDate() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${now.getFullYear()}-${month}-15`;
}

async function openInventoryTab(page) {
  await navigate(page, 'الشؤون المالية');
  await expect(page.getByRole('tab', { name: 'الجرد' })).toBeVisible();
  const tab = page.getByRole('tab', { name: 'الجرد', exact: true });
  if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}

async function openIncomeTab(page) {
  const tab = page.getByRole('tab', { name: 'المداخيل', exact: true });
  if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}

async function fillInventoryForm(page, { itemName, category, quantity, unitValue, condition }) {
  const form = modal(page);
  await form.locator('input[name="item_name"]').fill(itemName);
  await form.locator('select[name="category"]').selectOption(category);
  await form.locator('input[name="quantity"]').fill(String(quantity));
  await form.locator('input[name="unit_value"]').fill(String(unitValue));
  if (condition) await form.locator('select[name="condition_status"]').selectOption(condition);
}

async function addInventoryItem(page, item) {
  await activePane(page).getByRole('button', { name: 'إضافة صنف جديد' }).click();
  await expect(modal(page).locator('.modal-title')).toHaveText('إضافة صنف جديد');
  await fillInventoryForm(page, item);
  await modal(page).getByRole('button', { name: 'إضافة الصنف' }).click();
  await expectToast(page, 'success', 'تمت إضافة الصنف بنجاح.');
  await expectNoModal(page);
}

function inventoryRow(page, itemName) {
  return activePane(page).locator('tbody tr', { hasText: itemName });
}

async function addInKindDonation(page, donation) {
  // The green (success) button in the tab header records an in-kind donation.
  await activePane(page).locator('button.btn-success', { hasText: 'إضافة تبرع عيني' }).click();
  await expect(modal(page).locator('.modal-title')).toHaveText('إضافة تبرع عيني');

  const form = modal(page);
  await form.locator('input[name="transaction_date"]').fill(donation.date);
  await form.locator('input[name="item_name"]').fill(donation.itemName);
  await form.locator('select[name="item_category"]').selectOption(donation.category);
  await form.locator('input[name="quantity"]').fill(String(donation.quantity));
  await form.locator('input[name="unit_value"]').fill(String(donation.unitValue));
  await form.locator('select[name="condition_status"]').selectOption(donation.condition);

  await modal(page).getByRole('button', { name: 'حفظ' }).click();
  await expectToast(page, 'success', 'تم إضافة التبرع العيني بنجاح');
  await expectNoModal(page);
}

function formatCurrencyTN(page, value) {
  return page.evaluate(
    (v) =>
      new Intl.NumberFormat('ar-TN', {
        style: 'currency',
        currency: 'TND',
        minimumFractionDigits: 3,
      }).format(v),
    value,
  );
}

test.describe('inventory', () => {
  test.beforeEach(async ({ authedPage }) => {
    await openInventoryTab(authedPage);
  });

  test('adding an inventory item shows a success toast and a new row', async ({
    authedPage: page,
  }) => {
    await addInventoryItem(page, {
      itemName: 'حاسوب محمول E2E',
      category: 'إلكترونيات',
      quantity: 3,
      unitValue: 450,
      condition: 'New',
    });

    const row = inventoryRow(page, 'حاسوب محمول E2E');
    await expect(row).toBeVisible();
    await expect(row.locator('td').nth(3)).toHaveText('3');
    await expect(row.locator('td').nth(2)).toHaveText('إلكترونيات');
  });

  test('editing an item updates the row and shows a success toast', async ({
    authedPage: page,
  }) => {
    await addInventoryItem(page, {
      itemName: 'طابعة حبر E2E',
      category: 'Bureautique',
      quantity: 2,
      unitValue: 120,
      condition: 'Good',
    });

    const oldRow = inventoryRow(page, 'طابعة حبر E2E');
    await oldRow.getByRole('button', { name: 'تعديل' }).click();

    await expect(modal(page).locator('.modal-title')).toHaveText('تعديل صنف');
    await fillInventoryForm(page, {
      itemName: 'ماسح ضوئي E2E',
      category: 'إلكترونيات',
      quantity: 5,
      unitValue: 95,
      condition: 'Good',
    });
    await modal(page).getByRole('button', { name: 'حفظ التعديلات' }).click();

    await expectToast(page, 'success', 'تم تعديل الصنف بنجاح.');
    await expectNoModal(page);

    const newRow = inventoryRow(page, 'ماسح ضوئي E2E');
    await expect(newRow).toBeVisible();
    await expect(newRow.locator('td').nth(3)).toHaveText('5');
    await expect(inventoryRow(page, 'طابعة حبر E2E')).toHaveCount(0);
  });

  test('deleting an item removes the row after confirmation', async ({ authedPage: page }) => {
    await addInventoryItem(page, {
      itemName: 'مكتبة خشبية E2E',
      category: 'أخرى',
      quantity: 1,
      unitValue: 180,
      condition: 'New',
    });

    const row = inventoryRow(page, 'مكتبة خشبية E2E');
    await row.getByRole('button', { name: 'حذف' }).click();

    await expect(modal(page).locator('.modal-title')).toHaveText('تأكيد الحذف');
    await confirmDialog(page, 'تأكيد');

    await expectToast(page, 'success', 'تم حذف الصنف "مكتبة خشبية E2E" بنجاح.');
    await expect(inventoryRow(page, 'مكتبة خشبية E2E')).toHaveCount(0);
  });

  test('in-kind donations without a voucher number create inventory items and income', async ({
    authedPage: page,
  }) => {
    const books = {
      date: midMonthDate(),
      itemName: 'كتب تعليمية E2E',
      category: 'كتب ومراجع',
      quantity: 4,
      unitValue: 15,
      condition: 'New',
    };
    const chairs = { ...books, itemName: 'كراسي بلاستيكية E2E', category: 'أخرى', quantity: 10 };

    // The voucher number is optional for in-kind donations; two without one must not collide.
    await addInKindDonation(page, books);
    await addInKindDonation(page, chairs);

    const row = inventoryRow(page, books.itemName);
    await expect(row).toBeVisible();
    await expect(row.locator('td').nth(3)).toHaveText(String(books.quantity));
    await expect(row.locator('td').nth(2)).toHaveText(books.category);
    await expect(row.locator('td').nth(6)).toHaveText('تبرع');
    await expect(inventoryRow(page, chairs.itemName)).toBeVisible();

    // Each donation is recorded as income and the Income tab shows it without a manual refresh.
    await openIncomeTab(page);
    const incomeRows = activePane(page).locator('tbody tr', { hasText: 'التبرعات العينية' });
    await expect(incomeRows).toHaveCount(2);
    for (const donation of [books, chairs]) {
      const amount = await formatCurrencyTN(page, donation.quantity * donation.unitValue);
      await expect(incomeRows.filter({ hasText: amount })).toHaveCount(1);
    }
  });
});
