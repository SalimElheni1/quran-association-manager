const { ipcMain } = require('electron');
const db = require('../../db/db');
const { classValidationSchema } = require('../validationSchemas');
const { log, error: logError } = require('../logger');

const classFields = [
  'name',
  'class_type',
  'teacher_id',
  'schedule',
  'start_date',
  'end_date',
  'status',
  'capacity',
  'gender',
];

function registerClassHandlers() {
  ipcMain.handle('classes:add', async (_event, classData) => {
    try {
      const validatedData = await classValidationSchema.validateAsync(classData, {
        abortEarly: false,
        stripUnknown: false,
      });
      const fieldsToInsert = classFields.filter((field) => validatedData[field] !== undefined);
      if (fieldsToInsert.length === 0) throw new Error('No valid fields to insert.');
      const placeholders = fieldsToInsert.map(() => '?').join(', ');
      const params = fieldsToInsert.map((field) => validatedData[field] ?? null);
      const sql = `INSERT INTO classes (${fieldsToInsert.join(', ')}) VALUES (${placeholders})`;
      return db.runQuery(sql, params);
    } catch (error) {
      if (error.isJoi)
        throw new Error(`بيانات غير صالحة: ${error.details.map((d) => d.message).join('; ')}`);
      logError('Error in classes:add handler:', error);
      throw new Error('حدث خطأ غير متوقع في الخادم.');
    }
  });

  ipcMain.handle('classes:update', async (_event, id, classData) => {
    try {
      const validatedData = await classValidationSchema.validateAsync(classData, {
        abortEarly: false,
        stripUnknown: false,
      });
      const fieldsToUpdate = classFields.filter((field) => validatedData[field] !== undefined);
      const setClauses = fieldsToUpdate.map((field) => `${field} = ?`).join(', ');
      const params = [...fieldsToUpdate.map((field) => validatedData[field] ?? null), id];
      const sql = `UPDATE classes SET ${setClauses} WHERE id = ?`;
      return db.runQuery(sql, params);
    } catch (error) {
      if (error.isJoi)
        throw new Error(`بيانات غير صالحة: ${error.details.map((d) => d.message).join('; ')}`);
      logError('Error in classes:update handler:', error);
      throw new Error('حدث خطأ غير متوقع في الخادم.');
    }
  });

  ipcMain.handle('classes:delete', (_event, id) => {
    if (!id || typeof id !== 'number')
      throw new Error('A valid class ID is required for deletion.');
    const sql = 'DELETE FROM classes WHERE id = ?';
    return db.runQuery(sql, [id]);
  });

  ipcMain.handle('classes:get', async (_event, filters) => {
    let sql = `
      SELECT c.id, c.name, c.class_type, c.schedule, c.status, c.gender,
             c.teacher_id, t.name as teacher_name
      FROM classes c
      LEFT JOIN teachers t ON c.teacher_id = t.id
      WHERE 1=1
    `;
    const params = [];
    if (filters?.searchTerm) {
      sql += ' AND c.name LIKE ?';
      params.push(`%${filters.searchTerm}%`);
    }
    if (filters?.status) {
      sql += ' AND c.status = ?';
      params.push(filters.status);
    }
    sql += ' ORDER BY c.name ASC';
    return db.allQuery(sql, params);
  });

  ipcMain.handle('classes:getById', (_event, id) => {
    const sql = `
      SELECT c.*, t.name as teacher_name
      FROM classes c
      LEFT JOIN teachers t ON c.teacher_id = t.id
      WHERE c.id = ?
    `;
    return db.getQuery(sql, [id]);
  });

  ipcMain.handle('classes:getEnrollmentData', async (_event, { classId, classGender }) => {
    try {
      const enrolledSql = `
        SELECT s.id, s.name
        FROM students s
        INNER JOIN class_students cs ON s.id = cs.student_id
        WHERE cs.class_id = ? AND s.status = 'active'
        ORDER BY s.name ASC
      `;

      let notEnrolledSql = `
        SELECT s.id, s.name
        FROM students s
        LEFT JOIN class_students cs ON s.id = cs.student_id AND cs.class_id = ?
        WHERE s.status = 'active' AND cs.student_id IS NULL
      `;
      const notEnrolledParams = [classId];

      const ageThresholdSetting = await db.getQuery(
        "SELECT value FROM settings WHERE key = 'adult_age_threshold'",
      );
      const adultAgeThreshold = ageThresholdSetting ? parseInt(ageThresholdSetting.value, 10) : 18;

      const thresholdDate = new Date();
      thresholdDate.setFullYear(thresholdDate.getFullYear() - adultAgeThreshold);
      const adultOrKidBirthDate = thresholdDate.toISOString().split('T')[0];

      if (classGender === 'kids') {
        notEnrolledSql += ` AND s.date_of_birth > ?`;
        notEnrolledParams.push(adultOrKidBirthDate);
      } else if (classGender === 'men') {
        notEnrolledSql += ` AND s.gender = 'Male' AND s.date_of_birth <= ?`;
        notEnrolledParams.push(adultOrKidBirthDate);
      } else if (classGender === 'women') {
        notEnrolledSql += ` AND s.gender = 'Female' AND s.date_of_birth <= ?`;
        notEnrolledParams.push(adultOrKidBirthDate);
      }
      notEnrolledSql += ' ORDER BY s.name ASC';

      const [enrolledStudents, notEnrolledStudents] = await Promise.all([
        db.allQuery(enrolledSql, [classId]),
        db.allQuery(notEnrolledSql, notEnrolledParams),
      ]);

      return { enrolledStudents, notEnrolledStudents };
    } catch (error) {
      logError('Error fetching enrollment data:', error);
      throw error;
    }
  });

  ipcMain.handle('classes:updateEnrollments', async (_event, { classId, studentIds }) => {
    try {
      await db.runQuery('BEGIN TRANSACTION');
      await db.runQuery('DELETE FROM class_students WHERE class_id = ?', [classId]);
      if (studentIds && studentIds.length > 0) {
        const placeholders = studentIds.map(() => '(?, ?)').join(', ');
        const params = [];
        studentIds.forEach((studentId) => {
          params.push(classId, studentId);
        });
        const sql = `INSERT INTO class_students (class_id, student_id) VALUES ${placeholders}`;
        await db.runQuery(sql, params);
      }
      await db.runQuery('COMMIT');
      log('Enrollments updated successfully');
      return { success: true };
    } catch (error) {
      await db.runQuery('ROLLBACK');
      logError('Error updating enrollments:', error);
      throw error;
    }
  });
}

module.exports = { registerClassHandlers };
