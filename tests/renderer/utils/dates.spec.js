import { toLocalISODate, toDateInputValue } from '@renderer/utils/dates';

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

describe('toDateInputValue', () => {
  it('keeps a stored date-only value as is', () => {
    expect(toDateInputValue('2015-03-20')).toBe('2015-03-20');
  });

  it('drops the time from stored datetimes without shifting the day', () => {
    expect(toDateInputValue('2015-03-20 23:30:00')).toBe('2015-03-20');
    expect(toDateInputValue('2015-03-20T23:30:00.000Z')).toBe('2015-03-20');
  });

  it('formats Date objects in local time', () => {
    expect(toDateInputValue(new Date(2015, 2, 20))).toBe('2015-03-20');
  });

  it('returns an empty string for missing or invalid values', () => {
    expect(toDateInputValue(null)).toBe('');
    expect(toDateInputValue('')).toBe('');
    expect(toDateInputValue('not a date')).toBe('');
  });
});
