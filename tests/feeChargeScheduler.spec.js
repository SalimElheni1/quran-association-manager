jest.mock('../src/db/db');
jest.mock('../src/main/logger');

const { runManualCheck } = require('../src/main/feeChargeScheduler');

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
