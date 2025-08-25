const path = require('path');
const { getAppRoot } = require('./app-path');
const { getQuery } = require(path.join(getAppRoot(), 'src', 'db', 'db.js'));

/**
 * Generates a new, unique matricule for a given entity type.
 * @param {('student'|'teacher'|'user')} entityType The type of entity.
 * @returns {Promise<string>} A promise that resolves to the new matricule (e.g., 'S-000001').
 */
async function generateMatricule(entityType) {
  let prefix = '';
  let tableName = '';

  switch (entityType) {
    case 'student':
      prefix = 'S-';
      tableName = 'students';
      break;
    case 'teacher':
      prefix = 'T-';
      tableName = 'teachers';
      break;
    case 'user':
      prefix = 'U-';
      tableName = 'users';
      break;
    default:
      throw new Error(`Invalid entity type for matricule generation: ${entityType}`);
  }

  // This query extracts the numeric part of the matricule, casts it to an integer,
  // finds the maximum value, and handles the case where no matricules exist yet (returning 0).
  const sql = `SELECT COALESCE(MAX(CAST(SUBSTR(matricule, 3) AS INTEGER)), 0) as max_id FROM ${tableName} WHERE matricule LIKE ?`;
  const params = [`${prefix}%`];

  try {
    const result = await getQuery(sql, params);
    const nextId = (result.max_id || 0) + 1;

    // Pad with leading zeros to 6 digits to ensure consistent length (e.g., 000001, 000010, 000100)
    const paddedId = nextId.toString().padStart(6, '0');

    return `${prefix}${paddedId}`;
  } catch (error) {
    console.error(`Failed to generate matricule for ${entityType}:`, error);
    throw new Error('فشل في إنشاء الرقم التعريفي.');
  }
}

module.exports = {
  generateMatricule,
};
