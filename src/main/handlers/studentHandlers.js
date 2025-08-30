import { ipcMain } from 'electron';
import * as db from '@db/db';
import { studentValidationSchema } from '@main/validationSchemas';
import { generateMatricule } from '@main/matriculeService';
import { error as logError } from '@main/logger';

const studentFields = [
  'matricule',
  'name',
  'date_of_birth',
  'gender',
  'address',
  'contact_info',
  'email',
  'status',
  'memorization_level',
  'notes',
  'parent_name',
  'guardian_relation',
  'parent_contact',
  'guardian_email',
  'emergency_contact_name',
  'emergency_contact_phone',
  'health_conditions',
  'national_id',
  'school_name',
  'grade_level',
  'educational_level',
  'occupation',
  'civil_status',
  'related_family_members',
  'financial_assistance_notes',
];

export function registerStudentHandlers() {
  ipcMain.handle('students:get', async (_event, filters) => {
    try {
      let sql =
        'SELECT id, matricule, name, date_of_birth, enrollment_date, status FROM students WHERE 1=1';
      const params = [];
      if (filters?.searchTerm) {
        sql += ' AND (name LIKE ? OR matricule LIKE ?)';
        params.push(`%${filters.searchTerm}%`, `%${filters.searchTerm}%`);
      }
      if (filters?.genderFilter && filters.genderFilter !== 'all') {
        sql += ' AND gender = ?';
        params.push(filters.genderFilter);
      }
      const today = new Date();
      if (filters?.minAgeFilter) {
        const minAgeBirthYear = today.getFullYear() - parseInt(filters.minAgeFilter, 10);
        sql += ` AND SUBSTR(date_of_birth, 1, 4) <= ?`;
        params.push(minAgeBirthYear.toString());
      }
      if (filters?.maxAgeFilter) {
        const maxAgeBirthYear = today.getFullYear() - parseInt(filters.maxAgeFilter, 10) - 1;
        sql += ` AND SUBSTR(date_of_birth, 1, 4) >= ?`;
        params.push(maxAgeBirthYear.toString());
      }
      sql += ' ORDER BY name ASC';
      return await db.allQuery(sql, params);
    } catch (error) {
      logError('Error in students:get handler:', error);
      throw new Error('فشل في جلب بيانات الطلاب.');
    }
  });

  ipcMain.handle('students:getById', async (_event, id) => {
    try {
      return await db.getQuery('SELECT * FROM students WHERE id = ?', [id]);
    } catch (error) {
      logError(`Error fetching student by id ${id}:`, error);
      throw new Error('فشل في جلب بيانات الطالب.');
    }
  });

  ipcMain.handle('students:add', async (_event, studentData) => {
    try {
      const matricule = await generateMatricule('student');
      const dataWithMatricule = { ...studentData, matricule };

      const validatedData = await studentValidationSchema.validateAsync(dataWithMatricule, {
        abortEarly: false,
        stripUnknown: false,
      });

      const fieldsToInsert = studentFields.filter((field) => validatedData[field] !== undefined);
      if (fieldsToInsert.length === 0) throw new Error('No valid fields to insert.');

      const placeholders = fieldsToInsert.map(() => '?').join(', ');
      const params = fieldsToInsert.map((field) => validatedData[field] ?? null);
      const sql = `INSERT INTO students (${fieldsToInsert.join(', ')}) VALUES (${placeholders})`;
      return await db.runQuery(sql, params);
    } catch (error) {
      if (error.isJoi)
        throw new Error(`بيانات غير صالحة: ${error.details.map((d) => d.message).join('; ')}`);
      logError('Error in students:add handler:', error);
      throw new Error('حدث خطأ غير متوقع في الخادم.');
    }
  });

  ipcMain.handle('students:update', async (_event, id, studentData) => {
    try {
      const validatedData = await studentValidationSchema.validateAsync(studentData, {
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
      return await db.runQuery(sql, params);
    } catch (error) {
      if (error.isJoi)
        throw new Error(`بيانات غير صالحة: ${error.details.map((d) => d.message).join('; ')}`);
      logError('Error in students:update handler:', error);
      throw new Error('حدث خطأ غير متوقع في الخادم.');
    }
  });

  ipcMain.handle('students:delete', async (_event, id) => {
    try {
      if (!id || typeof id !== 'number')
        throw new Error('A valid student ID is required for deletion.');
      const sql = 'DELETE FROM students WHERE id = ?';
      return await db.runQuery(sql, [id]);
    } catch (error) {
      logError(`Error deleting student ${id}:`, error);
      throw new Error('فشل حذف الطالب.');
    }
  });
}
