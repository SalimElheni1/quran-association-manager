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
