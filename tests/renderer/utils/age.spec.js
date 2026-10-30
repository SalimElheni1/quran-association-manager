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

// The window (age shown, age group suggested) and the main process (age group checks, fees) must
// read a date of birth the same way.
describe('calculateAge in both processes', () => {
  const main = require('../../../src/main/utils/age');
  const today = new Date(2026, 5, 15);

  it.each([
    ['an ISO date', '2016-03-20'],
    ['before the birthday', '2016-08-20'],
    ['the birthday itself', new Date(2016, 5, 15)],
    ['the day before the birthday', new Date(2016, 5, 16)],
    ['a timestamp', new Date(2016, 2, 20).getTime()],
    ['a slash date', '2016/03/20'],
    ['a day-first slash date', '20/03/2016'],
    ['a day-first dash date', '20-03-2016'],
    ['a leap day', '2016-02-29'],
    ['an empty value', ''],
    ['blanks', '   '],
    ['null', null],
    ['text', 'invalid-date'],
    ['an impossible date', '2099-13-45'],
    ['a year before 1900', '1850-01-01'],
  ])('%s', (_label, dob) => {
    expect(calculateAge(dob, today)).toBe(main.calculateAge(dob, today));
  });
});
