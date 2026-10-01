const { useRealDb } = require('./helpers/realDb');
const { addStudent } = require('./helpers/fixtures');
const { registerFinancialHandlers } = require('../../src/main/handlers/financialHandlers');
const { registerStudentHandlers } = require('../../src/main/handlers/studentHandlers');
const { registerStudentFeeHandlers } = require('../../src/main/handlers/studentFeeHandlers');

const ctx = useRealDb({
  register: [registerFinancialHandlers, registerStudentHandlers, registerStudentFeeHandlers],
});

beforeEach(() => ctx.resetDatabase());

const CASH_ACCOUNT = 1; // 'الخزينة', seeded by migration 018

const income = (overrides = {}) => ({
  type: 'INCOME',
  category: 'التبرعات النقدية',
  amount: 100,
  transaction_date: '2026-10-05',
  description: 'تبرع',
  payment_method: 'CASH',
  voucher_number: 'V-1',
  account_id: CASH_ACCOUNT,
  ...overrides,
});

const expense = (overrides = {}) =>
  income({ type: 'EXPENSE', category: 'كراء', description: 'كراء المقر', ...overrides });

const balance = () =>
  ctx.get('SELECT current_balance FROM accounts WHERE id = ?', [CASH_ACCOUNT]).current_balance;
const stored = (id) => ctx.get('SELECT * FROM transactions WHERE id = ?', [id]);
const transactionCount = () => ctx.get('SELECT COUNT(*) AS n FROM transactions').n;
const listedIds = async (filters) =>
  (await ctx.invoke('transactions:get', filters)).map((transaction) => transaction.id);

const OCTOBER = { startDate: '2026-10-01', endDate: '2026-10-31' };

describe('transactions: add', () => {
  test('an income is stored with its matricule and author, and adds to the account balance', async () => {
    const added = await ctx.invoke('transactions:add', income({ amount: 120.5 }));

    expect(stored(added.id)).toMatchObject({
      matricule: 'I-2026-001',
      type: 'INCOME',
      category: 'التبرعات النقدية',
      amount: 120.5,
      transaction_date: '2026-10-05',
      payment_method: 'CASH',
      voucher_number: 'V-1',
      account_id: CASH_ACCOUNT,
      created_by_user_id: ctx.user.id,
      requires_dual_signature: 0,
      voided_at: null,
    });
    expect(balance()).toBe(120.5);
  });

  test('incomes and expenses are numbered separately per year, and an expense lowers the balance', async () => {
    const first = await ctx.invoke('transactions:add', income({ voucher_number: 'V-1' }));
    const second = await ctx.invoke('transactions:add', income({ voucher_number: 'V-2' }));
    const spent = await ctx.invoke(
      'transactions:add',
      expense({ amount: 30, voucher_number: 'E-1' }),
    );

    expect([first, second, spent].map((t) => stored(t.id).matricule)).toEqual([
      'I-2026-001',
      'I-2026-002',
      'E-2026-001',
    ]);
    expect(balance()).toBe(170);
  });

  test('cash over 500 is refused and nothing is recorded', async () => {
    ctx.expectErrorLogs();

    await expect(ctx.invoke('transactions:add', income({ amount: 500.01 }))).rejects.toThrow(
      'المبالغ التي تتجاوز 500 دينار يجب أن تكون عبر شيك أو تحويل بنكي',
    );

    expect(transactionCount()).toBe(0);
    expect(balance()).toBe(0);
  });

  test('exactly 500 in cash is accepted', async () => {
    await ctx.invoke('transactions:add', income({ amount: 500 }));

    expect(balance()).toBe(500);
  });

  test('more than 500 by cheque is accepted and flagged for a second signature', async () => {
    const added = await ctx.invoke(
      'transactions:add',
      income({ amount: 800, payment_method: 'CHECK', check_number: 'CH-9' }),
    );

    expect(stored(added.id)).toMatchObject({ check_number: 'CH-9', requires_dual_signature: 1 });
    expect(balance()).toBe(800);
  });

  test('a transaction with invalid data is refused and nothing is recorded', async () => {
    await expect(ctx.invoke('transactions:add', income({ amount: -5 }))).rejects.toThrow(
      'بيانات غير صالحة',
    );
    await expect(ctx.invoke('transactions:add', income({ voucher_number: '' }))).rejects.toThrow(
      'بيانات غير صالحة',
    );

    expect(transactionCount()).toBe(0);
  });

  test('only a logged-in user with a finance role can record money', async () => {
    await expect(ctx.invokeWithoutSession('transactions:add', income())).rejects.toThrow(
      'مطلوب تسجيل الدخول.',
    );
    await expect(ctx.invokeAs(['SessionSupervisor'], 'transactions:add', income())).rejects.toThrow(
      'غير مسموح به.',
    );

    const added = await ctx.invokeAs(['FinanceManager'], 'transactions:add', income());
    expect(stored(added.id).amount).toBe(100);
    expect(transactionCount()).toBe(1);
  });
});

describe('transactions: voucher numbers', () => {
  const DUPLICATE = 'رقم الوصل موجود مسبقاً. الرجاء استخدام رقم آخر';

  test('a voucher number already used by another income is refused and the balance is unchanged', async () => {
    ctx.expectErrorLogs();
    await ctx.invoke('transactions:add', income({ voucher_number: 'V-7' }));

    await expect(
      ctx.invoke('transactions:add', income({ voucher_number: 'V-7', amount: 40 })),
    ).rejects.toThrow(DUPLICATE);

    expect(transactionCount()).toBe(1);
    expect(balance()).toBe(100);
  });

  test('an income and an expense may carry the same voucher number', async () => {
    await ctx.invoke('transactions:add', income({ voucher_number: 'V-8' }));

    await ctx.invoke('transactions:add', expense({ voucher_number: 'V-8', amount: 10 }));

    expect(ctx.get("SELECT COUNT(*) AS n FROM transactions WHERE voucher_number = 'V-8'").n).toBe(
      2,
    );
  });

  test('the voucher number of a voided transaction can be used again', async () => {
    const voided = await ctx.invoke('transactions:add', income({ voucher_number: 'V-9' }));
    await ctx.invoke('transactions:delete', voided.id);

    const corrected = await ctx.invoke(
      'transactions:add',
      income({ voucher_number: 'V-9', amount: 90 }),
    );

    expect(stored(corrected.id).voucher_number).toBe('V-9');
    expect(stored(voided.id).voucher_number).toBe('V-9');
  });

  test('editing a transaction onto a voucher number in use is refused and the edit is undone', async () => {
    ctx.expectErrorLogs();
    await ctx.invoke('transactions:add', income({ voucher_number: 'V-10' }));
    const other = await ctx.invoke(
      'transactions:add',
      income({ voucher_number: 'V-11', amount: 50 }),
    );

    await expect(
      ctx.invoke('transactions:update', other.id, income({ voucher_number: 'V-10', amount: 70 })),
    ).rejects.toThrow(DUPLICATE);

    expect(stored(other.id)).toMatchObject({ voucher_number: 'V-11', amount: 50 });
    expect(balance()).toBe(150);
  });
});

describe('transactions: update', () => {
  test('changing the amount moves the account balance by the difference', async () => {
    const added = await ctx.invoke('transactions:add', income({ amount: 100 }));

    await ctx.invoke('transactions:update', added.id, income({ amount: 260, description: 'معدل' }));

    expect(stored(added.id)).toMatchObject({ amount: 260, description: 'معدل' });
    expect(balance()).toBe(260);
  });

  test('turning an income into an expense reverses it and applies the expense', async () => {
    const added = await ctx.invoke('transactions:add', income({ amount: 100 }));

    await ctx.invoke('transactions:update', added.id, expense({ amount: 100 }));

    expect(stored(added.id).type).toBe('EXPENSE');
    expect(balance()).toBe(-100);
  });

  test('an edit to more than 500 in cash is refused and the transaction is unchanged', async () => {
    ctx.expectErrorLogs();
    const added = await ctx.invoke('transactions:add', income({ amount: 100 }));

    await expect(
      ctx.invoke('transactions:update', added.id, income({ amount: 501 })),
    ).rejects.toThrow('المبالغ التي تتجاوز 500 دينار');

    expect(stored(added.id).amount).toBe(100);
    expect(balance()).toBe(100);
  });
});

describe('transactions: void', () => {
  test('a voided transaction is kept with who voided it and when, and its amount leaves the balance', async () => {
    const kept = await ctx.invoke(
      'transactions:add',
      income({ voucher_number: 'V-1', amount: 70 }),
    );
    const voided = await ctx.invoke(
      'transactions:add',
      income({ voucher_number: 'V-2', amount: 30 }),
    );

    expect(await ctx.invoke('transactions:delete', voided.id)).toEqual({ id: voided.id });

    const row = stored(voided.id);
    expect(row).toMatchObject({ amount: 30, voided_by: ctx.user.id });
    expect(row.voided_at).toMatch(/^\d{4}-\d{2}-\d{2}/);
    expect(balance()).toBe(70);
    expect(await listedIds()).toEqual([kept.id]);
    expect(await listedIds({ showVoided: true })).toEqual([voided.id]);
  });

  test('a transaction cannot be voided twice or edited once voided', async () => {
    ctx.expectErrorLogs();
    const added = await ctx.invoke('transactions:add', income());
    await ctx.invoke('transactions:delete', added.id);

    await expect(ctx.invoke('transactions:delete', added.id)).rejects.toThrow(
      'هذه العملية ملغاة بالفعل.',
    );
    await expect(
      ctx.invoke('transactions:update', added.id, income({ amount: 5 })),
    ).rejects.toThrow('لا يمكن تعديل عملية ملغاة.');
    expect(balance()).toBe(0);
    expect(stored(added.id).amount).toBe(100);
  });

  test('voided money is left out of the summary, the earliest date and the reconciled balance', async () => {
    await ctx.invoke('transactions:add', income({ voucher_number: 'V-1', amount: 200 }));
    await ctx.invoke('transactions:add', expense({ voucher_number: 'E-1', amount: 50 }));
    const voidedIncome = await ctx.invoke(
      'transactions:add',
      income({ voucher_number: 'V-2', amount: 400, transaction_date: '2026-10-01' }),
    );
    const voidedExpense = await ctx.invoke(
      'transactions:add',
      expense({ voucher_number: 'E-2', amount: 25 }),
    );
    await ctx.invoke('transactions:delete', voidedIncome.id);
    await ctx.invoke('transactions:delete', voidedExpense.id);

    const summary = await ctx.invoke('financial:get-summary', OCTOBER);

    expect(summary).toMatchObject({
      totalIncome: 200,
      totalExpenses: 50,
      balance: 150,
      transactionCount: 2,
    });
    expect(summary.recentTransactions.map((t) => t.id)).not.toContain(voidedIncome.id);
    expect(await ctx.invoke('transactions:get-earliest-date')).toEqual({ date: '2026-10-05' });

    ctx.run('UPDATE accounts SET current_balance = 9999 WHERE id = ?', [CASH_ACCOUNT]);
    await ctx.invoke('financial:reconcile');
    expect(balance()).toBe(150);
  });
});

describe('financial summary', () => {
  test('the summary totals the period by category and leaves other periods out', async () => {
    await ctx.invoke('transactions:add', income({ voucher_number: 'V-1', amount: 100 }));
    await ctx.invoke('transactions:add', income({ voucher_number: 'V-2', amount: 50 }));
    await ctx.invoke(
      'transactions:add',
      income({
        voucher_number: 'V-3',
        amount: 999,
        transaction_date: '2026-11-02',
        payment_method: 'TRANSFER',
      }),
    );
    await ctx.invoke('transactions:add', expense({ voucher_number: 'E-1', amount: 40 }));

    const summary = await ctx.invoke('financial:get-summary', OCTOBER);

    expect(summary.totalIncome).toBe(150);
    expect(summary.totalExpenses).toBe(40);
    expect(summary.incomeByCategory).toEqual([{ category: 'تبرع', total: 150, count: 2 }]);
    expect(summary.expensesByCategory).toEqual([{ category: 'كراء', total: 40, count: 1 }]);
  });
});

describe('fee payments in the ledger', () => {
  async function studentWithPayment(amount) {
    ctx.setSettings({ annual_fee: 60, standard_monthly_fee: 0 });
    const studentId = await addStudent(ctx);
    const payment = await ctx.invoke('student-fees:recordPayment', {
      student_id: studentId,
      amount,
      payment_method: 'CASH',
      receipt_number: 'R-100',
    });
    return { studentId, payment };
  }

  test('a fee payment counts once in the summary, as student fees', async () => {
    ctx.quietLogs();
    await studentWithPayment(60);
    const today = new Date();
    const day = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const summary = await ctx.invoke('financial:get-summary', { startDate: day, endDate: day });

    expect(summary.totalIncome).toBe(60);
    expect(summary.incomeByCategory).toEqual([{ category: 'رسوم الطلاب', total: 60, count: 1 }]);
    expect(balance()).toBe(60);
  });

  test('the amount of a fee payment cannot be edited from the ledger', async () => {
    ctx.expectErrorLogs();
    ctx.quietLogs();
    const { payment } = await studentWithPayment(60);
    const transaction = stored(payment.transaction_id);

    await expect(
      ctx.invoke('transactions:update', transaction.id, {
        type: 'INCOME',
        category: transaction.category,
        amount: 10,
        transaction_date: transaction.transaction_date,
        payment_method: 'CASH',
        voucher_number: 'R-100',
        account_id: CASH_ACCOUNT,
      }),
    ).rejects.toThrow('هذه العملية مرتبطة برسوم الطلاب');

    expect(stored(transaction.id).amount).toBe(60);
  });

  test('voiding a fee payment from the ledger voids the payment and reopens the charge', async () => {
    ctx.quietLogs();
    const { studentId, payment } = await studentWithPayment(60);

    await ctx.invoke('transactions:delete', payment.transaction_id);

    expect(
      ctx.get('SELECT voided_at FROM student_payments WHERE id = ?', [payment.id]).voided_at,
    ).not.toBeNull();
    expect(stored(payment.transaction_id).voided_at).not.toBeNull();
    expect(
      ctx.get(
        "SELECT status, amount_paid FROM student_fee_charges WHERE student_id = ? AND fee_type = 'ANNUAL'",
        [studentId],
      ),
    ).toEqual({ status: 'UNPAID', amount_paid: 0 });
    expect(balance()).toBe(0);
  });
});
