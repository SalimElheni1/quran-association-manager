const { getQuery } = require('../../db/db');
const { error: logError } = require('../logger');

/**
 * Generates a new, unique matricule for a given entity type.
 * @param {('student'|'teacher'|'user'|'inventory'|'group')} entityType The type of entity.
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
    case 'inventory':
      prefix = 'INV-';
      tableName = 'inventory_items';
      break;
    case 'group':
      prefix = 'G-';
      tableName = 'groups';
      break;
    default:
      throw new Error(`Invalid entity type for matricule generation: ${entityType}`);
  }

  // This query extracts the numeric part of the matricule, casts it to an integer,
  // finds the maximum value, and handles the case where no matricules exist yet (returning 0).
  const substrIndex = prefix.length + 1;
  const sql = `SELECT COALESCE(MAX(CAST(SUBSTR(matricule, ${substrIndex}) AS INTEGER)), 0) as max_id FROM ${tableName} WHERE matricule LIKE ?`;
  const params = [`${prefix}%`];

  try {
    const result = await getQuery(sql, params);
    const nextId = (result.max_id || 0) + 1;

    // Pad with leading zeros to 6 digits to ensure consistent length (e.g., 000001, 000010, 000100)
    const paddedId = nextId.toString().padStart(6, '0');

    return `${prefix}${paddedId}`;
  } catch (error) {
    logError(`Failed to generate matricule for ${entityType}:`, error);
    throw new Error('فشل في إنشاء الرقم التعريفي.');
  }
}

module.exports = {
  generateMatricule,
};
