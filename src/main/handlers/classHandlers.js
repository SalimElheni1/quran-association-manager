const { ipcMain } = require('electron');
const db = require('../../db/db');
const { classValidationSchema } = require('../validationSchemas');
const { log, error: logError } = require('../logger');
const { mapStatus, mapCategory } = require('../utils/translations');

/**
 * Calculates age from date of birth.
 * Handles multiple date formats including Unix timestamps.
 *
 * @param {string|number} birthDateValue - Date of birth in various formats
 * @returns {number|null} Age in years or null if invalid date
 */
function calculateAge(birthDateValue) {
  // Handle null, undefined, or empty values
  if (!birthDateValue) return null;

  let birthDate;

  // Handle Unix timestamp (number)
  if (typeof birthDateValue === 'number') {
    birthDate = new Date(birthDateValue);
  }
  // Handle string dates
  else if (typeof birthDateValue === 'string') {
    if (birthDateValue.trim() === '') return null;

    // Try multiple date formats to handle different storage formats
    const dateFormats = [
      birthDateValue, // Try original format first
      birthDateValue.replace(/\//g, '-'), // Convert DD/MM/YYYY to DD-MM-YYYY
      birthDateValue.split('/').reverse().join('-'), // Convert DD/MM/YYYY to YYYY-MM-DD
      birthDateValue.split('-').reverse().join('-'), // Convert DD-MM-YYYY to YYYY-MM-DD
    ];

    for (const dateStr of dateFormats) {
      const parsedDate = new Date(dateStr);
      if (!isNaN(parsedDate.getTime()) && parsedDate.getFullYear() > 1900) {
        birthDate = parsedDate;
        break;
      }
    }
  }

  // If we couldn't parse the date, return null
  if (!birthDate || isNaN(birthDate.getTime())) return null;

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
  'age_group_id',
  'fee_type',
  'monthly_fee',
];

function registerClassHandlers() {
  ipcMain.handle('classes:add', async (_event, classData) => {
    try {
      const validatedData = await classValidationSchema.validateAsync(classData, {
        abortEarly: false,
        stripUnknown: true,
      });

      // Convert non-SQLite-bindable types for compatibility
      // SQLite3 only accepts: numbers, strings, bigints, buffers, and null
      for (const key of Object.keys(validatedData)) {
        const value = validatedData[key];
        if (typeof value === 'boolean') {
          // Convert booleans to integers (0/1)
          validatedData[key] = value ? 1 : 0;
        } else if (value instanceof Date) {
          // Convert Date objects to ISO strings
          validatedData[key] = value.toISOString();
        }
      }

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
        stripUnknown: true,
      });

      // Convert non-SQLite-bindable types for compatibility
      for (const key of Object.keys(validatedData)) {
        const value = validatedData[key];
        if (typeof value === 'boolean') {
          validatedData[key] = value ? 1 : 0;
        } else if (value instanceof Date) {
          validatedData[key] = value.toISOString();
        }
      }

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
    if (!id || typeof id !== 'number') throw new Error('معرف الفصل صالح مطلوب للحذف.');
    const sql = 'DELETE FROM classes WHERE id = ?';
    return db.runQuery(sql, [id]);
  });

  ipcMain.handle('classes:get', async (_event, filters) => {
    let sql = `
      SELECT c.id, c.name, c.class_type, c.schedule, c.status, c.gender, c.age_group_id,
             c.teacher_id, t.name as teacher_name,
             ag.name as age_group_name, ag.min_age, ag.max_age
      FROM classes c
      LEFT JOIN teachers t ON c.teacher_id = t.id
      LEFT JOIN age_groups ag ON c.age_group_id = ag.id
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

      let classes = await db.allQuery(sql, params);

      // Apply translations to status and gender
      classes = classes.map((classItem) => ({
        ...classItem,
        status: mapStatus(classItem.status),
        gender: mapCategory(classItem.gender), // class gender uses category mapping (men/women/kids)
      }));

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
      let classes = await db.allQuery(sql, params);
      // Apply translations to status and gender
      classes = classes.map((classItem) => ({
        ...classItem,
        status: mapStatus(classItem.status),
        gender: mapCategory(classItem.gender),
      }));
      return classes;
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

  ipcMain.handle('classes:getEnrollmentData', async (_event, { classId, classAgeGroupId }) => {
    try {
      const ageGroup = await db.getQuery(
        `SELECT id, name, min_age, max_age, gender
         FROM age_groups
         WHERE id = ? AND is_active = 1`,
        [classAgeGroupId],
      );

      const enrolledSql = `
        SELECT s.id, s.name
        FROM students s
        INNER JOIN class_students cs ON s.id = cs.student_id
        WHERE cs.class_id = ? AND s.status = 'active'
        ORDER BY s.name ASC
      `;

      const notEnrolledSql = `
        SELECT s.id, s.name, s.date_of_birth, s.gender
        FROM students s
        LEFT JOIN class_students cs ON s.id = cs.student_id AND cs.class_id = ?
        WHERE s.status = 'active' AND cs.student_id IS NULL
        ORDER BY s.name ASC
      `;

      let [enrolledStudents, notEnrolledStudents] = await Promise.all([
        db.allQuery(enrolledSql, [classId]),
        db.allQuery(notEnrolledSql, [classId]),
      ]);

      // If age group is not set, show all students without filtering
      if (!ageGroup) {
        log(`Age group not set for class ${classId}. Showing all students without filtering.`);
        return { enrolledStudents, notEnrolledStudents, noAgeGroupWarning: true };
      }

      notEnrolledStudents = notEnrolledStudents.filter((student) => {
        const age = calculateAge(student.date_of_birth);

        if (age === null) return true;

        const ageInRange =
          age >= ageGroup.min_age && (ageGroup.max_age === null || age <= ageGroup.max_age);

        if (!ageInRange) return false;

        if (ageGroup.gender === 'any') return true;

        const studentGender =
          student.gender === 'Male'
            ? 'male_only'
            : student.gender === 'Female'
              ? 'female_only'
              : 'any';

        return ageGroup.gender === studentGender;
      });

      log(`Filtered ${notEnrolledStudents.length} students for age group: ${ageGroup.name}`);

      return { enrolledStudents, notEnrolledStudents };
    } catch (error) {
      logError('Error fetching enrollment data:', error);
      throw error;
    }
  });

  ipcMain.handle('classes:updateEnrollments', async (_event, { classId, studentIds, userId }) => {
    try {
      // Track which students were added/removed for charge regeneration
      const oldEnrollments = await db.allQuery(
        'SELECT student_id FROM class_students WHERE class_id = ?',
        [classId],
      );
      const oldStudentIds = oldEnrollments.map((e) => e.student_id);

      // Identify added and removed students
      const addedStudents = (studentIds || []).filter((id) => !oldStudentIds.includes(id));
      const removedStudents = oldStudentIds.filter((id) => !(studentIds || []).includes(id));
      const affectedStudents = [...new Set([...addedStudents, ...removedStudents])];

      log(`[Enrollment] ════════════════════════════════════════════════════`);
      log(`[Enrollment] Updating enrollments for class ${classId}`);
      log(`[Enrollment] Previous students: ${oldStudentIds.join(', ') || 'none'}`);
      log(`[Enrollment] New students: ${(studentIds || []).join(', ') || 'none'}`);
      log(`[Enrollment] Added students: ${addedStudents.join(', ') || 'none'}`);
      log(`[Enrollment] Removed students: ${removedStudents.join(', ') || 'none'}`);
      log(`[Enrollment] Total affected: ${affectedStudents.length} student(s)`);

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

      log(`[Enrollment] ✓ Database updated successfully`);

      // 🆕 NEW: Trigger charge regeneration for affected students
      const { triggerChargeRegenerationForStudent } = require('./studentFeeHandlers');
      for (const studentId of affectedStudents) {
        try {
          log(`[Enrollment] ▶️ Triggering charge regeneration for student ${studentId}...`);
          await triggerChargeRegenerationForStudent(studentId, { userId });
          log(`[Enrollment] ✅ Student ${studentId} charges regenerated`);
        } catch (error) {
          logError(`[Enrollment] ❌ Failed to regenerate charges for student ${studentId}:`, error);
          // Don't fail the enrollment operation - continue
        }
      }

      log(`[Enrollment] ✅ Enrollments updated successfully`);
      log(`[Enrollment] ════════════════════════════════════════════════════`);
      return { success: true, affectedStudents };
    } catch (error) {
      await db.runQuery('ROLLBACK');
      logError('Error updating enrollments:', error);
      throw error;
    }
  });

  ipcMain.handle('classes:getForStudent', async (_event, { studentGender, studentAge }) => {
    try {
      const ageGroups = await db.allQuery(
        `SELECT id, name, min_age, max_age, gender
         FROM age_groups
         WHERE is_active = 1
         ORDER BY min_age ASC`,
        [],
      );

      const matchingAgeGroups = ageGroups.filter((ag) => {
        if (studentAge === null) return true;

        const ageInRange =
          studentAge >= ag.min_age && (ag.max_age === null || studentAge <= ag.max_age);

        if (!ageInRange) return false;

        if (ag.gender === 'any') return true;

        const mappedGender =
          studentGender === 'Male'
            ? 'male_only'
            : studentGender === 'Female'
              ? 'female_only'
              : 'any';

        return ag.gender === mappedGender;
      });

      if (matchingAgeGroups.length === 0) {
        log(`No matching age groups for student (gender: ${studentGender}, age: ${studentAge})`);
        return [];
      }

      const ageGroupIds = matchingAgeGroups.map((ag) => ag.id);
      const placeholders = ageGroupIds.map(() => '?').join(',');

      const sql = `
        SELECT c.id, c.name, c.class_type, c.schedule, c.status, c.gender,
               c.teacher_id, t.name as teacher_name, c.age_group_id,
               ag.name as age_group_name
        FROM classes c
        LEFT JOIN teachers t ON c.teacher_id = t.id
        LEFT JOIN age_groups ag ON c.age_group_id = ag.id
        WHERE c.age_group_id IN (${placeholders}) AND c.status != 'pending'
        ORDER BY c.name ASC
      `;

      let classes = await db.allQuery(sql, ageGroupIds);

      classes = classes.map((classItem) => ({
        ...classItem,
        status: mapStatus(classItem.status),
        gender: mapCategory(classItem.gender),
      }));

      log(
        `Found ${classes.length} classes for student (gender: ${studentGender}, age: ${studentAge})`,
      );
      return classes;
    } catch (error) {
      logError('Error fetching classes for student:', error);
      throw error;
    }
  });
}

module.exports = { registerClassHandlers };
