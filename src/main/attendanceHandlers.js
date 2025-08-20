const db = require('../db/db');
const Joi = require('joi');

// --- Validation Schemas ---

const attendanceSheetValidationSchema = Joi.object({
  seance_id: Joi.number().integer().positive().required(),
  date: Joi.date().iso().required(),
  notes: Joi.string().allow(null, ''),
}).unknown(true);

const attendanceEntryValidationSchema = Joi.object({
  status: Joi.string().valid('present', 'absent', 'late', 'excused').required(),
  notes: Joi.string().allow(null, '').default(''),
});


// --- Handlers ---

async function getAttendanceSheetHandler({ seanceId, date }) {
  if (!seanceId || !date) {
    throw new Error('Seance ID and date are required.');
  }

  const sheetSql = 'SELECT * FROM attendance_sheets WHERE seance_id = ? AND date = ?';
  const sheet = await db.getQuery(sheetSql, [seanceId, date]);

  if (!sheet) {
    return null;
  }

  const entriesSql = 'SELECT * FROM attendance_entries WHERE sheet_id = ?';
  const entries = await db.allQuery(entriesSql, [sheet.id]);

  const studentsSql = `
    SELECT s.id, s.name
    FROM students s
    JOIN class_students cs ON s.id = cs.student_id
    WHERE cs.class_id = ? AND s.status = 'active'
    ORDER BY s.name ASC
  `;
  const students = await db.allQuery(studentsSql, [seanceId]);

  const attendanceData = {
    sheet,
    entries: {},
  };

  const savedEntriesMap = new Map(entries.map(e => [e.student_id, e]));

  students.forEach(student => {
    const savedEntry = savedEntriesMap.get(student.id);
    attendanceData.entries[student.id] = {
      status: savedEntry?.status || 'present',
      notes: savedEntry?.notes || '',
    };
  });

  return attendanceData;
}

async function createAttendanceSheetHandler({ sheetData, entriesData }) {
  const validatedSheet = await attendanceSheetValidationSchema.validateAsync(sheetData);
  if (!entriesData || typeof entriesData !== 'object' || Object.keys(entriesData).length === 0) {
    throw new Error('Entries data must be a non-empty object.');
  }

  await db.runQuery('BEGIN TRANSACTION');
  try {
    const sheetSql = 'INSERT INTO attendance_sheets (seance_id, date, notes) VALUES (?, ?, ?)';
    const sheetResult = await db.runQuery(sheetSql, [
      validatedSheet.seance_id,
      validatedSheet.date,
      validatedSheet.notes,
    ]);
    const sheetId = sheetResult.id;

    const entryPlaceholders = [];
    const entryParams = [];
    for (const studentIdStr in entriesData) {
      const studentId = parseInt(studentIdStr, 10);
      const entry = entriesData[studentIdStr];
      const validatedEntry = await attendanceEntryValidationSchema.validateAsync(entry);
      entryPlaceholders.push('(?, ?, ?, ?)');
      entryParams.push(sheetId, studentId, validatedEntry.status, validatedEntry.notes);
    }

    if (entryPlaceholders.length > 0) {
        const entriesSql = `INSERT INTO attendance_entries (sheet_id, student_id, status, notes) VALUES ${entryPlaceholders.join(', ')}`;
        await db.runQuery(entriesSql, entryParams);
    }

    await db.runQuery('COMMIT');
    return { success: true, sheetId };
  } catch (error) {
    await db.runQuery('ROLLBACK');
    if (error.message.includes('UNIQUE constraint failed')) {
        throw new Error('An attendance sheet for this seance and date already exists.');
    }
    throw error;
  }
}

async function updateAttendanceSheetHandler({ sheetId, sheetData, entriesData }) {
    const validatedSheet = await attendanceSheetValidationSchema.validateAsync(sheetData);
    if (!entriesData || typeof entriesData !== 'object' || Object.keys(entriesData).length === 0) {
        throw new Error('Entries data must be a non-empty object.');
    }

    await db.runQuery('BEGIN TRANSACTION');
    try {
        const sheetSql = 'UPDATE attendance_sheets SET notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
        await db.runQuery(sheetSql, [validatedSheet.notes, sheetId]);

        await db.runQuery('DELETE FROM attendance_entries WHERE sheet_id = ?', [sheetId]);

        const entryPlaceholders = [];
        const entryParams = [];
        for (const studentIdStr in entriesData) {
            const studentId = parseInt(studentIdStr, 10);
            const entry = entriesData[studentIdStr];
            const validatedEntry = await attendanceEntryValidationSchema.validateAsync(entry);
            entryPlaceholders.push('(?, ?, ?, ?)');
            entryParams.push(sheetId, studentId, validatedEntry.status, validatedEntry.notes);
        }

        if (entryPlaceholders.length > 0) {
            const entriesSql = `INSERT INTO attendance_entries (sheet_id, student_id, status, notes) VALUES ${entryPlaceholders.join(', ')}`;
            await db.runQuery(entriesSql, entryParams);
        }

        await db.runQuery('COMMIT');
        return { success: true, sheetId };
    } catch (error) {
        await db.runQuery('ROLLBACK');
        throw error;
    }
}

async function getAttendanceSheetsHandler(filters = {}) {
    let sql = `
      SELECT
        ash.id, ash.date, ash.notes, ash.seance_id,
        c.name as seance_name,
        t.name as teacher_name,
        (SELECT COUNT(*) FROM attendance_entries WHERE sheet_id = ash.id) as student_count,
        (SELECT COUNT(*) FROM attendance_entries WHERE sheet_id = ash.id AND status = 'present') as present_count
      FROM attendance_sheets ash
      JOIN classes c ON ash.seance_id = c.id
      LEFT JOIN teachers t ON c.teacher_id = t.id
      WHERE 1=1
    `;
    const params = [];

    if (filters.seanceId) {
      sql += ' AND ash.seance_id = ?';
      params.push(filters.seanceId);
    }
    if (filters.startDate) {
      sql += ' AND ash.date >= ?';
      params.push(filters.startDate);
    }
    if (filters.endDate) {
      sql += ' AND ash.date <= ?';
      params.push(filters.endDate);
    }

    sql += ' ORDER BY ash.date DESC, c.name ASC';

    return db.allQuery(sql, params);
}


function registerAttendanceHandlers() {
  ipcMain.handle('attendance-sheets:get', (_event, filters) => getAttendanceSheetsHandler(filters));
  ipcMain.handle('attendance-sheets:get-one', (_event, { seanceId, date }) => getAttendanceSheetHandler({ seanceId, date }));
  ipcMain.handle('attendance-sheets:create', (_event, { sheetData, entriesData }) => createAttendanceSheetHandler({ sheetData, entriesData }));
  ipcMain.handle('attendance-sheets:update', (_event, { sheetId, sheetData, entriesData }) => updateAttendanceSheetHandler({ sheetId, sheetData, entriesData }));
}

module.exports = {
  registerAttendanceHandlers,
  // Export individual handlers for testing
  getAttendanceSheetHandler,
  createAttendanceSheetHandler,
  updateAttendanceSheetHandler,
  getAttendanceSheetsHandler,
};
