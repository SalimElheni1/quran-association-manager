const { toLocalISODate } = require('../src/main/utils/dates');

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
