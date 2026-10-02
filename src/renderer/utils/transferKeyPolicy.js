// The renderer's copy of the transfer key rules in src/main/transferKeyPolicy.js, used to show
// the rules under the key fields and to fail fast before calling the main process. The main
// process stays authoritative; tests/renderer/utils/transferKeyPolicy.spec.js checks both copies
// give the same verdict.

export const TRANSFER_KEY_MIN_LENGTH = 8;

export const TRANSFER_KEY_HINT = `${TRANSFER_KEY_MIN_LENGTH} أحرف على الأقل، ومختلف عن كلمة المرور. احفظه في مكان آمن: كل أجهزة الجمعية تستعمل نفس الرمز.`;

export const TRANSFER_KEY_MESSAGES = {
  required: 'رمز حماية النسخ الاحتياطية مطلوب.',
  tooShort: `يجب أن يتكون رمز حماية النسخ الاحتياطية من ${TRANSFER_KEY_MIN_LENGTH} أحرف على الأقل.`,
  sameAsPassword: 'يجب أن يختلف رمز حماية النسخ الاحتياطية عن كلمة مرور مدير النظام.',
  mismatch: 'رمزا حماية النسخ الاحتياطية غير متطابقين.',
};

/**
 * Checks a new transfer key.
 * @param {string} key
 * @param {{ confirmKey?: string, password?: string }} [context]
 * @returns {string|null} The Arabic message of the first failed rule, or null.
 */
export function checkTransferKey(key, { confirmKey, password } = {}) {
  if (typeof key !== 'string' || key.trim() === '') return TRANSFER_KEY_MESSAGES.required;
  if (key.length < TRANSFER_KEY_MIN_LENGTH) return TRANSFER_KEY_MESSAGES.tooShort;
  if (password && key === password) return TRANSFER_KEY_MESSAGES.sameAsPassword;
  if (confirmKey !== undefined && confirmKey !== key) return TRANSFER_KEY_MESSAGES.mismatch;
  return null;
}
