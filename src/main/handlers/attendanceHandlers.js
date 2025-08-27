const { ipcMain } = require('electron');
const db = require('../../db/db');
const { log, error: logError } = require('../logger');

function registerAttendanceHandlers() {
  ipcMain.handle('attendance:getClassesForDay', async (_event, date) => {
    try {
      // Using date parameter to filter classes that are active on the specified date
      const sql = `
        SELECT DISTINCT c.id, c.name, c.class_type, c.teacher_id, t.name as teacher_name
        FROM classes c
        LEFT JOIN teachers t ON c.teacher_id = t.id
        WHERE c.status = 'active'
        AND (
          (c.start_date IS NULL OR c.start_date <= ?)
          AND (c.end_date IS NULL OR c.end_date >= ?)
        )
        ORDER BY c.name ASC
      `;
      return db.allQuery(sql, [date, date]);
    } catch (error) {
      logError('Error fetching classes for day:', error);
      throw error;
    }
  });

  ipcMain.handle('attendance:getStudentsForClass', async (_event, classId) => {
    try {
      const sql = `
        SELECT s.id, s.name, s.date_of_birth
        FROM students s
        INNER JOIN class_students cs ON s.id = cs.student_id
        WHERE cs.class_id = ? AND s.status = 'active'
        ORDER BY s.name ASC
      `;
      return db.allQuery(sql, [classId]);
    } catch (error) {
      logError('Error fetching students for class:', error);
      throw error;
    }
  });

  ipcMain.handle('attendance:getForDate', async (_event, { classId, date }) => {
    try {
      const sql = `
        SELECT student_id, status
        FROM attendance
        WHERE class_id = ? AND date = ?
      `;
      const records = await db.allQuery(sql, [classId, date]);
      const attendanceMap = {};
      records.forEach((record) => {
        attendanceMap[record.student_id] = record.status;
      });
      return attendanceMap;
    } catch (error) {
      logError('Error fetching attendance for date:', error);
      throw error;
    }
  });

  ipcMain.handle('db:get-attendance-summary-for-class', async (event, classId) => {
    if (!classId) return [];
    // This SQL query is efficient. It groups by date, counts records for each date,
    // and orders them with the most recent date first.
    const query = `
      SELECT
        date,
        COUNT(*) as record_count
      FROM attendance
      WHERE class_id = ?
      GROUP BY date
      ORDER BY date DESC
    `;
    const rows = await db.allQuery(query, [classId]);
    return rows;
  });

  ipcMain.handle('attendance:save', async (_event, { classId, date, records }) => {
    try {
      await db.runQuery('BEGIN TRANSACTION');
      await db.runQuery('DELETE FROM attendance WHERE class_id = ? AND date = ?', [classId, date]);
      if (records && Object.keys(records).length > 0) {
        const placeholders = Object.keys(records)
          .map(() => '(?, ?, ?, ?)')
          .join(', ');
        const params = [];
        Object.entries(records).forEach(([studentId, status]) => {
          params.push(classId, parseInt(studentId), date, status);
        });
        const sql = `INSERT INTO attendance (class_id, student_id, date, status) VALUES ${placeholders}`;
        await db.runQuery(sql, params);
      }
      await db.runQuery('COMMIT');
      log('Attendance saved successfully');
      return { success: true };
    } catch (error) {
      await db.runQuery('ROLLBACK');
      logError('Error saving attendance:', error);
      throw error;
    }
  });
}

module.exports = { registerAttendanceHandlers };
