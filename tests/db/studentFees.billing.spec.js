// Student fee billing rules decided by the product owner: payment system per age group,
// a month billed only once it starts (except from the charge generation day), fees per age
// group with a chosen fee group, discount on monthly fees only, exempt/sponsored students.

const { useFeeWorld } = require('./helpers/feeWorld');

const ctx = useFeeWorld();

describe('payment system per age group', () => {
  test('a student of a monthly age group is billed the annual fee and the current month', async () => {
    ctx.today(2026, 10, 10);
    ctx.branchFees(100, 30);
    const { classId } = await ctx.groupWithClass({ payment_frequency: 'MONTHLY' });

    const studentId = await ctx.addStudent({ classIds: [classId] });

    expect(ctx.charges(studentId)).toEqual([
      expect.objectContaining({ fee_type: 'ANNUAL', academic_year: '2026-2027', amount: 100 }),
      expect.objectContaining({
        fee_type: 'MONTHLY',
        academic_year: '2026-2027',
        billing_month: '2026-2027-10',
        amount: 30,
        status: 'UNPAID',
        payment_frequency: 'MONTHLY',
      }),
    ]);
  });

  test('a student of an annual age group gets the annual charge and never a monthly one', async () => {
    ctx.today(2026, 10, 10);
    ctx.branchFees(100, 30);
    const { classId } = await ctx.groupWithClass({ payment_frequency: 'ANNUAL' });
    const studentId = await ctx.addStudent({ classIds: [classId] });

    ctx.today(2026, 10, 26);
    await ctx.invoke('fee-charges:runManualCheck');
    await ctx.invoke('student-fees:generateMonthlyCharges', {
      academicYear: '2026-2027',
      month: 10,
    });
    ctx.today(2026, 11, 3);
    await ctx.invoke('student-fees:refreshStudentCharges', { studentId });

    expect(ctx.charges(studentId)).toEqual([
      expect.objectContaining({ fee_type: 'ANNUAL', academic_year: '2026-2027', amount: 100 }),
    ]);
  });

  test('classes follow their age group: once the group pays annually, no more months are billed', async () => {
    ctx.today(2026, 10, 10);
    ctx.branchFees(100, 30);
    const { ageGroupId, classId } = await ctx.groupWithClass({ name: 'الكهول' });
    const studentId = await ctx.addStudent({ classIds: [classId] });
    expect(ctx.billedMonths(studentId)).toEqual(['2026-2027-10']);

    const updated = await ctx.invoke('ageGroups:update', ageGroupId, {
      name: 'الكهول',
      min_age: 18,
      max_age: null,
      gender: 'any',
      payment_frequency: 'ANNUAL',
    });
    expect(updated.success).toBe(true);
    ctx.today(2026, 11, 3);
    await ctx.invoke('student-fees:refreshStudentCharges', { studentId });
    await ctx.invoke('fee-charges:runManualCheck');

    expect(ctx.billedMonths(studentId)).toEqual(['2026-2027-10']);
  });
});

describe('a month is billed only once it starts', () => {
  test('adding a student late in the month bills that month only, not the next', async () => {
    ctx.today(2026, 10, 24);
    ctx.branchFees(0, 30);
    const { classId } = await ctx.groupWithClass();

    const studentId = await ctx.addStudent({ classIds: [classId] });

    expect(ctx.billedMonths(studentId)).toEqual(['2026-2027-10']);
  });

  test('the day before the generation day next month is not billed; from that day it is', async () => {
    ctx.today(2026, 10, 1);
    ctx.branchFees(0, 30);
    const { classId } = await ctx.groupWithClass();
    const studentId = await ctx.addStudent({ classIds: [classId] });

    ctx.today(2026, 10, 24);
    await ctx.invoke('fee-charges:runManualCheck');
    expect(ctx.billedMonths(studentId)).toEqual(['2026-2027-10']);

    ctx.today(2026, 10, 25);
    await ctx.invoke('fee-charges:runManualCheck');
    expect(ctx.billedMonths(studentId)).toEqual(['2026-2027-10', '2026-2027-11']);

    // Running it again on a later day bills nothing twice.
    ctx.today(2026, 10, 28);
    await ctx.invoke('fee-charges:runManualCheck');
    expect(ctx.billedMonths(studentId)).toEqual(['2026-2027-10', '2026-2027-11']);
  });

  test('a branch generation day of 20 bills next month from the 20th', async () => {
    ctx.today(2026, 10, 1);
    ctx.branchFees(0, 30, { charge_generation_day: 20 });
    const { classId } = await ctx.groupWithClass();
    const studentId = await ctx.addStudent({ classIds: [classId] });

    ctx.today(2026, 10, 19);
    await ctx.invoke('fee-charges:runManualCheck');
    expect(ctx.billedMonths(studentId)).toEqual(['2026-2027-10']);

    ctx.today(2026, 10, 20);
    await ctx.invoke('fee-charges:runManualCheck');
    expect(ctx.billedMonths(studentId)).toEqual(['2026-2027-10', '2026-2027-11']);
  });

  test('September billed from the August generation day belongs to the new academic year', async () => {
    ctx.today(2026, 8, 3);
    ctx.branchFees(0, 30);
    const { classId } = await ctx.groupWithClass();
    const studentId = await ctx.addStudent({ classIds: [classId] });
    expect(ctx.billedMonths(studentId)).toEqual(['2025-2026-08']);

    ctx.today(2026, 8, 25);
    await ctx.invoke('fee-charges:runManualCheck');

    expect(ctx.charges(studentId).map((c) => [c.academic_year, c.billing_month])).toEqual([
      ['2025-2026', '2025-2026-08'],
      ['2026-2027', '2026-2027-09'],
    ]);
  });

  test('once a new month has started, refreshing the student bills it', async () => {
    ctx.today(2026, 10, 10);
    ctx.branchFees(0, 30);
    const { classId } = await ctx.groupWithClass();
    const studentId = await ctx.addStudent({ classIds: [classId] });

    ctx.today(2026, 11, 2);
    await ctx.invoke('student-fees:refreshStudentCharges', { studentId });

    expect(ctx.billedMonths(studentId)).toEqual(['2026-2027-10', '2026-2027-11']);
  });
});

describe('fees per age group', () => {
  test('a group without its own fees bills the branch amounts; a group with fees bills its own', async () => {
    ctx.today(2026, 10, 10);
    ctx.branchFees(100, 30);
    const branchPriced = await ctx.groupWithClass({ annual_fee: null, monthly_fee: null });
    const ownPriced = await ctx.groupWithClass({ annual_fee: 150, monthly_fee: 45 });

    const a = await ctx.addStudent({ classIds: [branchPriced.classId] });
    const b = await ctx.addStudent({ classIds: [ownPriced.classId] });

    expect(ctx.charges(a).map((c) => [c.fee_type, c.amount])).toEqual([
      ['ANNUAL', 100],
      ['MONTHLY', 30],
    ]);
    expect(ctx.charges(b).map((c) => [c.fee_type, c.amount])).toEqual([
      ['ANNUAL', 150],
      ['MONTHLY', 45],
    ]);
  });

  test('a student in groups with different fees pays the higher one and is flagged until a fee group is chosen', async () => {
    ctx.today(2026, 10, 10);
    ctx.branchFees(100, 30);
    const cheap = await ctx.groupWithClass({ annual_fee: null, monthly_fee: null });
    const dear = await ctx.groupWithClass({ annual_fee: 150, monthly_fee: 45 });

    const studentId = await ctx.addStudent({ classIds: [cheap.classId, dear.classId] });

    expect(ctx.charges(studentId).map((c) => [c.fee_type, c.amount])).toEqual([
      ['ANNUAL', 150],
      ['MONTHLY', 45],
    ]);
    const feeGroup = await ctx.invoke('student-fees:getFeeGroup', studentId);
    expect(feeGroup).toMatchObject({ needsChoice: true, chosenGroupId: null });
    expect(feeGroup.group.id).toBe(dear.ageGroupId);
    const listed = await ctx.invoke('student-fees:getAll', '2026-2027');
    expect(listed.find((s) => s.id === studentId).needsFeeGroupChoice).toBe(true);
  });

  test('choosing the fee group re-bills the unpaid charges at that group’s fees and clears the flag', async () => {
    ctx.today(2026, 10, 10);
    ctx.branchFees(100, 30);
    const cheap = await ctx.groupWithClass({ annual_fee: null, monthly_fee: null });
    const dear = await ctx.groupWithClass({ annual_fee: 150, monthly_fee: 45 });
    const studentId = await ctx.addStudent({ classIds: [cheap.classId, dear.classId] });

    const result = await ctx.invoke('student-fees:setFeeGroup', {
      studentId,
      ageGroupId: cheap.ageGroupId,
    });

    expect(result).toMatchObject({ needsChoice: false, annualFee: 100, monthlyFee: 30 });
    expect(ctx.get('SELECT fee_age_group_id FROM students WHERE id = ?', [studentId])).toEqual({
      fee_age_group_id: cheap.ageGroupId,
    });
    expect(ctx.charges(studentId).map((c) => [c.fee_type, c.amount])).toEqual([
      ['ANNUAL', 100],
      ['MONTHLY', 30],
    ]);
    const listed = await ctx.invoke('student-fees:getAll', '2026-2027');
    expect(listed.find((s) => s.id === studentId).needsFeeGroupChoice).toBe(false);
  });

  test('choosing a fee group never changes charges that have been paid', async () => {
    ctx.today(2026, 10, 10);
    ctx.branchFees(100, 30);
    const cheap = await ctx.groupWithClass({ annual_fee: null, monthly_fee: null });
    const dear = await ctx.groupWithClass({ annual_fee: 150, monthly_fee: 45 });
    const studentId = await ctx.addStudent({ classIds: [cheap.classId, dear.classId] });
    await ctx.pay(studentId, 195);

    await ctx.invoke('student-fees:setFeeGroup', { studentId, ageGroupId: cheap.ageGroupId });

    expect(ctx.charges(studentId).map((c) => [c.fee_type, c.amount, c.status])).toEqual([
      ['ANNUAL', 150, 'PAID'],
      ['MONTHLY', 45, 'PAID'],
    ]);
  });

  test('a fee group can only be chosen among the age groups of the student’s classes', async () => {
    ctx.expectErrorLogs();
    ctx.today(2026, 10, 10);
    ctx.branchFees(100, 30);
    const own = await ctx.groupWithClass();
    const other = await ctx.groupWithClass({ monthly_fee: 10 });
    const studentId = await ctx.addStudent({ classIds: [own.classId] });

    await expect(
      ctx.invoke('student-fees:setFeeGroup', { studentId, ageGroupId: other.ageGroupId }),
    ).rejects.toThrow('الفئة العمرية المختارة ليست من فئات فصول هذا الطالب.');

    expect(ctx.get('SELECT fee_age_group_id FROM students WHERE id = ?', [studentId])).toEqual({
      fee_age_group_id: null,
    });
  });
});

describe('discount and fee categories', () => {
  test('a discount lowers the monthly fees only, the annual fee is billed in full', async () => {
    ctx.today(2026, 10, 10);
    ctx.branchFees(100, 30);
    const { classId } = await ctx.groupWithClass();

    const studentId = await ctx.addStudent({ classIds: [classId], discount_percentage: 10 });
    ctx.today(2026, 10, 25);
    await ctx.invoke('fee-charges:runManualCheck');

    expect(ctx.charges(studentId).map((c) => [c.fee_type, c.billing_month, c.amount])).toEqual([
      ['ANNUAL', null, 100],
      ['MONTHLY', '2026-2027-10', 27],
      ['MONTHLY', '2026-2027-11', 27],
    ]);
  });

  test('an exempt student is never charged, whatever generates charges', async () => {
    ctx.today(2026, 10, 10);
    ctx.branchFees(100, 30);
    const { classId } = await ctx.groupWithClass();
    const studentId = await ctx.addStudent({ classIds: [classId], fee_category: 'EXEMPT' });

    await ctx.invoke('student-fees:refreshStudentCharges', { studentId });
    await ctx.invoke('student-fees:generateAnnualCharges', '2026-2027');
    await ctx.invoke('student-fees:generateMonthlyCharges', {
      academicYear: '2026-2027',
      month: 10,
    });
    await ctx.invoke('student-fees:generateAllCharges', '2026-2027');
    ctx.today(2026, 10, 25);
    await ctx.invoke('fee-charges:runManualCheck');

    expect(ctx.charges(studentId)).toEqual([]);
    const listed = await ctx.invoke('student-fees:getAll', '2026-2027');
    expect(listed.find((s) => s.id === studentId)).toMatchObject({ totalDue: 0, balance: 0 });
  });

  test('a sponsored student is charged like a paying one', async () => {
    ctx.today(2026, 10, 10);
    ctx.branchFees(100, 30);
    const { classId } = await ctx.groupWithClass();

    const studentId = await ctx.addStudent({
      classIds: [classId],
      fee_category: 'SPONSORED',
      sponsor_name: 'كافل',
    });
    ctx.today(2026, 10, 25);
    await ctx.invoke('fee-charges:runManualCheck');

    expect(ctx.charges(studentId).map((c) => [c.fee_type, c.billing_month, c.amount])).toEqual([
      ['ANNUAL', null, 100],
      ['MONTHLY', '2026-2027-10', 30],
      ['MONTHLY', '2026-2027-11', 30],
    ]);
  });
});
