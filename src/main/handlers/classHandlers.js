const { ipcMain } = require('electron');
const db = require('../../db/db');
const { classValidationSchema } = require('../validationSchemas');
const { log, error: logError } = require('../logger');

/**
 * Calculates age from date of birth.
 * Uses the same logic as the frontend calculateAge function.
 *
 * @param {string} birthDateString - Date of birth in YYYY-MM-DD format
 * @returns {number|null} Age in years or null if invalid date
 */
function calculateAge(birthDateString) {
  if (!birthDateString) return null;

  const birthDate = new Date(birthDateString);
  if (isNaN(birthDate.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  const dayDiff = today.getDate() - birthDate.getDate();

  // Adjust age if birthday hasn't occurred this year yet
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age--;
  }

  return age;
}

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

    // Check if pagination parameters are provided
    const hasPagination = filters?.page !== undefined || filters?.limit !== undefined;

    if (hasPagination) {
      // Get total count without pagination
      const countSql = `SELECT COUNT(*) as total FROM (${sql}) as filtered_classes`;
      const countResult = await db.getQuery(countSql, params);
      const totalCount = countResult?.total || 0;

      sql += ' ORDER BY c.name ASC';

      // Apply pagination
      const page = parseInt(filters?.page) || 1;
      const limit = parseInt(filters?.limit) || 25;
      const offset = (page - 1) * limit;

      sql += ' LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const classes = await db.allQuery(sql, params);

      return {
        classes,
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
      };
    } else {
      // Return array directly for backwards compatibility (e.g., AttendancePage)
      sql += ' ORDER BY c.name ASC';
      return db.allQuery(sql, params);
    }
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

      // Get all active, non-enrolled students first (no age/gender filtering in SQL)
      let notEnrolledSql = `
        SELECT s.id, s.name, s.date_of_birth, s.gender
        FROM students s
        LEFT JOIN class_students cs ON s.id = cs.student_id AND cs.class_id = ?
        WHERE s.status = 'active' AND cs.student_id IS NULL AND s.date_of_birth IS NOT NULL
        ORDER BY s.name ASC
      `;

      let [enrolledStudents, notEnrolledStudents] = await Promise.all([
        db.allQuery(enrolledSql, [classId]),
        db.allQuery(notEnrolledSql, [classId]),
      ]);

      // Apply accurate age and gender filtering in JavaScript
      const ageThresholdSetting = await db.getQuery(
        "SELECT value FROM settings WHERE key = 'adult_age_threshold'",
      );
      const adultAgeThreshold = ageThresholdSetting ? parseInt(ageThresholdSetting.value, 10) : 18;

      notEnrolledStudents = notEnrolledStudents.filter(student => {
        const age = calculateAge(student.date_of_birth);

        if (classGender === 'kids') {
          return age < adultAgeThreshold;
        } else if (classGender === 'men') {
          return student.gender === 'Male' && age >= adultAgeThreshold;
        } else if (classGender === 'women') {
          return student.gender === 'Female' && age >= adultAgeThreshold;
        }

        return false; // Unknown class gender
      });

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
