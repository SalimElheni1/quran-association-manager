const { ipcMain } = require('electron');
const Joi = require('joi');
const db = require('../db/db');

// --- Validation Schemas ---

const getSheetSchema = Joi.object({
  seanceId: Joi.number().integer().positive().required(),
  date: Joi.string().isoDate().required(), // YYYY-MM-DD
});

const createSheetSchema = Joi.object({
  seanceId: Joi.number().integer().positive().required(),
  date: Joi.string().isoDate().required(),
  entries: Joi.object()
    .pattern(Joi.number(), Joi.string().valid('present', 'absent', 'late', 'excused'))
    .required(),
  userId: Joi.number().integer().positive().allow(null),
});

const updateSheetSchema = Joi.object({
  sheetId: Joi.number().integer().positive().required(),
  entries: Joi.object()
    .pattern(Joi.number(), Joi.string().valid('present', 'absent', 'late', 'excused'))
    .required(),
});

const listSheetsSchema = Joi.object({
  seanceId: Joi.number().integer().positive().allow(null, ''),
  startDate: Joi.string().isoDate().allow(null, ''),
  endDate: Joi.string().isoDate().allow(null, ''),
});

// --- IPC Handlers Implementation ---

/**
 * Fetches a single attendance sheet for a given seance and date,
 * along with all its student entries.
 */
async function getSheetHandler({ seanceId, date }) {
  await getSheetSchema.validateAsync({ seanceId, date });

  const sheet = await db.getQuery(
    'SELECT * FROM attendance_sheets WHERE seance_id = ? AND date = ?',
    [seanceId, date],
  );

  if (!sheet) {
    return null; // No sheet exists for this combination
  }

  const entries = await db.allQuery(
    'SELECT student_id, status, note FROM attendance_entries WHERE sheet_id = ?',
    [sheet.id],
  );

  // Convert entries array to a map for easier frontend access
  const entriesMap = entries.reduce((acc, entry) => {
    acc[entry.student_id] = { status: entry.status, note: entry.note };
    return acc;
  }, {});

  return { ...sheet, entries: entriesMap };
}

/**
 * Creates a new attendance sheet and all its entries in a single transaction.
 */
async function createSheetHandler({ seanceId, date, entries, userId }) {
  await createSheetSchema.validateAsync({ seanceId, date, entries, userId });

  await db.runQuery('BEGIN TRANSACTION');
  try {
    const sheetResult = await db.runQuery(
      'INSERT INTO attendance_sheets (seance_id, date, created_by, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
      [seanceId, date, userId],
    );
    const sheetId = sheetResult.id;

    if (Object.keys(entries).length > 0) {
      const entryPlaceholders = Object.keys(entries).map(() => '(?, ?, ?)').join(', ');
      const entryParams = [];
      for (const [studentId, status] of Object.entries(entries)) {
        entryParams.push(sheetId, parseInt(studentId, 10), status);
      }
      const entrySql = `INSERT INTO attendance_entries (sheet_id, student_id, status) VALUES ${entryPlaceholders}`;
      await db.runQuery(entrySql, entryParams);
    }

    await db.runQuery('COMMIT');
    return { id: sheetId };
  } catch (error) {
    await db.runQuery('ROLLBACK');
    console.error('Error creating attendance sheet:', error);
    if (error.message.includes('UNIQUE constraint failed')) {
      throw new Error('An attendance sheet for this seance and date already exists.');
    }
    throw error; // Re-throw other errors
  }
}

/**
 * Updates an existing attendance sheet's entries in a single transaction.
 */
async function updateSheetHandler({ sheetId, entries }) {
  await updateSheetSchema.validateAsync({ sheetId, entries });

  await db.runQuery('BEGIN TRANSACTION');
  try {
    // We will delete all existing entries and insert the new ones.
    // This is simpler and safer than trying to diff the changes.
    await db.runQuery('DELETE FROM attendance_entries WHERE sheet_id = ?', [sheetId]);

    if (Object.keys(entries).length > 0) {
      const entryPlaceholders = Object.keys(entries).map(() => '(?, ?, ?)').join(', ');
      const entryParams = [];
      for (const [studentId, status] of Object.entries(entries)) {
        entryParams.push(sheetId, parseInt(studentId, 10), status);
      }
      const entrySql = `INSERT INTO attendance_entries (sheet_id, student_id, status) VALUES ${entryPlaceholders}`;
      await db.runQuery(entrySql, entryParams);
    }

    // Update the 'updated_at' timestamp on the sheet
    await db.runQuery('UPDATE attendance_sheets SET updated_at = CURRENT_TIMESTAMP WHERE id = ?', [sheetId]);

    await db.runQuery('COMMIT');
    return { success: true };
  } catch (error) {
    await db.runQuery('ROLLBACK');
    console.error('Error updating attendance sheet:', error);
    throw error;
  }
}

/**
 * Lists all saved attendance sheets, with optional filters.
 */
async function listSheetsHandler(filters = {}) {
  await listSheetsSchema.validateAsync(filters);

  let sql = `
    SELECT
      s.id,
      s.date,
      s.updated_at,
      c.name AS seance_name,
      c.id AS seance_id
    FROM attendance_sheets s
    JOIN classes c ON s.seance_id = c.id
    WHERE 1=1
  `;
  const params = [];

  if (filters.seanceId) {
    sql += ' AND s.seance_id = ?';
    params.push(filters.seanceId);
  }
  if (filters.startDate) {
    sql += ' AND s.date >= ?';
    params.push(filters.startDate);
  }
  if (filters.endDate) {
    sql += ' AND s.date <= ?';
    params.push(filters.endDate);
  }

  sql += ' ORDER BY s.date DESC, c.name ASC';

  return db.allQuery(sql, params);
}


// --- Registration ---

function registerAttendanceHandlers() {
  ipcMain.handle('attendance:getSheet', (_event, args) => getSheetHandler(args));
  ipcMain.handle('attendance:createSheet', (_event, args) => createSheetHandler(args));
  ipcMain.handle('attendance:updateSheet', (_event, args) => updateSheetHandler(args));
  ipcMain.handle('attendance:listSheets', (_event, args) => listSheetsHandler(args));
}

module.exports = {
  registerAttendanceHandlers,
};
