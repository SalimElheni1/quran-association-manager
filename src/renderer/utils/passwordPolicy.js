// SEC-010: the renderer's copy of the password rules in src/main/passwordPolicy.js, used to
// show the rules under the password fields and to fail fast before calling the main process.
// The main process stays authoritative and also rejects common passwords (its bundled list is
// not shipped to the renderer); tests/renderer/utils/passwordPolicy.spec.js checks both copies
// give the same verdict.

export const PASSWORD_MIN_LENGTH = 6;

export const PASSWORD_RULES_HINT =
  '6 أحرف على الأقل؛ يمكنك استخدام الحروف أو الأرقام فقط أو اختيار كلمة مرور أكثر تعقيداً. تجنب كلمات المرور الشائعة.';

export const PASSWORD_MESSAGES = {
  tooShort: 'يجب أن تتكون كلمة المرور من 6 أحرف على الأقل.',
};

/**
 * Checks a new password against the minimum-length rule.
 * @param {string} password
 * @returns {string|null} The Arabic message of the first failed rule, or null.
 */
export function checkPasswordRules(password) {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
    return PASSWORD_MESSAGES.tooShort;
  }
  return null;
}
