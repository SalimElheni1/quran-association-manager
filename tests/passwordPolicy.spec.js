// SEC-010: the password policy enforced wherever a password is set.
const { checkPassword, RULE_MESSAGES, PASSWORD_MIN_LENGTH } = require('../src/main/passwordPolicy');
const COMMON_PASSWORDS = require('../src/main/commonPasswords');

describe('passwordPolicy.checkPassword', () => {
  it('accepts a long password mixing all four character classes', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(12);
    expect(checkPassword('Zitouna#Fes2026')).toBeNull();
    expect(checkPassword('Zitouna#Fes2026', { username: 'mourad' })).toBeNull();
  });

  it.each([
    ['11 characters', 'Ab1#5678901', RULE_MESSAGES.tooShort],
    ['an empty password', '', RULE_MESSAGES.tooShort],
    ['a missing password', undefined, RULE_MESSAGES.tooShort],
    ['no uppercase letter', 'zitouna#fes2026', RULE_MESSAGES.missingClasses],
    ['no lowercase letter', 'ZITOUNA#FES2026', RULE_MESSAGES.missingClasses],
    ['no digit', 'Zitouna#Fes-Sfax', RULE_MESSAGES.missingClasses],
    ['no symbol', 'ZitounaFes2026x', RULE_MESSAGES.missingClasses],
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

  it('rejects a password containing the username, in any case', () => {
    expect(checkPassword('Mourad#Branch2026', { username: 'mourad' })).toBe(
      RULE_MESSAGES.containsUsername,
    );
    expect(checkPassword('xMOURADx#2026a', { username: 'Mourad' })).toBe(
      RULE_MESSAGES.containsUsername,
    );
  });

  it('gives exact Arabic messages', () => {
    expect(RULE_MESSAGES).toEqual({
      tooShort: 'يجب أن تتكون كلمة المرور من 12 حرفاً على الأقل.',
      common: 'كلمة المرور شائعة جداً، اختر كلمة مرور أخرى.',
      missingClasses: 'يجب أن تحتوي كلمة المرور على حرف كبير وحرف صغير ورقم ورمز.',
      containsUsername: 'يجب ألا تحتوي كلمة المرور على اسم المستخدم.',
    });
  });
});
