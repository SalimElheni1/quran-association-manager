// One fee charge per student and month (monthly) or academic year (annual), held by unique
// indexes. A database that still holds duplicate charges from before keeps starting, and gets
// the indexes once the duplicates are gone.
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const db = require('../../src/db/db');
const { useFeeWorld } = require('./helpers/feeWorld');

const ctx = useFeeWorld();

const MONTHLY_CHARGE = `INSERT INTO student_fee_charges
  (student_id, charge_date, fee_type, amount, amount_paid, status, academic_year, billing_month)
  VALUES (?, '2026-10-01', 'MONTHLY', 30, ?, ?, '2026-2027', ?)`;
const ANNUAL_CHARGE = `INSERT INTO student_fee_charges
  (student_id, charge_date, fee_type, amount, status, academic_year)
  VALUES (?, '2026-10-01', 'ANNUAL', 100, 'UNPAID', ?)`;

const uniqueIndexes = () =>
  ctx
    .all(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'uq_fee_charges_%' ORDER BY name",
    )
    .map((row) => row.name);

const failure = (write) => {
  try {
    write();
  } catch (error) {
    return String(error.message);
  }
  return 'no error';
};

// The test app counts as packaged: warnings only go to the log file.
const warningsLogged = () =>
  fs
    .readFileSync(path.join(app.getPath('userData'), 'app-logs.txt'), 'utf8')
    .split('\n')
    .filter((line) => line.includes('[WARN]'));

const restart = async () => {
  await db.closeDatabase();
  await db.initializeDatabase();
};

describe('the unique indexes', () => {
  test('a student cannot get a second charge for a month, or a second annual charge for a year', async () => {
    const studentId = await ctx.addStudent();
    ctx.run(MONTHLY_CHARGE, [studentId, 0, 'UNPAID', '2026-2027-10']);
    ctx.run(ANNUAL_CHARGE, [studentId, '2026-2027']);

    expect(
      failure(() => ctx.run(MONTHLY_CHARGE, [studentId, 0, 'UNPAID', '2026-2027-10'])),
    ).toMatch(/UNIQUE constraint failed/);
    expect(failure(() => ctx.run(ANNUAL_CHARGE, [studentId, '2026-2027']))).toMatch(
      /UNIQUE constraint failed/,
    );
    // Other months, other years and other students are not limited.
    ctx.run(MONTHLY_CHARGE, [studentId, 0, 'UNPAID', '2026-2027-11']);
    ctx.run(ANNUAL_CHARGE, [studentId, '2027-2028']);
    ctx.run(MONTHLY_CHARGE, [await ctx.addStudent(), 0, 'UNPAID', '2026-2027-10']);
  });

  test('a database with duplicate charges from before still starts; the index comes once they are gone', async () => {
    const studentId = await ctx.addStudent();
    ctx.run('DROP INDEX uq_fee_charges_monthly');
    ctx.run(MONTHLY_CHARGE, [studentId, 30, 'PAID', '2026-2027-10']);
    ctx.run(MONTHLY_CHARGE, [studentId, 0, 'UNPAID', '2026-2027-10']);

    await restart();

    expect(uniqueIndexes()).toEqual(['uq_fee_charges_annual']);
    expect(warningsLogged()).toContainEqual(
      expect.stringMatching(/uq_fee_charges_monthly not created.*UNIQUE constraint failed/),
    );

    ctx.run("DELETE FROM student_fee_charges WHERE status = 'UNPAID'");
    await restart();

    expect(uniqueIndexes()).toEqual(['uq_fee_charges_annual', 'uq_fee_charges_monthly']);
  });
});

describe('a charge that appears between the check and the insert', () => {
  let studentId;
  let errors;

  // What a charge written meanwhile by another call looks like to the generator: its check finds
  // nothing, and its insert meets the charge.
  const checksMissTheExistingCharge = () => {
    const getQuery = db.getQuery;
    jest
      .spyOn(db, 'getQuery')
      .mockImplementation((sql, params) =>
        /FROM student_fee_charges\s+WHERE student_id = \? AND fee_type = '(ANNUAL|MONTHLY)'/.test(
          sql,
        )
          ? Promise.resolve(undefined)
          : getQuery(sql, params),
      );
  };

  beforeEach(async () => {
    ctx.today(2026, 10, 10);
    ctx.branchFees(100, 30);
    const { classId } = await ctx.groupWithClass();
    studentId = await ctx.addStudent({ classIds: [classId] });
    expect(ctx.charges(studentId)).toHaveLength(2); // the annual charge and October
    checksMissTheExistingCharge();
    errors = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const chargesOfEachKind = () =>
    ctx.all(
      `SELECT fee_type, count(*) AS n FROM student_fee_charges WHERE student_id = ?
       GROUP BY fee_type ORDER BY fee_type`,
      [studentId],
    );

  test.each([
    ['student-fees:generateAnnualCharges', () => '2026-2027', (r) => r.details.createdCount],
    [
      'student-fees:generateMonthlyCharges',
      () => ({ academicYear: '2026-2027', month: 10 }),
      (r) => r.details.createdCount,
    ],
    [
      'student-fees:refreshAllStudentCharges',
      () => ({ academicYear: '2026-2027' }),
      (r) => r.chargesGenerated,
    ],
  ])('%s skips it, counts nothing created and does not fail', async (channel, args, created) => {
    const result = await ctx.invoke(channel, args());

    expect(created(result)).toBe(0);
    expect(chargesOfEachKind()).toEqual([
      { fee_type: 'ANNUAL', n: 1 },
      { fee_type: 'MONTHLY', n: 1 },
    ]);
    expect(errors).not.toHaveBeenCalled();
  });

  test('refreshing the student keeps the one annual charge and does not fail', async () => {
    const result = await ctx.invoke('student-fees:refreshStudentCharges', { studentId });

    expect(result.success).toBe(true);
    expect(chargesOfEachKind()).toEqual([
      { fee_type: 'ANNUAL', n: 1 },
      { fee_type: 'MONTHLY', n: 1 },
    ]);
    expect(errors).not.toHaveBeenCalled();
  });
});
