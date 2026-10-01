import {
  checkPasswordRules,
  PASSWORD_MESSAGES,
  PASSWORD_MIN_LENGTH,
} from '@renderer/utils/passwordPolicy';

// The main process is authoritative; the renderer copy must agree with it on every rule it
// duplicates (all but the common-password list).
const main = require('../../../src/main/passwordPolicy');

const CASES = [
  ['too short', 'Ab1#5', {}],
  ['letters only', 'Zitouna', {}],
  ['numbers only', '839271', {}],
  ['complex password', 'Zitouna#Fes2026', {}],
  ['contains the username', 'Mourad1', { username: 'mourad' }],
  ['empty', '', {}],
  ['not a string', undefined, {}],
];

describe('renderer password rules (SEC-010)', () => {
  it('uses the same minimum length and messages as the main process', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(main.PASSWORD_MIN_LENGTH);
    expect(PASSWORD_MESSAGES.tooShort).toBe(main.RULE_MESSAGES.tooShort);
  });

  it.each(CASES)('gives the main process verdict for %s', (_label, password, options) => {
    expect(checkPasswordRules(password, options)).toBe(main.checkPassword(password, options));
  });

  it('leaves the common-password list to the main process', () => {
    expect(checkPasswordRules('Password123!')).toBeNull();
    expect(main.checkPassword('Password123!')).toBe(main.RULE_MESSAGES.common);
  });
});
