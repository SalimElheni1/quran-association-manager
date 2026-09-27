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

/**
 * Formats a Date as 'YYYY-MM-DD HH:MM:SS' in local time, the form SQLite date functions read.
 * Use it instead of CURRENT_TIMESTAMP, which is UTC.
 * @param {Date} [date=new Date()]
 * @returns {string}
 */
function toLocalISODateTime(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${toLocalISODate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(
    date.getSeconds(),
  )}`;
}

module.exports = { toLocalISODate, toLocalISODateTime };
