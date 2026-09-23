/**
 * Formats a Date as YYYY-MM-DD in local time. Unlike toISOString(), which converts
 * to UTC first, this keeps the calendar day the user sees (e.g. in UTC+1, local
 * midnight on the 1st is still the 1st, not the last day of the previous month).
 * @param {Date} date
 * @returns {string}
 */
export const toLocalISODate = (date) => {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

/**
 * Converts a stored date (e.g. '2015-03-20', '2015-03-20 10:00:00' or an ISO string)
 * to the YYYY-MM-DD value a date input expects, without a timezone round-trip
 * that could move it to the neighbouring day.
 * @param {string|Date|null|undefined} value
 * @returns {string} '' when there is no date
 */
export const toDateInputValue = (value) => {
  if (!value) return '';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : toLocalISODate(date);
};
