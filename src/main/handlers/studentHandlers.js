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
  'memorization_level', // Current Quran memorization level
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
  'financial_assistance_notes', // Financial aid information
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
   *
   * @param {Object} _event - IPC event object (unused)
   * @param {Object} [filters] - Optional filters for student search
   * @param {string} [filters.searchTerm] - Search term for name or matricule
   * @param {string} [filters.genderFilter] - Gender filter ('male', 'female', 'all')
   * @param {number} [filters.minAgeFilter] - Minimum age filter
   * @param {number} [filters.maxAgeFilter] - Maximum age filter
   * @returns {Promise<Array>} Array of student objects with basic information
   * @throws {Error} If database query fails
   */
  ipcMain.handle('students:get', requireRoles(['Superadmin', 'Administrator', 'FinanceManager', 'SessionSupervisor'])(async (_event, filters) => {
    try {
      // Apply fast SQL filters (search and gender)
      let sql =
        'SELECT id, matricule, name, date_of_birth, enrollment_date, status, gender FROM students WHERE 1=1';
      const params = [];

      if (filters?.searchTerm) {
        sql += ' AND (name LIKE ? OR matricule LIKE ?)';
        params.push(`%${filters.searchTerm}%`, `%${filters.searchTerm}%`);
      }

      if (filters?.genderFilter && filters.genderFilter !== 'all') {
        sql += ' AND gender = ?';
        params.push(filters.genderFilter);
      }

      sql += ' ORDER BY name ASC';
      let students = await db.allQuery(sql, params);

      // Apply age filtering in JavaScript for accuracy
      if (filters?.minAgeFilter || filters?.maxAgeFilter) {
        const minAge = filters?.minAgeFilter ? parseInt(filters.minAgeFilter, 10) : null;
        const maxAge = filters?.maxAgeFilter ? parseInt(filters.maxAgeFilter, 10) : null;

        students = students.filter((student) => {
          const age = calculateAge(student.date_of_birth);
          if (age === null) return false; // Exclude students without valid birth date

          if (minAge !== null && age < minAge) return false;
          if (maxAge !== null && age > maxAge) return false;

          return true;
        });
      }

      return students;
    } catch (error) {
      logError('Error in students:get handler:', error);
      throw new Error('فشل في جلب بيانات الطلاب.');
    }
  }));

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
      return await db.getQuery('SELECT * FROM students WHERE id = ?', [id]);
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
  ipcMain.handle('students:add', requireRoles(['Superadmin', 'Administrator'])(async (_event, studentData) => {
    const { groupIds, ...restOfStudentData } = studentData;
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

      await db.runQuery('COMMIT;');
      return result;
    } catch (error) {
      await db.runQuery('ROLLBACK;');
      if (error.isJoi)
        throw new Error(`بيانات غير صالحة: ${error.details.map((d) => d.message).join('; ')}`);
      logError('Error in students:add handler:', error);
      throw new Error('حدث خطأ غير متوقع في الخادم.');
    }
  }));

  ipcMain.handle('students:update', requireRoles(['Superadmin', 'Administrator'])(async (_event, id, studentData) => {
    const { groupIds, ...restOfStudentData } = studentData;
    try {
      await db.runQuery('BEGIN TRANSACTION;');

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
      // 1. Delete existing group assignments
      await db.runQuery('DELETE FROM student_groups WHERE student_id = ?', [id]);

      // 2. Add new group assignments
      if (groupIds && groupIds.length > 0) {
        const insertGroupSql = 'INSERT INTO student_groups (student_id, group_id) VALUES (?, ?)';
        for (const groupId of groupIds) {
          await db.runQuery(insertGroupSql, [id, groupId]);
        }
      }

      await db.runQuery('COMMIT;');
      return result;
    } catch (error) {
      await db.runQuery('ROLLBACK;');
      if (error.isJoi)
        throw new Error(`بيانات غير صالحة: ${error.details.map((d) => d.message).join('; ')}`);
      logError('Error in students:update handler:', error);
      throw new Error('حدث خطأ غير متوقع في الخادم.');
    }
  }));

  ipcMain.handle('students:delete', requireRoles(['Superadmin', 'Administrator'])(async (_event, id) => {
    try {
      if (!id || typeof id !== 'number')
        throw new Error('A valid student ID is required for deletion.');
      const sql = 'DELETE FROM students WHERE id = ?';
      return await db.runQuery(sql, [id]);
    } catch (error) {
      logError(`Error deleting student ${id}:`, error);
      throw new Error('فشل حذف الطالب.');
    }
  }));
}

module.exports = { registerStudentHandlers };
