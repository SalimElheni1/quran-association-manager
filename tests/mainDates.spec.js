const { toLocalISODate, toLocalISODateTime } = require('../src/main/utils/dates');

describe('main toLocalISODate', () => {
  it('formats the local calendar day with zero padding', () => {
    expect(toLocalISODate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('keeps local midnight on the same day', () => {
    expect(toLocalISODate(new Date(2026, 8, 24, 0, 30))).toBe('2026-09-24');
  });

  it('defaults to today', () => {
    const now = new Date();
    expect(toLocalISODate()).toBe(toLocalISODate(now));
  });
});

describe('main toLocalISODateTime', () => {
  it('formats local date and time the way SQLite date() reads it', () => {
    expect(toLocalISODateTime(new Date(2026, 9, 31, 0, 30, 5))).toBe('2026-10-31 00:30:05');
  });
});
