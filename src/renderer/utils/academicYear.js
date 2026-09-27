/**
 * The academic year ("YYYY-YYYY") a date falls in.
 * @param {Date} date
 * @param {number} [startMonth=9] Month the academic year starts (1-12), from the
 *   academic_year_start_month setting.
 * @returns {string}
 */
export const getAcademicYearStringFor = (date, startMonth = 9) => {
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  return month >= startMonth ? `${year}-${year + 1}` : `${year - 1}-${year}`;
};

/**
 * The current academic year ("YYYY-YYYY").
 * @param {number} [startMonth=9] Month the academic year starts (1-12).
 * @returns {string}
 */
export const getAcademicYearString = (startMonth = 9) =>
  getAcademicYearStringFor(new Date(), startMonth);
