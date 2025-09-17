const { ipcMain } = require('electron');
const db = require('../../db/db');
const { error: logError } = require('../logger');

function registerDashboardHandlers() {
  ipcMain.handle('get-dashboard-stats', async () => {
    try {
      const studentCountQuery = "SELECT COUNT(*) as count FROM students WHERE status = 'active'";
      const teacherCountQuery = 'SELECT COUNT(*) as count FROM teachers';
      const classCountQuery = "SELECT COUNT(*) as count FROM classes WHERE status = 'active'";

      // Run all queries in parallel for better performance
      const [studentResult, teacherResult, classResult] = await Promise.all([
        db.getQuery(studentCountQuery),
        db.getQuery(teacherCountQuery),
        db.getQuery(classCountQuery),
      ]);

      return {
        studentCount: studentResult.count,
        teacherCount: teacherResult.count,
        classCount: classResult.count,
      };
    } catch (error) {
      logError('Failed to get dashboard stats:', error);
      // Forward a user-friendly error to the renderer process
      throw new Error('Failed to fetch dashboard statistics.');
    }
  });

  ipcMain.handle('get-todays-classes', async () => {
    try {
      const daysOfWeek = [
        'Sunday',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday',
      ];
      const today = daysOfWeek[new Date().getDay()];

      const sql = `
        SELECT c.id, c.name, c.schedule, t.name as teacher_name
        FROM classes c
        LEFT JOIN teachers t ON c.teacher_id = t.id
        WHERE c.status = 'active' AND c.schedule LIKE ?
      `;
      // This is a simple but effective optimization. It filters in the DB, reducing data
      // transfer and JS processing. It's not as robust as a full JSON query but avoids
      // potential issues with JSON function support in older SQLite versions.
      const todaysClasses = await db.allQuery(sql, [`%"day":"${today}"%`]);
      return todaysClasses;
    } catch (error) {
      logError("Failed to get today's classes:", error);
      throw new Error("Failed to fetch today's classes.");
    }
  });
}

module.exports = { registerDashboardHandlers };
