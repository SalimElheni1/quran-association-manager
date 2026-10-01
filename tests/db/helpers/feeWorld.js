// tests/db/helpers/feeWorld.js
// Shared setup for the student-fee specs: a fresh database per test, a fixed clock, the
// handlers fees depend on, and readers for the charges the database holds.

const { useRealDb } = require('./realDb');
const { addStudent, addAgeGroup, addClass } = require('./fixtures');
const { registerStudentHandlers } = require('../../../src/main/handlers/studentHandlers');
const { registerClassHandlers } = require('../../../src/main/handlers/classHandlers');
const { registerSettingsHandlers } = require('../../../src/main/handlers/settingsHandlers');
const { registerStudentFeeHandlers } = require('../../../src/main/handlers/studentFeeHandlers');
const { registerFinancialHandlers } = require('../../../src/main/handlers/financialHandlers');

function useFeeWorld() {
  const ctx = useRealDb({
    register: [
      registerStudentHandlers,
      registerClassHandlers,
      // settings:update is not used (it starts the 24h schedulers); fee settings are written
      // with ctx.setSettings. The no-op is the settings-cache refresh it would call.
      () => registerSettingsHandlers(async () => {}),
      registerStudentFeeHandlers,
      registerFinancialHandlers,
    ],
  });

  beforeEach(async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    await ctx.resetDatabase();
    // recordStudentPayment and the charge code trace every step with console.log.
    ctx.quietLogs();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  /** Sets the clock to the given local date (month is 1-12), at 10:00. */
  ctx.today = (year, month, day) => jest.setSystemTime(new Date(year, month - 1, day, 10, 0, 0));

  /** Branch fee settings, as the fee settings screen stores them. */
  ctx.branchFees = (annual, monthly, extra = {}) =>
    ctx.setSettings({ annual_fee: annual, standard_monthly_fee: monthly, ...extra });

  /** An age group (MONTHLY unless told otherwise) with one active standard class in it. */
  ctx.groupWithClass = async (groupOverrides = {}) => {
    const ageGroupId = await addAgeGroup(ctx, groupOverrides);
    const classId = await addClass(ctx, { age_group_id: ageGroupId });
    return { ageGroupId, classId };
  };

  ctx.addStudent = (overrides) => addStudent(ctx, overrides);

  /** The student's charges, oldest first, without credit rows. */
  ctx.charges = (studentId) =>
    ctx.all(
      `SELECT fee_type, academic_year, billing_month, amount, amount_paid, status, payment_frequency
       FROM student_fee_charges WHERE student_id = ? AND fee_type != 'CREDIT' ORDER BY id`,
      [studentId],
    );

  /** The billing months of the student's monthly charges. */
  ctx.billedMonths = (studentId) =>
    ctx
      .all(
        "SELECT billing_month FROM student_fee_charges WHERE student_id = ? AND fee_type = 'MONTHLY' ORDER BY billing_month",
        [studentId],
      )
      .map((row) => row.billing_month);

  /** The student's remaining credit (sum of CREDIT rows). */
  ctx.credit = (studentId) =>
    ctx.get(
      "SELECT COALESCE(SUM(amount_paid), 0) AS credit FROM student_fee_charges WHERE student_id = ? AND fee_type = 'CREDIT'",
      [studentId],
    ).credit;

  ctx.pay = (studentId, amount, extra = {}) =>
    ctx.invoke('student-fees:recordPayment', {
      student_id: studentId,
      amount,
      payment_method: 'CASH',
      ...extra,
    });

  ctx.accountBalance = () =>
    ctx.get('SELECT current_balance FROM accounts WHERE id = 1').current_balance;

  return ctx;
}

module.exports = { useFeeWorld };
