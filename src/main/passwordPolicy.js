// src/main/passwordPolicy.js
// SEC-010: the one password policy, enforced by the main process everywhere a
// password is SET (first-run setup, users:add, users:update, profile password
// change, forced change after login). Logging in never runs this — existing
// weaker passwords keep working.
//
// The renderer duplicates the length, character-class and username rules
// (src/renderer/utils/passwordPolicy.js) only to fail fast and show the rules
// under its forms; the main process is authoritative and is the only one that
// checks the common-password list. tests/renderer/utils/passwordPolicy.spec.js
// asserts both give the same verdict for the same inputs.

const COMMON_PASSWORDS = require('./commonPasswords');

const COMMON_PASSWORD_SET = new Set(COMMON_PASSWORDS);

const PASSWORD_MIN_LENGTH = 12;

// One clear Arabic message per rule, in check order.
const RULE_MESSAGES = {
  tooShort: 'يجب أن تتكون كلمة المرور من 12 حرفاً على الأقل.',
  common: 'كلمة المرور شائعة جداً، اختر كلمة مرور أخرى.',
  missingClasses: 'يجب أن تحتوي كلمة المرور على حرف كبير وحرف صغير ورقم ورمز.',
  containsUsername: 'يجب ألا تحتوي كلمة المرور على اسم المستخدم.',
};

// Joi error-code map, spread into the .messages({...}) of each password schema.
const JOI_RULE_MESSAGES = {
  'password.tooShort': RULE_MESSAGES.tooShort,
  'password.common': RULE_MESSAGES.common,
  'password.missingClasses': RULE_MESSAGES.missingClasses,
  'password.containsUsername': RULE_MESSAGES.containsUsername,
};

// The key of the first violated rule, or null when the password complies.
// Length and the public common-password list come first: both are knowable
// without touching character classes, and a listed password is weak no matter
// which classes it mixes in.
function violatedRule(password, { username } = {}) {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
    return 'tooShort';
  }
  if (COMMON_PASSWORD_SET.has(password.toLowerCase())) {
    return 'common';
  }
  const hasUpper = /\p{Lu}/u.test(password);
  const hasLower = /\p{Ll}/u.test(password);
  const hasDigit = /\p{Nd}/u.test(password);
  const hasSymbol = /[^\p{L}\p{N}]/u.test(password);
  if (!hasUpper || !hasLower || !hasDigit || !hasSymbol) {
    return 'missingClasses';
  }
  if (username && password.toLowerCase().includes(String(username).toLowerCase())) {
    return 'containsUsername';
  }
  return null;
}

/**
 * Checks a password against the policy.
 * @param {string} password - The candidate password.
 * @param {{ username?: string }} [options] - The account's username, for the containment rule.
 * @returns {string|null} The Arabic message of the first failed rule, or null when valid.
 */
function checkPassword(password, { username } = {}) {
  const rule = violatedRule(password, { username });
  return rule ? RULE_MESSAGES[rule] : null;
}

/**
 * Joi .custom() validator for password fields. The username is read from a
 * `username` sibling key when the payload has one (users:add, users:update,
 * auth:setup-superadmin); handlers without one call checkPassword themselves.
 * Empty values are left to the string rules (allow/empty/required) around it.
 */
function passwordPolicyValidator(value, helpers) {
  if (typeof value !== 'string' || value.length === 0) return value;
  const sibling = helpers.state.ancestors && helpers.state.ancestors[0];
  const username = sibling && sibling.username;
  const rule = violatedRule(value, { username });
  return rule ? helpers.error(`password.${rule}`) : value;
}

module.exports = {
  PASSWORD_MIN_LENGTH,
  RULE_MESSAGES,
  JOI_RULE_MESSAGES,
  checkPassword,
  passwordPolicyValidator,
};
