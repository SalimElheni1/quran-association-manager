import { getPresetPeriod } from '../../../src/renderer/components/financial/PeriodSelector';

describe('getPresetPeriod', () => {
  it('covers September to August by default for the academic year', () => {
    expect(getPresetPeriod('academicYear', new Date(2026, 9, 5))).toEqual({
      startDate: '2026-09-01',
      endDate: '2027-08-31',
    });
    expect(getPresetPeriod('academicYear', new Date(2026, 7, 31))).toEqual({
      startDate: '2025-09-01',
      endDate: '2026-08-31',
    });
  });

  it('follows the configured start month', () => {
    expect(getPresetPeriod('academicYear', new Date(2026, 8, 20), 10)).toEqual({
      startDate: '2025-10-01',
      endDate: '2026-09-30',
    });
    expect(getPresetPeriod('academicYear', new Date(2026, 9, 1), 10)).toEqual({
      startDate: '2026-10-01',
      endDate: '2027-09-30',
    });
    expect(getPresetPeriod('academicYear', new Date(2026, 4, 1), 1)).toEqual({
      startDate: '2026-01-01',
      endDate: '2026-12-31',
    });
  });
});
