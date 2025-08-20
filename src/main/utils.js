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

module.exports = {
  processArabicText,
};
