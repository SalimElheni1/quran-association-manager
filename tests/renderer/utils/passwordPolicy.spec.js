import {
  checkPasswordRules,
  PASSWORD_MESSAGES,
  PASSWORD_MIN_LENGTH,
} from '@renderer/utils/passwordPolicy';

// The main process is authoritative; the renderer copy must agree with it on every rule it
// duplicates (all but the common-password list).
const main = require('../../../src/main/passwordPolicy');

const CASES = [
  ['too short', 'Ab1#short', {}],
  ['no uppercase', 'zitouna#fes2026', {}],
  ['no lowercase', 'ZITOUNA#FES2026', {}],
  ['no digit', 'Zitouna#Fes-Sfax', {}],
  ['no symbol', 'ZitounaFes2026x', {}],
  ['Arabic letters and digits with a symbol', 'Zitouna#جامع2026', {}],
  ['contains the username', 'Mourad#Branch2026', { username: 'mourad' }],
  ['valid', 'Zitouna#Fes2026', { username: 'mourad' }],
  ['empty', '', {}],
  ['not a string', undefined, {}],
];

describe('renderer password rules (SEC-010)', () => {
  it('uses the same minimum length and messages as the main process', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(main.PASSWORD_MIN_LENGTH);
    expect(PASSWORD_MESSAGES.tooShort).toBe(main.RULE_MESSAGES.tooShort);
    expect(PASSWORD_MESSAGES.missingClasses).toBe(main.RULE_MESSAGES.missingClasses);
    expect(PASSWORD_MESSAGES.containsUsername).toBe(main.RULE_MESSAGES.containsUsername);
  });

  it.each(CASES)('gives the main process verdict for %s', (_label, password, options) => {
    expect(checkPasswordRules(password, options)).toBe(main.checkPassword(password, options));
  });

  it('leaves the common-password list to the main process', () => {
    expect(checkPasswordRules('Password123!')).toBeNull();
    expect(main.checkPassword('Password123!')).toBe(main.RULE_MESSAGES.common);
  });
});
