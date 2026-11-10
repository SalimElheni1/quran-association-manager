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

describe('renderer password rules in a development run', () => {
  it('reads the argument the main process passes to the window', () => {
    // preload.js cannot require the main module, so it repeats the text.
    const preload = require('fs').readFileSync(
      require('path').join(__dirname, '../../../src/main/preload.js'),
      'utf8',
    );
    expect(preload).toContain(`process.argv.includes('${main.RELAXED_PASSWORDS_ARGUMENT}')`);
  });

  afterEach(() => {
    delete window.electronAPI.relaxedPasswords;
  });

  it('accepts any non-empty password when the main process says passwords are relaxed', () => {
    window.electronAPI.relaxedPasswords = true;
    expect(checkPasswordRules('1')).toBeNull();
    expect(checkPasswordRules('')).toBe(PASSWORD_MESSAGES.tooShort);
  });

  it('keeps the rules without that flag', () => {
    expect(checkPasswordRules('1')).toBe(PASSWORD_MESSAGES.tooShort);
  });
});
