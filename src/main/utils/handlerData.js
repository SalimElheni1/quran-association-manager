// Small helpers the record handlers share: values SQLite can store, the Arabic message of a Joi
// validation error, and the role names of a user.
const db = require('../../db/db');

/**
 * Turns the values better-sqlite3 cannot bind into ones it can, in place: booleans become 0/1,
 * Dates become text. Joi returns Dates for date fields.
 * @param {object} data
 * @param {object} [options]
 * @param {'day'|'iso'} [options.dates] 'day' stores YYYY-MM-DD; 'iso' the full ISO time (the
 *   users table has always kept that).
 * @returns {object} data
 */
function toSqliteValues(data, { dates = 'day' } = {}) {
  for (const key of Object.keys(data)) {
    const value = data[key];
    if (typeof value === 'boolean') {
      data[key] = value ? 1 : 0;
    } else if (value instanceof Date) {
      const iso = value.toISOString();
      data[key] = dates === 'iso' ? iso : iso.split('T')[0];
    }
  }
  return data;
}

/** The error a handler throws for a failed Joi validation: «بيانات غير صالحة: ...». */
function invalidDataError(joiError) {
  return new Error(`بيانات غير صالحة: ${joiError.details.map((d) => d.message).join('; ')}`);
}

/** The names of the roles a user holds. */
async function getUserRoleNames(userId) {
  const roles = await db.allQuery(
    'SELECT r.name FROM roles r JOIN user_roles ur ON r.id = ur.role_id WHERE ur.user_id = ?',
    [userId],
  );
  return roles.map((r) => r.name);
}

module.exports = { toSqliteValues, invalidDataError, getUserRoleNames };
