import { calculateAge } from '@renderer/utils/age';

describe('calculateAge', () => {
  // A fixed "today" keeps the results independent of when the suite runs.
  const today = new Date(2026, 5, 15);

  it('counts completed years', () => {
    expect(calculateAge('2016-03-20', today)).toBe(10);
  });

  it('does not count the current year before the birthday', () => {
    expect(calculateAge('2016-08-20', today)).toBe(9);
  });

  it('counts the year on the birthday itself, not the day before', () => {
    expect(calculateAge(new Date(2016, 5, 15), today)).toBe(10);
    expect(calculateAge(new Date(2016, 5, 16), today)).toBe(9);
  });

  it('accepts timestamps', () => {
    expect(calculateAge(new Date(2016, 2, 20).getTime(), today)).toBe(10);
  });

  it('reads the day-first formats of older imports', () => {
    ['2016/03/20', '20/03/2016', '20-03-2016'].forEach((dob) => {
      expect(calculateAge(dob, today)).toBe(10);
    });
  });

  it('returns null without a valid date of birth', () => {
    [null, undefined, '', '   ', 'invalid-date', '2099-13-45', new Date('x')].forEach((dob) => {
      expect(calculateAge(dob, today)).toBeNull();
    });
  });

  it('uses the current date by default', () => {
    const tenYearsAgo = new Date();
    tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
    expect(calculateAge(tenYearsAgo)).toBe(10);
  });
});
