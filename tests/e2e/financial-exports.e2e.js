const ExcelJS = require('exceljs');
const { test, expect, navigate, modal, expectToast, expectNoModal } = require('./fixtures');

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

async function stubSaveDialog(electronApp, filePath) {
  await electronApp.evaluate(({ dialog }, target) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
  }, filePath);
}

function midMonthDate() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${now.getFullYear()}-${month}-15`;
}

/** Every non-empty cell of the first sheet, as text, row by row. */
async function sheetRows(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const rows = [];
  workbook.worksheets[0].eachRow((row) => {
    rows.push(row.values.filter((v) => v !== undefined && v !== null).map(String));
  });
  return rows;
}

async function addInventoryItem(page, { itemName, category, quantity, unitValue }) {
  await openTab(page, 'الجرد');
  await activePane(page).getByRole('button', { name: 'إضافة صنف جديد' }).click();
  const form = modal(page);
  await form.locator('input[name="item_name"]').fill(itemName);
  await form.locator('select[name="category"]').selectOption(category);
  await form.locator('input[name="quantity"]').fill(String(quantity));
  await form.locator('input[name="unit_value"]').fill(String(unitValue));
  await form.getByRole('button', { name: 'إضافة الصنف' }).click();
  await expectToast(page, 'success', 'تمت إضافة الصنف بنجاح.');
  await expectNoModal(page);
}

async function addTransaction(page, { kind, voucher, amount }) {
  const income = kind === 'income';
  await openTab(page, income ? 'المداخيل' : 'المصاريف');
  await activePane(page)
    .getByRole('button', { name: income ? 'إضافة مدخول' : 'إضافة مصروف' })
    .click();
  const form = modal(page);
  await form.locator('input[name="transaction_date"]').fill(midMonthDate());
  if (income) await form.locator('select[name="receipt_type"]').selectOption('تبرع');
  else await form.locator('select[name="category"]').selectOption('نفقات متنوعة');
  await form.locator('input[name="voucher_number"]').fill(voucher);
  await form.locator('input[name="amount"]').fill(String(amount));
  await form.getByRole('button', { name: 'حفظ' }).click();
  await expectToast(page, 'success', income ? 'تم إضافة المدخول بنجاح' : 'تم إضافة المصروف بنجاح');
  // A print-preview modal opens after every new transaction. Close it; never click طباعة.
  await expect(modal(page).locator('.modal-title')).toHaveText(
    income ? 'وصل استلام' : 'إذن بالدفع',
  );
  await modal(page).getByRole('button', { name: 'إغلاق', exact: true }).click();
  await expectNoModal(page);
}

/** Exports one report from the dashboard's export dialog for the current month. */
async function exportFromDashboard(page, reportLabel) {
  await openTab(page, 'لوحة التحكم');
  await activePane(page).getByRole('button', { name: 'تصدير التقارير' }).click();
  await expect(modal(page).locator('.modal-title')).toHaveText('تصدير التقارير المالية');
  await modal(page).getByLabel(reportLabel, { exact: true }).check();
  await modal(page).getByRole('button', { name: 'تصدير التقرير' }).click();
  await expect(modal(page).locator('.alert-success')).toHaveText('تم تصدير التقرير بنجاح!');
  await modal(page).getByRole('button', { name: 'إغلاق', exact: true }).click();
  await expectNoModal(page);
}

test.describe('financial exports', () => {
  test.beforeEach(async ({ authedPage }) => {
    await navigate(authedPage, 'الشؤون المالية');
    await expect(authedPage.getByRole('tab', { name: 'لوحة التحكم' })).toBeVisible();
  });

  test('the inventory ledger lists each item under its category with its value', async ({
    authedPage: page,
    electronApp,
  }, testInfo) => {
    await addInventoryItem(page, {
      itemName: 'مصحف مجلد',
      category: 'إلكترونيات',
      quantity: 12,
      unitValue: 25,
    });

    await openTab(page, 'التقارير المالية');
    const filePath = testInfo.outputPath('inventory-ledger.xlsx');
    await stubSaveDialog(electronApp, filePath);
    await activePane(page).getByRole('button', { name: 'تصدير سجل الجرد (Excel)' }).click();
    await expect(activePane(page).locator('.alert-success')).toHaveText(
      'تم تصدير سجل الجرد بنجاح!',
    );

    const rows = await sheetRows(filePath);
    expect(rows[0]).toEqual([
      'الأصول الملموسة',
      'التسمية',
      'تاريخ الإقتناء',
      'تكلفة الوحدة',
      'الكمية',
      'القيمة',
      'الملاحظات',
    ]);
    const itemRow = rows.find((r) => r.includes('مصحف مجلد'));
    expect(itemRow).toBeDefined();
    // category | name | date | unit cost | quantity | value | notes
    expect(itemRow[0]).toBe('إلكترونيات');
    expect(itemRow.slice(3, 6)).toEqual(['25', '12', '300']);
  });

  test('the inventory register from the export dialog lists the items', async ({
    authedPage: page,
    electronApp,
  }, testInfo) => {
    await addInventoryItem(page, {
      itemName: 'حامل مصاحف خشبي',
      category: 'إلكترونيات',
      quantity: 4,
      unitValue: 18.5,
    });

    const filePath = testInfo.outputPath('inventory-register.xlsx');
    await stubSaveDialog(electronApp, filePath);
    await exportFromDashboard(page, 'سجل الجرد');

    const rows = await sheetRows(filePath);
    expect(rows.flat()).toContain('سجل جرد العقارات والمنقولات');
    const itemRow = rows.find((r) => r.includes('حامل مصاحف خشبي'));
    expect(itemRow).toBeDefined();
    // number | name | category | quantity | unit value | total | ...
    expect(itemRow.slice(0, 6)).toEqual([
      '1',
      'حامل مصاحف خشبي',
      'إلكترونيات',
      '4',
      '18.500',
      '74.000',
    ]);
  });

  test('the financial summary totals the month income and expenses', async ({
    authedPage: page,
    electronApp,
  }, testInfo) => {
    await addTransaction(page, { kind: 'income', voucher: 'SUM-IN-1', amount: 150 });
    await addTransaction(page, { kind: 'income', voucher: 'SUM-IN-2', amount: 50 });
    await addTransaction(page, { kind: 'expense', voucher: 'SUM-EX-1', amount: 40 });

    const filePath = testInfo.outputPath('financial-summary.xlsx');
    await stubSaveDialog(electronApp, filePath);
    await exportFromDashboard(page, 'التقرير المالي');

    const rows = await sheetRows(filePath);
    expect(rows).toContainEqual(['مجموع المداخيل', '200.000 د.ت']);
    expect(rows).toContainEqual(['مجموع المصاريف', '40.000 د.ت']);
    expect(rows).toContainEqual(['نفقات متنوعة', '40.000 د.ت']);
  });
});
