// Student fee payments: each payment settles its own academic year only (earlier years' arrears
// are kept apart), overpayments become credit, and voiding or refunding a payment reverses it,
// gives back any credit it used and keeps it in history.

const { useFeeWorld } = require('./helpers/feeWorld');

const ctx = useFeeWorld();

const CREDIT_USED =
  'لا يمكن إلغاء أو استرجاع هذه الدفعة لأن رصيدها الزائد استُعمل في دفعة لاحقة. ألغِ الدفعة اللاحقة أولاً.';

// A paying student in a monthly class, billed annual 100 + October 30 for 2026-2027.
async function octoberStudent() {
  ctx.today(2026, 10, 10);
  ctx.branchFees(100, 30);
  const { classId } = await ctx.groupWithClass();
  return ctx.addStudent({ classIds: [classId] });
}

const paymentRow = (id) => ctx.get('SELECT * FROM student_payments WHERE id = ?', [id]);
const transactionRow = (id) => ctx.get('SELECT * FROM transactions WHERE id = ?', [id]);

describe('payments settle their own academic year', () => {
  // Billed annual 100 + June 30 in 2025-2026, then annual 100 + October 30 in 2026-2027.
  async function studentWithArrears() {
    ctx.today(2026, 6, 10);
    ctx.branchFees(100, 30);
    const { classId } = await ctx.groupWithClass();
    const studentId = await ctx.addStudent({ classIds: [classId] });
    ctx.today(2026, 10, 10);
    await ctx.invoke('student-fees:refreshStudentCharges', { studentId });
    return studentId;
  }

  test('a payment for this year leaves earlier years’ arrears unpaid and lists them apart', async () => {
    const studentId = await studentWithArrears();

    await ctx.pay(studentId, 130, { academic_year: '2026-2027' });

    expect(ctx.charges(studentId).map((c) => [c.academic_year, c.fee_type, c.status])).toEqual([
      ['2025-2026', 'ANNUAL', 'UNPAID'],
      ['2025-2026', 'MONTHLY', 'UNPAID'],
      ['2026-2027', 'ANNUAL', 'PAID'],
      ['2026-2027', 'MONTHLY', 'PAID'],
    ]);
    const summary = await ctx.invoke('student-fees:getBalanceSummary', studentId, '2026-2027');
    expect(summary).toMatchObject({
      totalDue: 130,
      totalPaid: 130,
      balance: 0,
      previousYearsBalance: 130,
    });
    expect(summary.previousYears.map((y) => [y.academicYear, y.balance])).toEqual([
      ['2025-2026', 130],
    ]);
    const listed = await ctx.invoke('student-fees:getAll', '2026-2027');
    expect(listed.find((s) => s.id === studentId)).toMatchObject({
      balance: 0,
      previousYearsBalance: 130,
    });
  });

  test('paying more than this year owes becomes credit instead of paying earlier arrears', async () => {
    const studentId = await studentWithArrears();

    await ctx.pay(studentId, 150, { academic_year: '2026-2027' });

    expect(ctx.credit(studentId)).toBe(20);
    expect(
      ctx
        .charges(studentId)
        .filter((c) => c.academic_year === '2025-2026')
        .map((c) => c.status),
    ).toEqual(['UNPAID', 'UNPAID']);
    const summary = await ctx.invoke('student-fees:getBalanceSummary', studentId, '2026-2027');
    expect(summary).toMatchObject({ displayType: 'credit', displayAmount: 20 });
    expect(summary.previousYearsBalance).toBe(130);
  });

  test('a payment recorded for an earlier year settles that year’s arrears only', async () => {
    const studentId = await studentWithArrears();

    await ctx.pay(studentId, 130, { academic_year: '2025-2026' });

    expect(ctx.charges(studentId).map((c) => [c.academic_year, c.status])).toEqual([
      ['2025-2026', 'PAID'],
      ['2025-2026', 'PAID'],
      ['2026-2027', 'UNPAID'],
      ['2026-2027', 'UNPAID'],
    ]);
    const summary = await ctx.invoke('student-fees:getBalanceSummary', studentId, '2026-2027');
    expect(summary).toMatchObject({ balance: 130, previousYears: [], previousYearsBalance: 0 });
  });
});

describe('recording a payment', () => {
  test('a payment is stored with its income transaction and adds to the cash account', async () => {
    const studentId = await octoberStudent();

    const payment = await ctx.pay(studentId, 100, { receipt_number: 'R-1' });

    expect(payment).toMatchObject({
      student_id: studentId,
      amount: 100,
      academic_year: '2026-2027',
      receipt_number: 'R-1',
      voided_at: null,
      refunded: 0,
    });
    expect(transactionRow(payment.transaction_id)).toMatchObject({
      type: 'INCOME',
      category: 'رسوم الطلاب',
      amount: 100,
      voucher_number: 'R-1',
      receipt_type: 'fee_payment',
      account_id: 1,
    });
    expect(ctx.accountBalance()).toBe(100);
    expect(
      ctx
        .charges(studentId)
        .map((c) => c.amount_paid)
        .reduce((a, b) => a + b, 0),
    ).toBe(100);
  });

  test('a receipt number already used by a live payment is refused and nothing is recorded', async () => {
    ctx.expectErrorLogs();
    const studentId = await octoberStudent();
    await ctx.pay(studentId, 30, { receipt_number: 'R-2' });

    await expect(ctx.pay(studentId, 30, { receipt_number: 'R-2' })).rejects.toThrow(
      'رقم الوصل الذي أدخلته موجود بالفعل',
    );

    expect(ctx.get('SELECT COUNT(*) AS n FROM student_payments').n).toBe(1);
    expect(ctx.accountBalance()).toBe(30);
  });

  test('a deleted student cannot be paid for', async () => {
    ctx.expectErrorLogs();
    const studentId = await octoberStudent();
    await ctx.invoke('students:delete', studentId);

    await expect(ctx.pay(studentId, 30)).rejects.toThrow('هذا الطالب محذوف');

    expect(ctx.get('SELECT COUNT(*) AS n FROM student_payments').n).toBe(0);
  });
});

describe('voiding a payment', () => {
  test('a voided payment reopens what it paid, is kept in history and leaves the balance', async () => {
    const studentId = await octoberStudent();
    const payment = await ctx.pay(studentId, 130, { receipt_number: 'R-3' });

    expect(await ctx.invoke('student-fees:deletePayment', { paymentId: payment.id })).toEqual({
      success: true,
      message: 'تم إلغاء الدفعة بنجاح',
    });

    expect(ctx.charges(studentId).map((c) => [c.status, c.amount_paid])).toEqual([
      ['UNPAID', 0],
      ['UNPAID', 0],
    ]);
    expect(ctx.get('SELECT COUNT(*) AS n FROM student_payment_breakdown').n).toBe(0);
    const row = paymentRow(payment.id);
    expect(row.amount).toBe(130);
    expect(row.voided_at).not.toBeNull();
    expect(row.voided_by).toBe(ctx.user.id);
    expect(transactionRow(payment.transaction_id).voided_at).not.toBeNull();
    expect(ctx.accountBalance()).toBe(0);

    const history = await ctx.invoke('student-fees:getPaymentHistory', {
      studentId,
      academicYear: '2026-2027',
    });
    expect(history.map((p) => p.id)).toEqual([payment.id]);
    const summary = await ctx.invoke('student-fees:getBalanceSummary', studentId, '2026-2027');
    expect(summary).toMatchObject({ totalPaid: 0, balance: 130 });
  });

  test('voided fee money is left out of the financial summary', async () => {
    const studentId = await octoberStudent();
    const voided = await ctx.pay(studentId, 100);
    await ctx.pay(studentId, 30);
    await ctx.invoke('student-fees:deletePayment', { paymentId: voided.id });

    const summary = await ctx.invoke('financial:get-summary', {
      startDate: '2026-10-01',
      endDate: '2026-10-31',
    });

    expect(summary.totalIncome).toBe(30);
    expect(summary.incomeByCategory).toEqual([{ category: 'رسوم الطلاب', total: 30, count: 1 }]);
  });

  test('voiding an overpayment removes the credit it created', async () => {
    const studentId = await octoberStudent();
    const payment = await ctx.pay(studentId, 150);
    expect(ctx.credit(studentId)).toBe(20);

    await ctx.invoke('student-fees:deletePayment', { paymentId: payment.id });

    expect(ctx.credit(studentId)).toBe(0);
    expect(
      ctx.get("SELECT COUNT(*) AS n FROM student_fee_charges WHERE fee_type = 'CREDIT'").n,
    ).toBe(0);
  });

  test('voiding a payment that used credit gives the credit back', async () => {
    const studentId = await octoberStudent();
    await ctx.pay(studentId, 150); // pays October in full, 20 left as credit
    ctx.today(2026, 11, 2);
    await ctx.invoke('student-fees:refreshStudentCharges', { studentId });
    const november = await ctx.pay(studentId, 10); // 20 credit + 10 cash pay November's 30
    expect(ctx.credit(studentId)).toBe(0);
    expect(ctx.charges(studentId).find((c) => c.billing_month === '2026-2027-11').status).toBe(
      'PAID',
    );

    await ctx.invoke('student-fees:deletePayment', { paymentId: november.id });

    expect(ctx.credit(studentId)).toBe(20);
    expect(ctx.charges(studentId).find((c) => c.billing_month === '2026-2027-11')).toMatchObject({
      status: 'UNPAID',
      amount_paid: 0,
    });
    expect(ctx.accountBalance()).toBe(150);
  });

  test('a payment whose credit a later payment used cannot be reversed until the later one is', async () => {
    ctx.expectErrorLogs();
    const studentId = await octoberStudent();
    const first = await ctx.pay(studentId, 150);
    ctx.today(2026, 11, 2);
    await ctx.invoke('student-fees:refreshStudentCharges', { studentId });
    const second = await ctx.pay(studentId, 10);

    await expect(ctx.invoke('student-fees:deletePayment', { paymentId: first.id })).rejects.toThrow(
      CREDIT_USED,
    );
    await expect(ctx.invoke('student-fees:refundPayment', { paymentId: first.id })).rejects.toThrow(
      CREDIT_USED,
    );
    expect(paymentRow(first.id)).toMatchObject({ voided_at: null, refunded: 0 });

    await ctx.invoke('student-fees:deletePayment', { paymentId: second.id });
    await ctx.invoke('student-fees:deletePayment', { paymentId: first.id });

    expect(ctx.charges(studentId).every((c) => c.status === 'UNPAID')).toBe(true);
    expect(ctx.credit(studentId)).toBe(0);
    expect(ctx.accountBalance()).toBe(0);
  });

  test('a voided payment cannot be voided or refunded again', async () => {
    ctx.expectErrorLogs();
    const studentId = await octoberStudent();
    const payment = await ctx.pay(studentId, 30);
    await ctx.invoke('student-fees:deletePayment', { paymentId: payment.id });

    await expect(
      ctx.invoke('student-fees:deletePayment', { paymentId: payment.id }),
    ).rejects.toThrow('هذه الدفعة ملغاة بالفعل.');
    await expect(
      ctx.invoke('student-fees:refundPayment', { paymentId: payment.id }),
    ).rejects.toThrow('هذه الدفعة ملغاة بالفعل.');
    expect(ctx.accountBalance()).toBe(0);
  });

  test('the receipt number of a voided payment can be used for the corrected payment', async () => {
    const studentId = await octoberStudent();
    const wrong = await ctx.pay(studentId, 13, { receipt_number: 'R-9' });
    await ctx.invoke('student-fees:deletePayment', { paymentId: wrong.id });

    const corrected = await ctx.pay(studentId, 130, { receipt_number: 'R-9' });

    expect(corrected.receipt_number).toBe('R-9');
    expect(paymentRow(wrong.id).receipt_number).toBe('R-9');
    expect(ctx.accountBalance()).toBe(130);
  });
});

describe('refunding a payment', () => {
  test('a refunded payment no longer counts toward the balance', async () => {
    const studentId = await octoberStudent();
    const payment = await ctx.pay(studentId, 130);

    expect(await ctx.invoke('student-fees:refundPayment', { paymentId: payment.id })).toEqual({
      success: true,
      message: 'تم استرجاع الدفعة بنجاح',
    });

    const summary = await ctx.invoke('student-fees:getBalanceSummary', studentId, '2026-2027');
    expect(summary).toMatchObject({ totalDue: 130, totalPaid: 0, balance: 130 });
    expect(ctx.charges(studentId).map((c) => c.status)).toEqual(['UNPAID', 'UNPAID']);
  });

  test('a refund keeps the payment in history marked refunded and records the money paid back', async () => {
    const studentId = await octoberStudent();
    const payment = await ctx.pay(studentId, 130);

    await ctx.invoke('student-fees:refundPayment', { paymentId: payment.id });

    expect(paymentRow(payment.id)).toMatchObject({ amount: 130, refunded: 1, voided_at: null });
    expect(transactionRow(payment.transaction_id)).toMatchObject({
      type: 'INCOME',
      voided_at: null,
    });
    expect(
      ctx.get(
        "SELECT type, category, amount, related_entity_id, created_by_user_id FROM transactions WHERE category = 'استرجاع رسوم'",
      ),
    ).toEqual({
      type: 'EXPENSE',
      category: 'استرجاع رسوم',
      amount: 130,
      related_entity_id: studentId,
      created_by_user_id: ctx.user.id,
    });
    expect(ctx.accountBalance()).toBe(0);
  });

  test('a refunded payment cannot be refunded again or voided', async () => {
    ctx.expectErrorLogs();
    const studentId = await octoberStudent();
    const payment = await ctx.pay(studentId, 30);
    await ctx.invoke('student-fees:refundPayment', { paymentId: payment.id });

    await expect(
      ctx.invoke('student-fees:refundPayment', { paymentId: payment.id }),
    ).rejects.toThrow('الدفعة مسترجعة بالفعل');
    await expect(
      ctx.invoke('student-fees:deletePayment', { paymentId: payment.id }),
    ).rejects.toThrow('لا يمكن حذف دفعة مسترجعة');
    expect(
      ctx.get("SELECT COUNT(*) AS n FROM transactions WHERE category = 'استرجاع رسوم'").n,
    ).toBe(1);
  });

  test('refunding an overpayment takes back the credit it created', async () => {
    const studentId = await octoberStudent();
    const payment = await ctx.pay(studentId, 150);

    await ctx.invoke('student-fees:refundPayment', { paymentId: payment.id });

    expect(ctx.credit(studentId)).toBe(0);
    const summary = await ctx.invoke('student-fees:getBalanceSummary', studentId, '2026-2027');
    expect(summary).toMatchObject({ balance: 130, displayType: 'owed' });
  });
});
