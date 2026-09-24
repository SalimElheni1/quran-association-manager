/**
 * Formats a Date as YYYY-MM-DD in local time. Unlike toISOString(), which converts
 * to UTC first, this keeps the calendar day the user sees (in UTC+1, anything
 * recorded between 00:00 and 01:00 would otherwise be dated the previous day).
 * @param {Date} [date=new Date()]
 * @returns {string}
 */
function toLocalISODate(date = new Date()) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

module.exports = { toLocalISODate };
