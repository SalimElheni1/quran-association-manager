/**
 * Reads a date of birth: a Date, a timestamp, or a string in YYYY-MM-DD form, or
 * DD/MM/YYYY and DD-MM-YYYY from older imports.
 * Keep in step with src/main/utils/age.js, which applies the same rules in the main process.
 * @param {Date|number|string|null|undefined} value
 * @returns {Date|null} null when the value is empty or not a date
 */
const parseBirthDate = (value) => {
  if (!value) return null;

  let birthDate = null;

  if (value instanceof Date) {
    birthDate = value;
  } else if (typeof value === 'number') {
    birthDate = new Date(value);
  } else if (typeof value === 'string') {
    if (value.trim() === '') return null;

    const dateFormats = [
      value,
      value.replace(/\//g, '-'), // DD/MM/YYYY -> DD-MM-YYYY
      value.split('/').reverse().join('-'), // DD/MM/YYYY -> YYYY-MM-DD
      value.split('-').reverse().join('-'), // DD-MM-YYYY -> YYYY-MM-DD
    ];

    for (const dateStr of dateFormats) {
      const parsedDate = new Date(dateStr);
      if (!isNaN(parsedDate.getTime()) && parsedDate.getFullYear() > 1900) {
        birthDate = parsedDate;
        break;
      }
    }
  }

  return birthDate && !isNaN(birthDate.getTime()) ? birthDate : null;
};

/**
 * Age in whole years on a given day.
 * @param {Date|number|string|null|undefined} birthDateValue See parseBirthDate.
 * @param {Date} [today=new Date()]
 * @returns {number|null} null when there is no valid date of birth
 */
export const calculateAge = (birthDateValue, today = new Date()) => {
  const birthDate = parseBirthDate(birthDateValue);
  if (!birthDate) return null;

  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  const dayDiff = today.getDate() - birthDate.getDate();

  // Birthday not reached yet this year
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age--;
  }

  return age;
};
