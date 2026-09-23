import { toLocalISODate } from '@renderer/utils/dates';

describe('toLocalISODate', () => {
  it('formats the local calendar day with zero padding', () => {
    expect(toLocalISODate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('keeps local midnight on the first of the month', () => {
    expect(toLocalISODate(new Date(2026, 8, 1))).toBe('2026-09-01');
  });

  it('returns the last day of the month for day 0 of the next month', () => {
    expect(toLocalISODate(new Date(2026, 9, 0))).toBe('2026-09-30');
  });
});
