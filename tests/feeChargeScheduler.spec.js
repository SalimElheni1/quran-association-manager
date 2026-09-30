// '../src/db/db' resolves to tests/mocks/db.js through jest.config.js.
jest.mock('../src/main/logger');
jest.mock('../src/main/handlers/studentFeeHandlers', () => ({
  ...jest.requireActual('../src/main/handlers/studentFeeHandlers'),
  generateAnnualFeeCharges: jest.fn(),
  generateMonthlyFeeCharges: jest.fn(),
}));

const db = require('../src/db/db');
const {
  generateAnnualFeeCharges,
  generateMonthlyFeeCharges,
} = require('../src/main/handlers/studentFeeHandlers');
const {
  runManualCheck,
  getNextBillingMonth,
  checkAndGenerateCharges,
  onAppStartup,
  startScheduler,
  stopScheduler,
} = require('../src/main/feeChargeScheduler');

const settings = {
  auto_charge_generation_enabled: true,
  academic_year_start_month: 9,
  charge_generation_day: 25,
};

// Months that were billed, as [academicYear, month].
const billedMonths = () =>
  generateMonthlyFeeCharges.mock.calls.map(([year, month]) => [year, month]);

beforeEach(() => {
  jest.clearAllMocks();
  db.resetMocks();
  generateAnnualFeeCharges.mockResolvedValue({ success: true, createdCount: 1 });
  generateMonthlyFeeCharges.mockResolvedValue({ success: true, createdCount: 1 });
});

describe('feeChargeScheduler - runManualCheck (BUG-15)', () => {
  it('should block the manual check when auto-generation is disabled and force is false', async () => {
    const result = await runManualCheck({ auto_charge_generation_enabled: false }, false);

    expect(result.success).toBe(false);
    expect(result.message).toBe('التوليد التلقائي معطل في الإعدادات.');
    expect(generateMonthlyFeeCharges).not.toHaveBeenCalled();
  });

  it('should bypass the disabled gate when force is true', async () => {
    const result = await runManualCheck({ auto_charge_generation_enabled: false }, true);

    expect(result.success).toBe(true);
    expect(result.message).toBe('تم تحديث جميع رسوم الطلاب بنجاح.');
  });

  it('should run the daily check using settings (not force) when enabled', async () => {
    const result = await runManualCheck(settings, false);

    expect(result.success).toBe(true);
    expect(result.message).toBe('تم إكمال فحص توليد الرسوم اليدوي.');
  });
});

describe('feeChargeScheduler - getNextBillingMonth', () => {
  it('bills the first month of a new academic year under the new year', () => {
    // 26 August 2026, academic year starting in September: September belongs to 2026-2027.
    expect(getNextBillingMonth(9, new Date(2026, 7, 26))).toEqual({
      month: 9,
      academicYear: '2026-2027',
    });
  });

  it('keeps the current academic year inside the year', () => {
    expect(getNextBillingMonth(9, new Date(2026, 9, 25))).toEqual({
      month: 11,
      academicYear: '2026-2027',
    });
  });

  it('rolls over December into January', () => {
    expect(getNextBillingMonth(9, new Date(2026, 11, 28))).toEqual({
      month: 1,
      academicYear: '2026-2027',
    });
    expect(getNextBillingMonth(1, new Date(2026, 11, 28))).toEqual({
      month: 1,
      academicYear: '2027-2028',
    });
  });

  it('follows a configured start month', () => {
    expect(getNextBillingMonth(10, new Date(2026, 8, 25))).toEqual({
      month: 10,
      academicYear: '2026-2027',
    });
    expect(getNextBillingMonth(10, new Date(2026, 7, 25))).toEqual({
      month: 9,
      academicYear: '2025-2026',
    });
  });
});

describe('feeChargeScheduler - when months are billed', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    stopScheduler();
    jest.useRealTimers();
  });

  describe('daily check', () => {
    it('does not bill next month before the charge generation day', async () => {
      jest.setSystemTime(new Date(2026, 9, 24, 12));

      await checkAndGenerateCharges(settings);

      expect(generateMonthlyFeeCharges).not.toHaveBeenCalled();
    });

    it('bills next month from the charge generation day', async () => {
      jest.setSystemTime(new Date(2026, 9, 25, 8));

      await checkAndGenerateCharges(settings);

      expect(billedMonths()).toEqual([['2026-2027', 11]]);
    });

    it('follows the configured charge generation day', async () => {
      jest.setSystemTime(new Date(2026, 9, 20, 8));

      await checkAndGenerateCharges({ ...settings, charge_generation_day: 20 });

      expect(billedMonths()).toEqual([['2026-2027', 11]]);
    });

    it('defaults the charge generation day to the 25th', async () => {
      jest.setSystemTime(new Date(2026, 9, 24, 8));
      await checkAndGenerateCharges({ academic_year_start_month: 9 });
      expect(generateMonthlyFeeCharges).not.toHaveBeenCalled();

      jest.setSystemTime(new Date(2026, 9, 25, 8));
      await checkAndGenerateCharges({ academic_year_start_month: 9 });
      expect(billedMonths()).toEqual([['2026-2027', 11]]);
    });

    it('bills September of the new academic year from 25 August', async () => {
      jest.setSystemTime(new Date(2026, 7, 25, 8));

      await checkAndGenerateCharges(settings);

      expect(billedMonths()).toEqual([['2026-2027', 9]]);
    });
  });

  describe('at startup', () => {
    it('bills the annual fee and the month that has started, not next month', async () => {
      jest.setSystemTime(new Date(2026, 9, 10, 8));
      db.getQuery.mockResolvedValue({ count: 0 });

      await onAppStartup(settings);

      expect(generateAnnualFeeCharges).toHaveBeenCalledWith('2026-2027');
      expect(billedMonths()).toEqual([['2026-2027', 10]]);
    });

    it('does not bill the annual fee twice in an academic year', async () => {
      jest.setSystemTime(new Date(2026, 9, 10, 8));
      db.getQuery.mockResolvedValue({ count: 12 });

      await onAppStartup(settings);

      expect(db.getQuery).toHaveBeenCalledWith(
        'SELECT COUNT(*) as count FROM student_fee_charges WHERE fee_type = ? AND academic_year = ?',
        ['ANNUAL', '2026-2027'],
      );
      expect(generateAnnualFeeCharges).not.toHaveBeenCalled();
    });

    it('also bills next month when started on or after the charge generation day', async () => {
      jest.setSystemTime(new Date(2026, 9, 26, 8));
      db.getQuery.mockResolvedValue({ count: 12 });

      await onAppStartup(settings);

      expect(billedMonths()).toEqual([
        ['2026-2027', 10],
        ['2026-2027', 11],
      ]);
    });

    it('never stops the app from starting when billing fails', async () => {
      jest.setSystemTime(new Date(2026, 9, 26, 8));
      db.getQuery.mockRejectedValue(new Error('db locked'));
      generateMonthlyFeeCharges.mockRejectedValue(new Error('db locked'));

      await expect(onAppStartup(settings)).resolves.toBeUndefined();
    });
  });

  describe('scheduler', () => {
    const oneDay = 24 * 60 * 60 * 1000;

    it('does not start when automatic generation is off', () => {
      startScheduler({ ...settings, auto_charge_generation_enabled: false });

      expect(jest.getTimerCount()).toBe(0);
    });

    it('checks once every 24 hours while the app stays open', async () => {
      jest.setSystemTime(new Date(2026, 9, 24, 23));
      startScheduler(settings);
      expect(jest.getTimerCount()).toBe(1);

      await jest.advanceTimersByTimeAsync(oneDay); // 25 October

      expect(billedMonths()).toEqual([['2026-2027', 11]]);
    });

    it('keeps a single timer when restarted and none after stopping', () => {
      startScheduler(settings);
      startScheduler(settings);
      expect(jest.getTimerCount()).toBe(1);

      stopScheduler();
      expect(jest.getTimerCount()).toBe(0);
    });
  });
});
