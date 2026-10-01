// src/main/passwordPolicy.js
// SEC-010: the one password policy, enforced by the main process everywhere a
// password is SET (first-run setup, users:add, users:update, profile password
// change, forced change after login). Logging in never runs this — existing
// weaker passwords keep working.
//
// The renderer duplicates the minimum-length rule
// (src/renderer/utils/passwordPolicy.js) only to fail fast and show the rules
// under its forms; the main process is authoritative and is the only one that
// checks the common-password list. tests/renderer/utils/passwordPolicy.spec.js
// asserts both give the same verdict for the same inputs.

const COMMON_PASSWORDS = require('./commonPasswords');

const COMMON_PASSWORD_SET = new Set(COMMON_PASSWORDS);

const PASSWORD_MIN_LENGTH = 6;

// One clear Arabic message per rule, in check order.
const RULE_MESSAGES = {
  tooShort: 'يجب أن تتكون كلمة المرور من 6 أحرف على الأقل.',
  common: 'كلمة المرور شائعة جداً، اختر كلمة مرور أخرى.',
};

// Joi error-code map, spread into the .messages({...}) of each password schema.
const JOI_RULE_MESSAGES = {
  'password.tooShort': RULE_MESSAGES.tooShort,
  'password.common': RULE_MESSAGES.common,
};

// The key of the first violated rule, or null when the password complies.
function violatedRule(password) {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
    return 'tooShort';
  }
  if (COMMON_PASSWORD_SET.has(password.toLowerCase())) {
    return 'common';
  }
  return null;
}

/**
 * Checks a password against the policy.
 * @param {string} password - The candidate password.
 * @returns {string|null} The Arabic message of the first failed rule, or null when valid.
 */
function checkPassword(password) {
  const rule = violatedRule(password);
  return rule ? RULE_MESSAGES[rule] : null;
}

/**
 * Joi .custom() validator for password fields.
 * Empty values are left to the string rules (allow/empty/required) around it.
 */
function passwordPolicyValidator(value, helpers) {
  if (typeof value !== 'string' || value.length === 0) return value;
  const rule = violatedRule(value);
  return rule ? helpers.error(`password.${rule}`) : value;
}

module.exports = {
  PASSWORD_MIN_LENGTH,
  RULE_MESSAGES,
  JOI_RULE_MESSAGES,
  checkPassword,
  passwordPolicyValidator,
};
