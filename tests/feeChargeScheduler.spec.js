jest.mock('../src/db/db');
jest.mock('../src/main/logger');

const { runManualCheck, getNextBillingMonth } = require('../src/main/feeChargeScheduler');

describe('feeChargeScheduler - runManualCheck (BUG-15)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should block the manual check when auto-generation is disabled and force is false', async () => {
    const result = await runManualCheck({ auto_charge_generation_enabled: false }, false);

    expect(result.success).toBe(false);
    expect(result.message).toBe('التوليد التلقائي معطل في الإعدادات.');
  });

  it('should bypass the disabled gate when force is true', async () => {
    const result = await runManualCheck({ auto_charge_generation_enabled: false }, true);

    expect(result.success).toBe(true);
    expect(result.message).toBe('تم تحديث جميع رسوم الطلاب بنجاح.');
  });

  it('should run the daily check using settings (not force) when enabled', async () => {
    const result = await runManualCheck(
      {
        auto_charge_generation_enabled: true,
        academic_year_start_month: 9,
        charge_generation_day: 25,
      },
      false,
    );

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
