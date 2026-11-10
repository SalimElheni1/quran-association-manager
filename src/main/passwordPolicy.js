// src/main/passwordPolicy.js
// SEC-010: the one password policy, enforced by the main process everywhere a
// password is SET (first-run setup, users:add, users:update, profile password
// change, forced change after login). Logging in never runs this — existing
// weaker passwords keep working.
//
// A development run can switch it off on purpose (QBM_RELAXED_PASSWORDS=1): see isPolicyEnforced.
//
// The renderer duplicates the minimum-length rule
// (src/renderer/utils/passwordPolicy.js) only to fail fast and show the rules
// under its forms; the main process is authoritative and is the only one that
// checks the common-password list. tests/renderer/utils/passwordPolicy.spec.js
// asserts both give the same verdict for the same inputs.

const COMMON_PASSWORDS = require('./commonPasswords');

const COMMON_PASSWORD_SET = new Set(COMMON_PASSWORDS);

const PASSWORD_MIN_LENGTH = 6;

// Set to '1' (in .env) to relax the policy in a development run. Ignored by the installed app.
const RELAXED_PASSWORDS_ENV = 'QBM_RELAXED_PASSWORDS';

// Passed to the window of a relaxed run; preload.js reads it (it cannot require this file, so
// tests/renderer/utils/passwordPolicy.spec.js checks it uses the same text).
const RELAXED_PASSWORDS_ARGUMENT = '--qbm-relaxed-passwords';

// The password of accounts created before 1.3.0. Logging in with it forces a change
// (authHandlers.js), so it is never accepted as a new password, relaxed or not.
const LEGACY_DEFAULT_PASSWORD = '123456';

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

/**
 * Whether the policy applies. It does unless a development run asks otherwise: with
 * QBM_RELAXED_PASSWORDS=1 (in .env), `npm run dev` accepts any non-empty password, so the app can
 * be tried with throwaway ones. The installed app always enforces it: nothing in the environment
 * can switch it off there. The automated tests (Jest, e2e) enforce it, because they test it.
 * @param {{ isPackaged?: boolean, env?: object }} [runtime] Defaults to the running app.
 * @returns {boolean}
 */
function isPolicyEnforced(runtime) {
  const env = (runtime && runtime.env) || process.env;
  if (env.NODE_ENV === 'test' || env.QBM_E2E === '1') return true;
  if (env[RELAXED_PASSWORDS_ENV] !== '1') return true;
  if (runtime && typeof runtime.isPackaged === 'boolean') return runtime.isPackaged;
  // Outside Electron (a plain Node script) there is no app: enforce.
  const { app } = require('electron');
  return !app || app.isPackaged !== false;
}

// The key of the first violated rule, or null when the password complies.
function violatedRule(password) {
  if (!isPolicyEnforced()) {
    if (typeof password !== 'string' || password.length === 0) return 'tooShort';
    return password === LEGACY_DEFAULT_PASSWORD ? 'common' : null;
  }
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
  RELAXED_PASSWORDS_ENV,
  RELAXED_PASSWORDS_ARGUMENT,
  LEGACY_DEFAULT_PASSWORD,
  isPolicyEnforced,
  checkPassword,
  passwordPolicyValidator,
};
