/**
 * Tunisian Dinar (TND) currency formatting utility.
 * 
 * Tunisian formal format:
 * - Thousands separator: space (narrow non-breaking space)
 * - Decimal separator: comma
 * - Example: 1 205 000,500 → 1 million 205 thousand, 500 millimes
 */

/**
 * Format a number as Tunisian Dinar (TND).
 * Uses space as thousands separator and comma as decimal separator.
 * @param {number} amount - The amount to format
 * @param {number} [decimals=3] - Number of decimal places (default 3 for millemes)
 * @returns {string} Formatted string, e.g. "1 015" or "1 015,500"
 */
export function formatTND(amount, decimals = 3) {
  if (amount === null || amount === undefined || isNaN(amount)) return '0';

  const num = Number(amount);
  
  // Split into integer and fractional parts
  const fixed = Math.abs(num).toFixed(decimals);
  const [intPart, fracPart] = fixed.split('.');
  
  // Add space thousands separator to integer part
  const withSeparator = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  
  // Check if fractional part is all zeros
  const isFractionZero = !fracPart || parseInt(fracPart, 10) === 0;
  
  // Combine with comma as decimal separator only if fraction is non-zero
  const result = isFractionZero ? withSeparator : `${withSeparator},${fracPart}`;
  
  // Use Left-to-Right Mark (LRM) \u200E to force correct directionality handling
  // The LRM ensures that negative signs or spaces keep numbers formatted properly in RTL layout
  const formattedString = num < 0 ? `-${result}` : result;
  return `\u200E${formattedString}`;
}

/**
 * Format a number as TND with currency suffix.
 * @param {number} amount
 * @param {number} [decimals=3]
 * @returns {string} e.g. "1 015,000 د.ت"
 */
export function formatTNDWithSuffix(amount, decimals = 3) {
  return `${formatTND(amount, decimals)} د.ت`;
}

/**
 * Format a whole number (e.g. counts) with Tunisian thousands separators.
 * @param {number} value
 * @returns {string} e.g. "1 205"
 */
export function formatCount(value) {
  if (value === null || value === undefined) return '...';
  return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
