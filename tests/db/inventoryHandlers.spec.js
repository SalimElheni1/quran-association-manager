// Inventory handlers against a real database.
const { useRealDb } = require('./helpers/realDb');
const { registerFinancialHandlers } = require('../../src/main/handlers/financialHandlers');
const { registerInventoryHandlers } = require('../../src/main/handlers/inventoryHandlers');

const ctx = useRealDb({ register: [registerFinancialHandlers, registerInventoryHandlers] });

beforeEach(() => ctx.resetDatabase());

const CASH_ACCOUNT = 1; // 'الخزينة', seeded by migration 018

/** What «إضافة تبرع عيني» sends: the income and the item that came in. */
const donation = ({ voucher, itemName }) => ({
  transaction: {
    category: 'التبرعات العينية',
    amount: 300,
    transaction_date: '2026-10-05',
    description: JSON.stringify({ item_name: itemName, quantity: 10, unit_value: 30 }),
    payment_method: 'CASH',
    voucher_number: voucher,
    account_id: CASH_ACCOUNT,
  },
  item: {
    item_name: itemName,
    category: 'أثاث',
    quantity: 10,
    unit_value: 30,
    acquisition_date: '2026-10-05',
    acquisition_source: 'تبرع',
    condition_status: 'جديد',
    location: '',
    notes: '',
  },
});

const incomes = () =>
  ctx.all("SELECT amount FROM transactions WHERE type = 'INCOME' AND voided_at IS NULL");
const items = () => ctx.all('SELECT item_name, quantity FROM inventory_items ORDER BY id');
const cash = () =>
  ctx.get('SELECT current_balance FROM accounts WHERE id = ?', [CASH_ACCOUNT]).current_balance;

describe('inventory:add-in-kind', () => {
  test('records the income and the item together', async () => {
    const result = await ctx.invoke(
      'inventory:add-in-kind',
      donation({ voucher: 'V-1', itemName: 'كراسي' }),
    );

    expect(result.item).toEqual(expect.objectContaining({ item_name: 'كراسي', quantity: 10 }));
    expect(incomes()).toEqual([{ amount: 300 }]);
    expect(items()).toEqual([{ item_name: 'كراسي', quantity: 10 }]);
    expect(cash()).toBe(300);
  });

  test('records neither when the item cannot be added', async () => {
    await ctx.invoke('inventory:add-in-kind', donation({ voucher: 'V-1', itemName: 'كراسي' }));
    ctx.expectErrorLogs(); // the handlers log the failure
    const withoutCategory = donation({ voucher: 'V-2', itemName: 'طاولات' });
    withoutCategory.item.category = null;

    const message = await ctx.rejectionMessage(
      ctx.invoke('inventory:add-in-kind', withoutCategory),
    );

    expect(message).toMatch(/NOT NULL constraint failed: inventory_items\.category/);
    // The second income was rolled back with the item.
    expect(incomes()).toEqual([{ amount: 300 }]);
    expect(items()).toEqual([{ item_name: 'كراسي', quantity: 10 }]);
    expect(cash()).toBe(300);
  });
});
