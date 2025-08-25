const path = require('path');
const { ipcMain } = require('electron');
const db = require(path.join(__dirname, '..', '..', 'db', 'db'));
const { teacherValidationSchema } = require(path.join(__dirname, '..', 'validationSchemas'));
const { generateMatricule } = require(path.join(__dirname, '..', 'matriculeService'));

const teacherFields = [
  'matricule',
  'name',
  'national_id',
  'contact_info',
  'email',
  'address',
  'date_of_birth',
  'gender',
  'educational_level',
  'specialization',
  'years_of_experience',
  'availability',
  'notes',
];

function registerTeacherHandlers() {
  ipcMain.handle('teachers:add', async (_event, teacherData) => {
    try {
      const matricule = await generateMatricule('teacher');
      const dataWithMatricule = { ...teacherData, matricule };

      const validatedData = await teacherValidationSchema.validateAsync(dataWithMatricule, {
        abortEarly: false,
        stripUnknown: false,
      });
      const fieldsToInsert = teacherFields.filter((field) => validatedData[field] !== undefined);
      if (fieldsToInsert.length === 0) throw new Error('No valid fields to insert.');
      const placeholders = fieldsToInsert.map(() => '?').join(', ');
      const params = fieldsToInsert.map((field) => validatedData[field] ?? null);
      const sql = `INSERT INTO teachers (${fieldsToInsert.join(', ')}) VALUES (${placeholders})`;
      return await db.runQuery(sql, params);
    } catch (error) {
      if (error.isJoi)
        throw new Error(`بيانات غير صالحة: ${error.details.map((d) => d.message).join('; ')}`);
      console.error('Error in teachers:add handler:', error);
      throw new Error('حدث خطأ غير متوقع في الخادم.');
    }
  });

  ipcMain.handle('teachers:update', async (_event, id, teacherData) => {
    try {
      const validatedData = await teacherValidationSchema.validateAsync(teacherData, {
        abortEarly: false,
        stripUnknown: false,
      });
      const fieldsToUpdate = teacherFields.filter(
        (field) => field !== 'matricule' && validatedData[field] !== undefined,
      );
      const setClauses = fieldsToUpdate.map((field) => `${field} = ?`).join(', ');
      const params = [...fieldsToUpdate.map((field) => validatedData[field] ?? null), id];
      const sql = `UPDATE teachers SET ${setClauses} WHERE id = ?`;
      return await db.runQuery(sql, params);
    } catch (error) {
      if (error.isJoi)
        throw new Error(`بيانات غير صالحة: ${error.details.map((d) => d.message).join('; ')}`);
      console.error('Error in teachers:update handler:', error);
      throw new Error('حدث خطأ غير متوقع في الخادم.');
    }
  });

  ipcMain.handle('teachers:delete', async (_event, id) => {
    try {
      if (!id || typeof id !== 'number')
        throw new Error('A valid teacher ID is required for deletion.');
      const sql = 'DELETE FROM teachers WHERE id = ?';
      return await db.runQuery(sql, [id]);
    } catch (error) {
      console.error(`Error deleting teacher ${id}:`, error);
      throw new Error('فشل حذف المعلم.');
    }
  });

  ipcMain.handle('teachers:get', async (_event, filters) => {
    try {
      let sql =
        'SELECT id, matricule, name, contact_info, specialization, gender FROM teachers WHERE 1=1';
      const params = [];
      if (filters?.searchTerm) {
        sql += ' AND (name LIKE ? OR matricule LIKE ?)';
        params.push(`%${filters.searchTerm}%`, `%${filters.searchTerm}%`);
      }
      if (filters?.genderFilter && filters.genderFilter !== 'all') {
        sql += ' AND gender = ?';
        params.push(filters.genderFilter);
      }
      if (filters?.specializationFilter) {
        sql += ' AND specialization LIKE ?';
        params.push(`%${filters.specializationFilter}%`);
      }
      sql += ' ORDER BY name ASC';
      return await db.allQuery(sql, params);
    } catch (error) {
      console.error('Error in teachers:get handler:', error);
      throw new Error('فشل في جلب بيانات المعلمين.');
    }
  });

  ipcMain.handle('teachers:getById', async (_event, id) => {
    try {
      return await db.getQuery('SELECT * FROM teachers WHERE id = ?', [id]);
    } catch (error) {
      console.error(`Error fetching teacher by id ${id}:`, error);
      throw new Error('فشل في جلب بيانات المعلم.');
    }
  });
}

module.exports = { registerTeacherHandlers };
