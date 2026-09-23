const { test, expect, navigate, modal, expectToast, confirmDialog } = require('./fixtures');

// Mid-month date: the dashboard's default period is the current month, and its
// month bounds are computed via toISOString(), which shifts them by a day in
// UTC+ timezones. The 15th is inside the period everywhere.
function midMonthDate() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${now.getFullYear()}-${month}-15`;
}

function activePane(page) {
  return page.locator('.tab-pane.active');
}

// The active tab's animated indicator never settles, so clicking it again hangs on
// Playwright's stability check; only click a tab that isn't already selected.
async function openTab(page, title) {
  const tab = page.getByRole('tab', { name: title, exact: true });
  if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}

/** Fills the transaction modal. Fields not given keep their defaults. */
async function fillTransaction(page, { voucher, amount, receiptType, category, paymentMethod }) {
  const form = modal(page);
  await form.locator('input[name="transaction_date"]').fill(midMonthDate());
  if (category) await form.locator('select[name="category"]').selectOption(category);
  await form.locator('input[name="voucher_number"]').fill(voucher);
  if (receiptType) await form.locator('select[name="receipt_type"]').selectOption(receiptType);
  await form.locator('input[name="amount"]').fill(String(amount));
  if (paymentMethod)
    await form.locator('select[name="payment_method"]').selectOption(paymentMethod);
}

async function addIncome(page, { voucher, amount }) {
  await openTab(page, 'المداخيل');
  await activePane(page).getByRole('button', { name: 'إضافة مدخول' }).click();
  await expect(modal(page).locator('.modal-title')).toHaveText('إضافة مدخول');
  await fillTransaction(page, { voucher, amount, receiptType: 'تبرع' });
  await modal(page).getByRole('button', { name: 'حفظ' }).click();
  await expectToast(page, 'success', 'تم إضافة المدخول بنجاح');
  await closeVoucherModal(page, 'وصل استلام');
}

async function addExpense(page, { voucher, amount }) {
  await openTab(page, 'المصاريف');
  await activePane(page).getByRole('button', { name: 'إضافة مصروف' }).click();
  await expect(modal(page).locator('.modal-title')).toHaveText('إضافة مصروف');
  await fillTransaction(page, { voucher, amount, category: 'نفقات متنوعة' });
  await modal(page).getByRole('button', { name: 'حفظ' }).click();
  await expectToast(page, 'success', 'تم إضافة المصروف بنجاح');
  await closeVoucherModal(page, 'إذن بالدفع');
}

// A print-preview modal opens after every new transaction. Close it; never click طباعة.
async function closeVoucherModal(page, title) {
  await expect(modal(page).locator('.modal-title')).toHaveText(title);
  await modal(page).getByRole('button', { name: 'إغلاق', exact: true }).click();
  await expect(modal(page)).toHaveCount(0);
}

/** Formats a number exactly like SummaryCard (Intl ar-TN, 2 decimals). */
function formatAmount(page, value) {
  return page.evaluate(
    (v) =>
      new Intl.NumberFormat('ar-TN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
        v,
      ),
    value,
  );
}

function summaryValue(page, title) {
  return activePane(page).locator('.card-body', { hasText: title }).locator('h3');
}

test.describe('financials', () => {
  test.beforeEach(async ({ authedPage }) => {
    await navigate(authedPage, 'الشؤون المالية');
    await expect(authedPage.getByRole('tab', { name: 'لوحة التحكم' })).toBeVisible();
  });

  test('income and expense appear in their tables', async ({ authedPage: page }) => {
    await addIncome(page, { voucher: 'E2E-IN-1', amount: 250 });
    const incomeRow = activePane(page).locator('tbody tr', { hasText: 'E2E-IN-1' });
    await expect(incomeRow).toBeVisible();
    await expect(incomeRow.locator('.badge.bg-success')).toHaveText('نقدا');

    await addExpense(page, { voucher: 'E2E-EX-1', amount: 100 });
    const expenseRow = activePane(page).locator('tbody tr', { hasText: 'E2E-EX-1' });
    await expect(expenseRow).toBeVisible();
    await expect(expenseRow).toContainText('نفقات متنوعة');
  });

  test('dashboard totals and net balance reflect new transactions', async ({
    authedPage: page,
  }) => {
    await addIncome(page, { voucher: 'E2E-IN-1', amount: 250 });
    await addIncome(page, { voucher: 'E2E-IN-2', amount: 120.5 });
    await addExpense(page, { voucher: 'E2E-EX-1', amount: 100 });

    await openTab(page, 'لوحة التحكم');
    await expect(summaryValue(page, 'إجمالي المداخيل')).toContainText(
      await formatAmount(page, 370.5),
    );
    await expect(summaryValue(page, 'إجمالي المصاريف')).toContainText(
      await formatAmount(page, 100),
    );
    await expect(summaryValue(page, 'الرصيد الصافي')).toContainText(
      await formatAmount(page, 270.5),
    );
    await expect(summaryValue(page, 'عدد العمليات')).toContainText(await formatAmount(page, 3));
  });

  test('a duplicate voucher number is rejected with the Arabic message', async ({
    authedPage: page,
  }) => {
    await addIncome(page, { voucher: 'E2E-DUP', amount: 50 });
    await activePane(page).getByRole('button', { name: 'إضافة مدخول' }).click();
    await fillTransaction(page, { voucher: 'E2E-DUP', amount: 75, receiptType: 'تبرع' });
    await modal(page).getByRole('button', { name: 'حفظ' }).click();

    await expectToast(page, 'error', 'رقم الوصل موجود مسبقاً');
    await expect(page.locator('.Toastify__toast--error')).not.toContainText('SQLITE');
    await expect(modal(page).locator('.modal-title')).toHaveText('إضافة مدخول');
    await expect(activePane(page).locator('tbody tr', { hasText: 'E2E-DUP' })).toHaveCount(1);
  });

  test('cash over 500 blocks saving until paid by check', async ({ authedPage: page }) => {
    await openTab(page, 'المداخيل');
    await activePane(page).getByRole('button', { name: 'إضافة مدخول' }).click();
    await fillTransaction(page, { voucher: 'E2E-BIG', amount: 600, receiptType: 'تبرع' });

    const form = modal(page);
    const save = form.getByRole('button', { name: 'حفظ' });
    await expect(form.getByText('المبالغ التي تتجاوز 500 دينار')).toBeVisible();
    await expect(save).toBeDisabled();

    await form.locator('select[name="payment_method"]').selectOption('CHECK');
    await form.locator('input[name="check_number"]').fill('CHK-600');
    await expect(form.getByText('المبالغ التي تتجاوز 500 دينار')).toHaveCount(0);
    await expect(save).toBeEnabled();
    await save.click();

    await expectToast(page, 'success', 'تم إضافة المدخول بنجاح');
    await closeVoucherModal(page, 'وصل استلام');
    await expect(activePane(page).locator('tbody tr', { hasText: 'E2E-BIG' })).toBeVisible();
  });

  test('editing an income amount updates the table and dashboard', async ({ authedPage: page }) => {
    await addIncome(page, { voucher: 'E2E-EDIT', amount: 200 });

    const row = activePane(page).locator('tbody tr', { hasText: 'E2E-EDIT' });
    await row.getByRole('button', { name: 'تعديل العملية' }).click();
    const form = modal(page);
    await expect(form.locator('.modal-title')).toHaveText('تعديل مدخول');
    await expect(form.locator('input[name="voucher_number"]')).toHaveValue('E2E-EDIT');
    await form.locator('input[name="amount"]').fill('325');
    await form.getByRole('button', { name: 'حفظ' }).click();

    await expectToast(page, 'success', 'تم تحديث المدخول بنجاح');
    await expect(modal(page)).toHaveCount(0);
    await expect(activePane(page).locator('tbody tr', { hasText: 'E2E-EDIT' })).toHaveCount(1);

    await openTab(page, 'لوحة التحكم');
    await expect(summaryValue(page, 'إجمالي المداخيل')).toContainText(
      await formatAmount(page, 325),
    );
    await expect(summaryValue(page, 'عدد العمليات')).toContainText(await formatAmount(page, 1));
  });

  test('the dashboard refresh button is shown and refreshes totals', async ({
    authedPage: page,
  }) => {
    const refresh = activePane(page).getByRole('button', { name: 'تحديث' });
    await expect(refresh).toBeVisible();
    await refresh.click();
    await expect(refresh).toBeEnabled();
    await expect(summaryValue(page, 'عدد العمليات')).toContainText(await formatAmount(page, 0));
  });

  test('deleting an expense removes it from the table and dashboard', async ({
    authedPage: page,
  }) => {
    await addIncome(page, { voucher: 'E2E-IN-1', amount: 300 });
    await addExpense(page, { voucher: 'E2E-EX-KEEP', amount: 40 });
    await addExpense(page, { voucher: 'E2E-EX-DEL', amount: 90 });

    const row = activePane(page).locator('tbody tr', { hasText: 'E2E-EX-DEL' });
    await row.getByRole('button', { name: 'حذف العملية' }).click();
    await expect(modal(page).locator('.modal-title')).toHaveText('تأكيد حذف المصروف');
    await confirmDialog(page);

    await expectToast(page, 'success', 'تم حذف المصروف بنجاح');
    await expect(activePane(page).locator('tbody tr', { hasText: 'E2E-EX-DEL' })).toHaveCount(0);
    await expect(activePane(page).locator('tbody tr', { hasText: 'E2E-EX-KEEP' })).toBeVisible();

    await openTab(page, 'لوحة التحكم');
    await expect(summaryValue(page, 'إجمالي المصاريف')).toContainText(await formatAmount(page, 40));
    await expect(summaryValue(page, 'الرصيد الصافي')).toContainText(await formatAmount(page, 260));
  });
});
