/**
 * @fileoverview Student management IPC handlers for Quran Branch Manager.
 * Provides CRUD operations for student records including validation,
 * matricule generation, and group assignments.
 *
 * @author Quran Branch Manager Team
 * @version 1.0.2-beta
 * @requires electron - For IPC communication
 * @requires ../../db/db - Database operations
 * @requires ../validationSchemas - Data validation schemas
 * @requires ../matriculeService - Matricule number generation
 * @requires ../logger - Application logging
 */

const { ipcMain } = require('electron');
const db = require('../../db/db');
const { studentValidationSchema } = require('../validationSchemas');
const { generateMatricule } = require('../services/matriculeService');
const { error: logError } = require('../logger');
const { requireRoles } = require('../authMiddleware');
const { translateStudent } = require('../utils/translations');

/**
 * Calculates age from date of birth string.
 * Uses the same logic as the frontend calculateAge function.
 *
 * @param {string} dob - Date of birth in YYYY-MM-DD format
 * @returns {number|null} Age in years or null if invalid date
 */
function calculateAge(dob) {
  if (!dob) return null;
  const birthDate = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

/**
 * Array of valid student database fields used for INSERT and UPDATE operations.
 * This ensures only valid fields are processed and prevents SQL injection.
 *
 * @type {string[]}
 * @constant
 */
const studentFields = [
  'matricule', // Unique student identifier
  'name', // Full name
  'date_of_birth', // Birth date (YYYY-MM-DD)
  'gender', // Gender (male/female)
  'address', // Home address
  'contact_info', // Phone number or other contact
  'email', // Email address
  'status', // Active/inactive status
  'is_full_memorizer', // Is the student a full Quran memorizer?
  'notes', // Additional notes
  'parent_name', // Parent/guardian name
  'guardian_relation', // Relationship to guardian
  'parent_contact', // Parent contact information
  'guardian_email', // Guardian email address
  'emergency_contact_name', // Emergency contact person
  'emergency_contact_phone', // Emergency contact phone
  'health_conditions', // Medical conditions or allergies
  'national_id', // National ID number
  'school_name', // Current school name
  'grade_level', // Current grade/class level
  'educational_level', // Education level (primary, secondary, etc.)
  'occupation', // Student's occupation (if applicable)
  'civil_status', // Marital status
  'related_family_members', // Family members in the association
  'fee_category', // Student fee category (CAN_PAY, EXEMPT, SPONSORED)
  'sponsor_name', // Sponsor name for sponsored students
  'sponsor_phone', // Sponsor phone for sponsored students
  'sponsor_cin', // Sponsor CIN for sponsored students
  'discount_percentage', // Discount percentage for student fees
  'discount_reason', // Reason for the discount
];

/**
 * Registers all student-related IPC handlers with the main process.
 * This function sets up the communication channels between the renderer
 * and main processes for student management operations.
 *
 * Registered handlers:
 * - students:get - Retrieve students with optional filtering
 * - students:getById - Get a specific student by ID
 * - students:add - Add a new student
 * - students:update - Update an existing student
 * - students:delete - Delete a student
 *
 * @returns {void}
 */
function registerStudentHandlers() {
  /**
   * Retrieves students from the database with optional filtering.
   * Supports search by name/matricule, gender filtering, and age range filtering.
   */
  ipcMain.handle(
    'students:get',
    requireRoles(['Superadmin', 'Administrator', 'FinanceManager', 'SessionSupervisor'])(
      async (_event, filters) => {
        try {
          let params = [];
          let havingClauses = [];

          let sql = `
        SELECT s.id, s.matricule, s.name, s.date_of_birth, s.enrollment_date, s.status, s.gender, s.fee_category
        FROM students s
      `;

          if (filters?.surahIds?.length > 0) {
            sql += `
          LEFT JOIN student_surahs ss ON s.id = ss.student_id
        `;
            const placeholders = filters.surahIds.map(() => '?').join(',');
            havingClauses.push(
              `SUM(CASE WHEN ss.surah_id IN (${placeholders}) THEN 1 ELSE 0 END) = ${filters.surahIds.length}`,
            );
            params.push(...filters.surahIds);
          }

          if (filters?.hizbIds?.length > 0) {
            sql += `
          LEFT JOIN student_hizbs sh ON s.id = sh.student_id
        `;
            const placeholders = filters.hizbIds.map(() => '?').join(',');
            havingClauses.push(
              `SUM(CASE WHEN sh.hizb_id IN (${placeholders}) THEN 1 ELSE 0 END) = ${filters.hizbIds.length}`,
            );
            params.push(...filters.hizbIds);
          }

          sql += ' WHERE 1=1';

          if (filters?.searchTerm) {
            sql += ' AND (s.name LIKE ? OR s.matricule LIKE ?)';
            params.push(`%${filters.searchTerm}%`, `%${filters.searchTerm}%`);
          }

          if (filters?.genderFilter && filters.genderFilter !== 'all') {
            sql += ' AND s.gender = ?';
            params.push(filters.genderFilter);
          }

          if (filters?.statusFilter && filters.statusFilter !== 'all') {
            sql += ' AND s.status = ?';
            params.push(filters.statusFilter);
          }

          if (filters?.feeCategoryFilter && filters.feeCategoryFilter !== 'all') {
            sql += ' AND s.fee_category = ?';
            params.push(filters.feeCategoryFilter);
          }

          sql += ' GROUP BY s.id';

          if (havingClauses.length > 0) {
            sql += ` HAVING ${havingClauses.join(' AND ')}`;
          }

          sql += ' ORDER BY s.name ASC';

          // First, get the total count without pagination
          let countSql = `
            SELECT COUNT(*) as total
            FROM (
              ${sql.replace('SELECT s.id, s.matricule, s.name, s.date_of_birth, s.enrollment_date, s.status, s.gender, s.fee_category', 'SELECT COUNT(*) as cnt')}
            ) as filtered_students
          `;

          let totalCount = 0;
          if (havingClauses.length > 0) {
            // For HAVING clauses, we need a different approach to count
            const countParams = [...params];
            let baseSql = `
              SELECT COUNT(*) as cnt
              FROM students s
            `;

            if (filters?.surahIds?.length > 0) {
              baseSql += `
                LEFT JOIN student_surahs ss ON s.id = ss.student_id
              `;
            }

            if (filters?.hizbIds?.length > 0) {
              baseSql += `
                LEFT JOIN student_hizbs sh ON s.id = sh.student_id
              `;
            }

            baseSql += ' WHERE 1=1';

            if (filters?.searchTerm) {
              baseSql += ' AND (s.name LIKE ? OR s.matricule LIKE ?)';
              countParams.push(...params.slice(params.length - 2)); // Last 2 params are search terms
            }

            if (filters?.genderFilter && filters.genderFilter !== 'all') {
              baseSql += ' AND s.gender = ?';
              countParams.push(filters.genderFilter);
            }

            if (filters?.statusFilter && filters.statusFilter !== 'all') {
              baseSql += ' AND s.status = ?';
              countParams.push(filters.statusFilter);
            }

            if (filters?.feeCategoryFilter && filters.feeCategoryFilter !== 'all') {
              baseSql += ' AND s.fee_category = ?';
              countParams.push(filters.feeCategoryFilter);
            }

            if (havingClauses.length > 0) {
              baseSql += ` GROUP BY s.id HAVING ${havingClauses.join(' AND ')}`;
              baseSql = `SELECT COUNT(*) as total FROM (${baseSql}) as filtered`;
            }

            const countResult = await db.getQuery(baseSql, countParams);
            totalCount = countResult?.total || countResult?.cnt || 0;
          } else {
            const countResult = await db.getQuery(countSql, params);
            totalCount = countResult?.total || 0;
          }

          let students = await db.allQuery(sql, params);

          // Apply age filtering in JavaScript for accuracy
          if (filters?.minAgeFilter || filters?.maxAgeFilter) {
            const minAge = filters?.minAgeFilter ? parseInt(filters.minAgeFilter, 10) : null;
            const maxAge = filters?.maxAgeFilter ? parseInt(filters.maxAgeFilter, 10) : null;

            const originalCount = students.length;
            students = students.filter((student) => {
              const age = calculateAge(student.date_of_birth);
              if (age === null) return false; // Exclude students without valid birth date

              if (minAge !== null && age < minAge) return false;
              if (maxAge !== null && age > maxAge) return false;

              return true;
            });

            // Adjust total count if age filtering was applied
            if (originalCount !== students.length) {
              totalCount = students.length; // Approximation - perfect count would be complex
            }
          }

          // Apply pagination
          const page = parseInt(filters?.page) || 1;
          const limit = parseInt(filters?.limit) || 25;
          const offset = (page - 1) * limit;
          const paginatedStudents = students.slice(offset, offset + limit);

          return {
            students: paginatedStudents.map(translateStudent),
            total: totalCount,
            page,
            limit,
            totalPages: Math.ceil(totalCount / limit),
          };
        } catch (error) {
          logError('Error in students:get handler:', error);
          throw new Error('فشل في جلب بيانات الطلاب.');
        }
      },
    ),
  );

  /**
   * Retrieves a specific student by their ID.
   * Returns all student fields for detailed view/editing.
   *
   * @param {Object} _event - IPC event object (unused)
   * @param {number} id - The student ID to retrieve
   * @returns {Promise<Object|null>} Complete student object or null if not found
   * @throws {Error} If database query fails
   */
  ipcMain.handle('students:getById', async (_event, id) => {
    try {
      const student = await db.getQuery('SELECT * FROM students WHERE id = ?', [id]);
      if (!student) return null;

      const classes = await db.allQuery(
        `SELECT c.id, c.name FROM classes c
         JOIN class_students cs ON c.id = cs.class_id
         WHERE cs.student_id = ?`,
        [id],
      );

      const surahs = await db.allQuery(
        `SELECT s.id, s.name_ar, s.name_en FROM surahs s
         JOIN student_surahs ss ON s.id = ss.surah_id
         WHERE ss.student_id = ?`,
        [id],
      );

      const hizbs = await db.allQuery(
        `SELECT h.id, h.hizb_number FROM hizbs h
         JOIN student_hizbs sh ON h.id = sh.hizb_id
         WHERE sh.student_id = ?`,
        [id],
      );

      student.classes = classes;
      student.surahs = surahs;
      student.hizbs = hizbs;

      return student;
    } catch (error) {
      logError(`Error fetching student by id ${id}:`, error);
      throw new Error('فشل في جلب بيانات الطالب.');
    }
  });

  /**
   * Adds a new student to the database.
   * Generates a unique matricule, validates data, and optionally assigns to groups.
   * Uses database transactions to ensure data consistency.
   *
   * @param {Object} _event - IPC event object (unused)
   * @param {Object} studentData - Student information to add
   * @param {string} studentData.name - Student's full name (required)
   * @param {string} [studentData.email] - Student's email address
   * @param {string} [studentData.contact_info] - Contact information
   * @param {string} [studentData.parent_name] - Parent/guardian name
   * @param {Array<number>} [studentData.groupIds] - Array of group IDs to assign student to
   * @returns {Promise<Object>} Database result with new student ID
   * @throws {Error} If validation fails or database operation fails
   */
  ipcMain.handle(
    'students:add',
    requireRoles(['Superadmin', 'Administrator'])(async (_event, studentData) => {
      const { groupIds, classIds, surahIds, hizbIds, ...restOfStudentData } = studentData;
      try {
        await db.runQuery('BEGIN TRANSACTION;');

        const matricule = await generateMatricule('student');
        const dataWithMatricule = { ...restOfStudentData, matricule };

        const validatedData = await studentValidationSchema.validateAsync(dataWithMatricule, {
          abortEarly: false,
          stripUnknown: false,
        });

        const fieldsToInsert = studentFields.filter((field) => validatedData[field] !== undefined);
        if (fieldsToInsert.length === 0) throw new Error('No valid fields to insert.');

        const placeholders = fieldsToInsert.map(() => '?').join(', ');
        const params = fieldsToInsert.map((field) => validatedData[field] ?? null);
        const sql = `INSERT INTO students (${fieldsToInsert.join(', ')}) VALUES (${placeholders})`;

        const result = await db.runQuery(sql, params);
        const studentId = result.id;

        if (studentId && groupIds && groupIds.length > 0) {
          const insertGroupSql = 'INSERT INTO student_groups (student_id, group_id) VALUES (?, ?)';
          for (const groupId of groupIds) {
            await db.runQuery(insertGroupSql, [studentId, groupId]);
          }
        }

        if (studentId && classIds && classIds.length > 0) {
          const insertClassSql = 'INSERT INTO class_students (class_id, student_id) VALUES (?, ?)';
          for (const classId of classIds) {
            await db.runQuery(insertClassSql, [classId, studentId]);
          }
        }

        if (studentId && surahIds && surahIds.length > 0) {
          const insertSurahSql = 'INSERT INTO student_surahs (student_id, surah_id) VALUES (?, ?)';
          for (const surahId of surahIds) {
            await db.runQuery(insertSurahSql, [studentId, surahId]);
          }
        }

        if (studentId && hizbIds && hizbIds.length > 0) {
          const insertHizbSql = 'INSERT INTO student_hizbs (student_id, hizb_id) VALUES (?, ?)';
          for (const hizbId of hizbIds) {
            await db.runQuery(insertHizbSql, [studentId, hizbId]);
          }
        }

        await db.runQuery('COMMIT;');

        // Auto-generate charges for new student
        if (
          studentId &&
          validatedData.status === 'active' &&
          (validatedData.fee_category === 'CAN_PAY' || validatedData.fee_category === 'SPONSORED')
        ) {
          const {
            generateAnnualFeeCharges,
            generateMonthlyFeeCharges,
          } = require('./studentFeeHandlers');
          const currentDate = new Date();
          const currentYear = currentDate.getFullYear();
          const currentMonth = currentDate.getMonth() + 1;
          const academicYear =
            currentMonth >= 9
              ? `${currentYear}-${currentYear + 1}`
              : `${currentYear - 1}-${currentYear}`;

          // Generate charges synchronously to ensure they're created
          try {
            await generateAnnualFeeCharges(academicYear, true);
            await generateMonthlyFeeCharges(academicYear, currentMonth, true);
            const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
            const nextAcademicYear =
              currentMonth === 12 ? `${currentYear + 1}-${currentYear + 2}` : academicYear;
            await generateMonthlyFeeCharges(nextAcademicYear, nextMonth, true);
            const monthAfter = nextMonth === 12 ? 1 : nextMonth + 1;
            const monthAfterAcademicYear =
              nextMonth === 12 ? `${currentYear + 2}-${currentYear + 3}` : nextAcademicYear;
            await generateMonthlyFeeCharges(monthAfterAcademicYear, monthAfter, true);
          } catch (err) {
            logError('Failed to auto-generate charges for new student:', err);
          }
        }

        return result;
      } catch (error) {
        await db.runQuery('ROLLBACK;');
        if (error.isJoi)
          throw new Error(`بيانات غير صالحة: ${error.details.map((d) => d.message).join('; ')}`);
        logError('Error in students:add handler:', error);
        throw new Error('حدث خطأ غير متوقع في الخادم.');
      }
    }),
  );

  ipcMain.handle(
    'students:update',
    requireRoles(['Superadmin', 'Administrator'])(async (_event, id, studentData) => {
      const { groupIds, classIds, surahIds, hizbIds, ...restOfStudentData } = studentData;
      try {
        await db.runQuery('BEGIN TRANSACTION;');

        // Get current student data to check for fee_category and discount changes
        const currentStudent = await db.getQuery(
          'SELECT fee_category, status, discount_percentage FROM students WHERE id = ?',
          [id],
        );
        const oldFeeCategory = currentStudent?.fee_category;
        const oldDiscount = currentStudent?.discount_percentage || 0;
        const newDiscount =
          restOfStudentData.discount_percentage !== undefined
            ? restOfStudentData.discount_percentage
            : oldDiscount;

        const validatedData = await studentValidationSchema.validateAsync(restOfStudentData, {
          abortEarly: false,
          stripUnknown: false,
        });

        // Ensure matricule is not updatable
        const fieldsToUpdate = studentFields.filter(
          (field) => field !== 'matricule' && validatedData[field] !== undefined,
        );

        const setClauses = fieldsToUpdate.map((field) => `${field} = ?`).join(', ');
        const params = [...fieldsToUpdate.map((field) => validatedData[field] ?? null), id];
        const sql = `UPDATE students SET ${setClauses} WHERE id = ?`;

        const result = await db.runQuery(sql, params);

        // Update student groups
        await db.runQuery('DELETE FROM student_groups WHERE student_id = ?', [id]);
        if (groupIds && groupIds.length > 0) {
          const insertGroupSql = 'INSERT INTO student_groups (student_id, group_id) VALUES (?, ?)';
          for (const groupId of groupIds) {
            await db.runQuery(insertGroupSql, [id, groupId]);
          }
        }

        // Update student classes
        await db.runQuery('DELETE FROM class_students WHERE student_id = ?', [id]);
        if (classIds && classIds.length > 0) {
          const insertClassSql = 'INSERT INTO class_students (class_id, student_id) VALUES (?, ?)';
          for (const classId of classIds) {
            await db.runQuery(insertClassSql, [classId, id]);
          }
        }

        // Update memorization records
        await db.runQuery('DELETE FROM student_surahs WHERE student_id = ?', [id]);
        if (surahIds && surahIds.length > 0) {
          const insertSurahSql = 'INSERT INTO student_surahs (student_id, surah_id) VALUES (?, ?)';
          for (const surahId of surahIds) {
            await db.runQuery(insertSurahSql, [id, surahId]);
          }
        }

        await db.runQuery('DELETE FROM student_hizbs WHERE student_id = ?', [id]);
        if (hizbIds && hizbIds.length > 0) {
          const insertHizbSql = 'INSERT INTO student_hizbs (student_id, hizb_id) VALUES (?, ?)';
          for (const hizbId of hizbIds) {
            await db.runQuery(insertHizbSql, [id, hizbId]);
          }
        }

        await db.runQuery('COMMIT;');

        // Check if discount changed and regenerate charges
        const discountChanged = oldDiscount !== newDiscount;
        if (
          discountChanged &&
          validatedData.status === 'active' &&
          (validatedData.fee_category === 'CAN_PAY' || validatedData.fee_category === 'SPONSORED')
        ) {
          try {
            const { triggerChargeRegenerationForStudent } = require('./studentFeeHandlers');
            await triggerChargeRegenerationForStudent(id, {
              regenCurrentMonth: true,
              regenNextMonth: false,
            });
          } catch (err) {
            logError('Failed to regenerate charges after discount change:', err);
          }
        }

        // Check if fee_category changed from EXEMPT to CAN_PAY and generate charges
        const newFeeCategory = validatedData.fee_category;
        if (
          oldFeeCategory === 'EXEMPT' &&
          newFeeCategory === 'CAN_PAY' &&
          validatedData.status === 'active'
        ) {
          try {
            const {
              generateAnnualFeeCharges,
              generateMonthlyFeeCharges,
            } = require('./studentFeeHandlers');
            const currentDate = new Date();
            const currentYear = currentDate.getFullYear();
            const currentMonth = currentDate.getMonth() + 1;
            const academicYear =
              currentMonth >= 9
                ? `${currentYear}-${currentYear + 1}`
                : `${currentYear - 1}-${currentYear}`;

            // Generate charges for the student who changed from EXEMPT to CAN_PAY
            await generateAnnualFeeCharges(academicYear, true);
            await generateMonthlyFeeCharges(academicYear, currentMonth, true);
            const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
            const nextAcademicYear =
              currentMonth === 12 ? `${currentYear + 1}-${currentYear + 2}` : academicYear;
            await generateMonthlyFeeCharges(nextAcademicYear, nextMonth, true);
            const monthAfter = nextMonth === 12 ? 1 : nextMonth + 1;
            const monthAfterAcademicYear =
              nextMonth === 12 ? `${currentYear + 2}-${currentYear + 3}` : nextAcademicYear;
            await generateMonthlyFeeCharges(monthAfterAcademicYear, monthAfter, true);
          } catch (err) {
            logError(
              `Failed to auto-generate charges for student ${id} after fee_category change:`,
              err,
            );
            // Don't fail the update operation if charge generation fails
          }
        }

        return result;
      } catch (error) {
        await db.runQuery('ROLLBACK;');
        if (error.isJoi)
          throw new Error(`بيانات غير صالحة: ${error.details.map((d) => d.message).join('; ')}`);
        logError('Error in students:update handler:', error);
        throw new Error('حدث خطأ غير متوقع في الخادم.');
      }
    }),
  );

  ipcMain.handle(
    'students:delete',
    requireRoles(['Superadmin', 'Administrator'])(async (_event, id) => {
      try {
        if (!id || typeof id !== 'number')
          throw new Error('A valid student ID is required for deletion.');
        const sql = 'DELETE FROM students WHERE id = ?';
        return await db.runQuery(sql, [id]);
      } catch (error) {
        logError(`Error deleting student ${id}:`, error);
        throw new Error('فشل حذف الطالب.');
      }
    }),
  );

  ipcMain.handle('surahs:get', async () => {
    try {
      const result = await db.allQuery('SELECT id, name_ar, name_en FROM surahs ORDER BY id');
      return result;
    } catch (error) {
      logError('Error fetching surahs:', error);
      throw new Error('فشل في جلب بيانات السور.');
    }
  });

  ipcMain.handle('hizbs:get', async () => {
    try {
      const result = await db.allQuery('SELECT id, hizb_number FROM hizbs ORDER BY id');
      return result;
    } catch (error) {
      logError('Error fetching hizbs:', error);
      throw new Error('فشل في جلب بيانات الأحزاب.');
    }
  });

  // Get students that match a specific age group (for class enrollment)
  ipcMain.handle('students:getByAgeGroup', async (_event, ageGroupId) => {
    try {
      if (!ageGroupId) {
        return { success: false, message: 'معرف الفئة العمرية غير محدد' };
      }

      // Get the age group details
      const ageGroup = await db.getQuery(
        `SELECT id, name, min_age, max_age, gender, gender_policy
         FROM age_groups
         WHERE id = ? AND is_active = 1`,
        [ageGroupId],
      );

      if (!ageGroup) {
        return { success: false, message: 'فئة عمرية غير موجودة' };
      }

      // Get students that match the age group criteria
      let sql = `
        SELECT s.id, s.name, s.matricule, s.gender, s.date_of_birth, s.status
        FROM students s
        WHERE s.status = 'active'
      `;

      const params = [];

      // We'll calculate age in the application layer since SQLite age calculation can be complex
      const allStudents = await db.allQuery(sql, params);

      // Filter students by age and gender
      const matchingStudents = allStudents.filter((student) => {
        const age = calculateAge(student.date_of_birth);

        // Check age range
        if (age === null) return false; // Skip students without age
        if (age < ageGroup.min_age) return false;
        if (ageGroup.max_age !== null && age > ageGroup.max_age) return false;

        // Check gender compatibility
        if (ageGroup.gender !== 'any') {
          const genderMap = {
            M: 'male_only',
            F: 'female_only',
            male: 'male_only',
            female: 'female_only',
            ذكر: 'male_only',
            أنثى: 'female_only',
          };
          const studentGenderMapped = genderMap[student.gender] || 'any';
          if (ageGroup.gender !== studentGenderMapped) return false;
        }

        return true;
      });

      return {
        success: true,
        ageGroup,
        students: matchingStudents,
        count: matchingStudents.length,
      };
    } catch (error) {
      logError('Error in students:getByAgeGroup handler:', error);
      return { success: false, message: error.message };
    }
  });
}

module.exports = { registerStudentHandlers };
