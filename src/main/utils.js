const arabicReshaper = require('arabic-reshaper');
const rtl = require('rtl-arabic');

/**
 * Processes a string to be compatible with PDFKit's RTL rendering.
 * It reshapes Arabic characters and reverses the string for correct display.
 * @param {string | null | undefined} text The text to process.
 * @returns {string} The processed text.
 */
function processArabicText(text) {
  if (text === null || typeof text === 'undefined') return '';
  const reshapedText = arabicReshaper.convertArabic(String(text));
  return new rtl(reshapedText).convert();
}

/**
 * Rounds a currency value to 3 decimal places (Tunisian Dinars millimes)
 * with IEEE-754 epsilon guard against floating-point drift.
 * @param {number|string|null|undefined} val The amount to round.
 * @returns {number} The rounded numeric amount.
 */
function roundCurrency(val) {
  const num = typeof val === 'number' ? val : parseFloat(val);
  if (isNaN(num)) return 0;
  return Math.round((num + Number.EPSILON) * 1000) / 1000;
}

module.exports = {
  processArabicText,
  roundCurrency,
};

