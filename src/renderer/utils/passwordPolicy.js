// SEC-010: the renderer's copy of the password rules in src/main/passwordPolicy.js, used to
// show the rules under the password fields and to fail fast before calling the main process.
// The main process stays authoritative and also rejects common passwords (its bundled list is
// not shipped to the renderer); tests/renderer/utils/passwordPolicy.spec.js checks both copies
// give the same verdict.

export const PASSWORD_MIN_LENGTH = 12;

export const PASSWORD_RULES_HINT =
  '12 حرفاً على الأقل، مع حرف كبير وحرف صغير ورقم ورمز، ودون اسم المستخدم.';

export const PASSWORD_MESSAGES = {
  tooShort: 'يجب أن تتكون كلمة المرور من 12 حرفاً على الأقل.',
  missingClasses: 'يجب أن تحتوي كلمة المرور على حرف كبير وحرف صغير ورقم ورمز.',
  containsUsername: 'يجب ألا تحتوي كلمة المرور على اسم المستخدم.',
};

/**
 * Checks a new password against the length, character-class and username rules.
 * @param {string} password
 * @param {{ username?: string }} [options]
 * @returns {string|null} The Arabic message of the first failed rule, or null.
 */
export function checkPasswordRules(password, { username } = {}) {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
    return PASSWORD_MESSAGES.tooShort;
  }
  const hasUpper = /\p{Lu}/u.test(password);
  const hasLower = /\p{Ll}/u.test(password);
  const hasDigit = /\p{Nd}/u.test(password);
  const hasSymbol = /[^\p{L}\p{N}]/u.test(password);
  if (!hasUpper || !hasLower || !hasDigit || !hasSymbol) {
    return PASSWORD_MESSAGES.missingClasses;
  }
  if (username && password.toLowerCase().includes(String(username).toLowerCase())) {
    return PASSWORD_MESSAGES.containsUsername;
  }
  return null;
}
