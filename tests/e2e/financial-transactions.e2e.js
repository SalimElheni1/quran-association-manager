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

function dayOfThisMonth(day) {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${String(day).padStart(2, '0')}`;
}

async function addExpense(page, { voucher, amount, category, day }) {
  await openTab(page, 'المصاريف');
  await activePane(page).getByRole('button', { name: 'إضافة مصروف' }).click();
  await expect(modal(page).locator('.modal-title')).toHaveText('إضافة مصروف');
  const form = modal(page);
  await form.locator('input[name="transaction_date"]').fill(dayOfThisMonth(day));
  await form.locator('select[name="category"]').selectOption(category);
  await form.locator('input[name="voucher_number"]').fill(voucher);
  await form.locator('input[name="amount"]').fill(String(amount));
  await form.getByRole('button', { name: 'حفظ' }).click();
  await expectToast(page, 'success', 'تم إضافة المصروف بنجاح');
  // A print-preview modal opens after every new transaction. Close it; never click طباعة.
  await expect(modal(page).locator('.modal-title')).toHaveText('إذن بالدفع');
  await modal(page).getByRole('button', { name: 'إغلاق', exact: true }).click();
  await expectNoModal(page);
}

/** Formats an amount exactly like TransactionTable (Intl ar-TN, TND, 3 decimals). */
function formatCurrency(page, value) {
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

function expenseRow(page, voucher) {
  return activePane(page).locator('tbody tr', { hasText: voucher });
}

async function expectVouchers(page, shown, hidden) {
  for (const v of shown) await expect(expenseRow(page, v)).toHaveCount(1);
  for (const v of hidden) await expect(expenseRow(page, v)).toHaveCount(0);
}

const RENT = { voucher: 'FLT-RENT', amount: 300, category: 'كراء وفواتير', day: 5 };
const PAPER = { voucher: 'FLT-PAPER', amount: 45, category: 'لوازم مكتبية وصيانة', day: 12 };
const PRIZES = { voucher: 'FLT-PRIZES', amount: 120, category: 'المسابقات والجوائز', day: 20 };
const ALL = [RENT.voucher, PAPER.voucher, PRIZES.voucher];

test.describe('expense list', () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await navigate(page, 'الشؤون المالية');
    await expect(page.getByRole('tab', { name: 'لوحة التحكم' })).toBeVisible();
  });

  test('search, category and date filters narrow the list and clearing them restores it', async ({
    authedPage: page,
  }) => {
    for (const expense of [RENT, PAPER, PRIZES]) await addExpense(page, expense);
    await expectVouchers(page, ALL, []);
    const filters = activePane(page).locator('.filter-bar');

    await filters.getByPlaceholder('البحث...').fill('PAPER');
    await expectVouchers(page, [PAPER.voucher], [RENT.voucher, PRIZES.voucher]);
    await filters.getByPlaceholder('البحث...').fill('');
    await expectVouchers(page, ALL, []);

    await filters.locator('select.filter-select').selectOption(RENT.category);
    await expectVouchers(page, [RENT.voucher], [PAPER.voucher, PRIZES.voucher]);
    await filters.locator('select.filter-select').selectOption('');
    await expectVouchers(page, ALL, []);

    const [from, to] = [
      filters.locator('input[type="date"]').nth(0),
      filters.locator('input[type="date"]').nth(1),
    ];
    await from.fill(dayOfThisMonth(10));
    await to.fill(dayOfThisMonth(25));
    await expectVouchers(page, [PAPER.voucher, PRIZES.voucher], [RENT.voucher]);
    await from.fill('');
    await to.fill('');
    await expectVouchers(page, ALL, []);
  });

  test("editing an expense's category and amount updates its row", async ({ authedPage: page }) => {
    await addExpense(page, PAPER);

    await expenseRow(page, PAPER.voucher).getByRole('button', { name: 'تعديل العملية' }).click();
    const form = modal(page);
    await expect(form.locator('.modal-title')).toHaveText('تعديل مصروف');
    await expect(form.locator('select[name="category"]')).toHaveValue(PAPER.category);
    await form.locator('select[name="category"]').selectOption('نفقات متنوعة');
    await form.locator('input[name="amount"]').fill('62.5');
    await form.getByRole('button', { name: 'حفظ التعديلات' }).click();
    await expectToast(page, 'success', 'تم تحديث المصروف بنجاح');
    await expectNoModal(page);

    // Columns: # | date | voucher | category | income type | amount | payment method | actions
    const cells = expenseRow(page, PAPER.voucher).locator('td');
    await expect(cells.nth(3)).toHaveText('نفقات متنوعة');
    await expect(cells.nth(5)).toHaveText(await formatCurrency(page, 62.5));

    // The category filter follows the new category.
    const filters = activePane(page).locator('.filter-bar');
    await filters.locator('select.filter-select').selectOption(PAPER.category);
    await expect(expenseRow(page, PAPER.voucher)).toHaveCount(0);
    await filters.locator('select.filter-select').selectOption('نفقات متنوعة');
    await expect(expenseRow(page, PAPER.voucher)).toHaveCount(1);
  });
});
