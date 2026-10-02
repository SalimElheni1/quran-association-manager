// src/main/transferKeyPolicy.js
// The rules for the association transfer key (رمز حماية النسخ الاحتياطية): the secret that
// encrypts backup files so any device of the association that knows it can restore them.
// Enforced by the main process wherever the key is SET (first-run setup, the settings card,
// the prompt shown to a Superadmin whose install has no key yet).
//
// The renderer duplicates these rules (src/renderer/utils/transferKeyPolicy.js) only to fail
// fast under its forms; tests/renderer/utils/transferKeyPolicy.spec.js asserts both copies give
// the same verdict.

// Backups can be attacked offline, so the key is held to a longer minimum than passwords.
const TRANSFER_KEY_MIN_LENGTH = 8;

const TRANSFER_KEY_MESSAGES = {
  required: 'رمز حماية النسخ الاحتياطية مطلوب.',
  tooShort: `يجب أن يتكون رمز حماية النسخ الاحتياطية من ${TRANSFER_KEY_MIN_LENGTH} أحرف على الأقل.`,
  sameAsPassword: 'يجب أن يختلف رمز حماية النسخ الاحتياطية عن كلمة مرور مدير النظام.',
  mismatch: 'رمزا حماية النسخ الاحتياطية غير متطابقين.',
};

/**
 * Checks a new transfer key.
 * @param {string} key The new key, kept exactly as typed.
 * @param {{ confirmKey?: string, password?: string }} [context] The confirmation field, when
 *   the form has one, and the account password, which the key must differ from.
 * @returns {string|null} The Arabic message of the first failed rule, or null.
 */
function checkTransferKey(key, { confirmKey, password } = {}) {
  if (typeof key !== 'string' || key.trim() === '') return TRANSFER_KEY_MESSAGES.required;
  if (key.length < TRANSFER_KEY_MIN_LENGTH) return TRANSFER_KEY_MESSAGES.tooShort;
  if (password && key === password) return TRANSFER_KEY_MESSAGES.sameAsPassword;
  if (confirmKey !== undefined && confirmKey !== key) return TRANSFER_KEY_MESSAGES.mismatch;
  return null;
}

module.exports = { TRANSFER_KEY_MIN_LENGTH, TRANSFER_KEY_MESSAGES, checkTransferKey };
