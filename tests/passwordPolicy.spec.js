// SEC-010: the password policy enforced wherever a password is set.
const { checkPassword, RULE_MESSAGES, PASSWORD_MIN_LENGTH } = require('../src/main/passwordPolicy');
const COMMON_PASSWORDS = require('../src/main/commonPasswords');

describe('passwordPolicy.checkPassword', () => {
  it('accepts simple passwords and longer complex passwords', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(6);
    expect(checkPassword('Zitouna')).toBeNull();
    expect(checkPassword('839271')).toBeNull();
    expect(checkPassword('Zitouna#Fes2026')).toBeNull();
    expect(checkPassword('Mourad1')).toBeNull();
  });

  it.each([
    ['5 characters', 'Ab1#5', RULE_MESSAGES.tooShort],
    ['an empty password', '', RULE_MESSAGES.tooShort],
    ['a missing password', undefined, RULE_MESSAGES.tooShort],
  ])('rejects %s', (_label, password, message) => {
    expect(checkPassword(password)).toBe(message);
  });

  it('rejects common passwords whatever their capitalisation', () => {
    ['Password123!', 'PASSWORD123!', 'Bismillah@123', 'Tunisie@2026', 'Qwerty@123456'].forEach(
      (password) => expect(checkPassword(password)).toBe(RULE_MESSAGES.common),
    );
  });

  it('keeps every listed common password in lower case so the comparison works', () => {
    COMMON_PASSWORDS.forEach((password) => expect(password).toBe(password.toLowerCase()));
  });

  it('gives exact Arabic messages', () => {
    expect(RULE_MESSAGES).toEqual({
      tooShort: 'يجب أن تتكون كلمة المرور من 6 أحرف على الأقل.',
      common: 'كلمة المرور شائعة جداً، اختر كلمة مرور أخرى.',
    });
  });
});

describe('passwordPolicy: where the policy applies', () => {
  const { isPolicyEnforced } = require('../src/main/passwordPolicy');

  it.each([
    ['the installed app', { isPackaged: true, env: {} }, true],
    [
      'the installed app, whatever the environment says',
      { isPackaged: true, env: { NODE_ENV: 'development' } },
      true,
    ],
    ['a development run', { isPackaged: false, env: {} }, false],
    ['the e2e tests', { isPackaged: false, env: { QBM_E2E: '1' } }, true],
    ['the unit tests', { isPackaged: false, env: { NODE_ENV: 'test' } }, true],
  ])('%s', (_label, runtime, enforced) => {
    expect(isPolicyEnforced(runtime)).toBe(enforced);
  });

  describe('in a development run', () => {
    const realNodeEnv = process.env.NODE_ENV;
    let devPolicy;

    beforeAll(() => {
      process.env.NODE_ENV = 'development';
      jest.isolateModules(() => {
        jest.doMock('electron', () => ({ app: { isPackaged: false } }));
        devPolicy = require('../src/main/passwordPolicy');
      });
    });

    afterAll(() => {
      process.env.NODE_ENV = realNodeEnv;
      jest.dontMock('electron');
    });

    it('accepts short and common passwords', () => {
      expect(devPolicy.checkPassword('1')).toBeNull();
      expect(devPolicy.checkPassword('password')).toBeNull();
    });

    it('still refuses an empty or missing password', () => {
      expect(devPolicy.checkPassword('')).toBe(RULE_MESSAGES.tooShort);
      expect(devPolicy.checkPassword(undefined)).toBe(RULE_MESSAGES.tooShort);
    });
  });
});
