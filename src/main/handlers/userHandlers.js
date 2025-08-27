const { ipcMain } = require('electron');
const db = require('../../db/db');
const bcrypt = require('bcryptjs');
const { userValidationSchema, userUpdateValidationSchema } = require('../validationSchemas');
const { generateMatricule } = require('../matriculeService');
const { log, error: logError } = require('../logger');

const userFields = [
  'matricule',
  'username',
  'password',
  'first_name',
  'last_name',
  'date_of_birth',
  'national_id',
  'email',
  'phone_number',
  'occupation',
  'civil_status',
  'employment_type',
  'start_date',
  'end_date',
  'role',
  'status',
  'notes',
];

function registerUserHandlers() {
  ipcMain.handle('users:get', async (_event, filters) => {
    let sql =
      'SELECT id, matricule, username, first_name, last_name, email, role, status FROM users WHERE 1=1';
    const params = [];
    if (filters?.searchTerm) {
      sql += ' AND (username LIKE ? OR first_name LIKE ? OR last_name LIKE ? OR matricule LIKE ?)';
      const searchTerm = `%${filters.searchTerm}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }
    if (filters?.roleFilter && filters.roleFilter !== 'all') {
      sql += ' AND role = ?';
      params.push(filters.roleFilter);
    }
    if (filters?.statusFilter && filters.statusFilter !== 'all') {
      sql += ' AND status = ?';
      params.push(filters.statusFilter);
    }
    sql += ' ORDER BY username ASC';
    return db.allQuery(sql, params);
  });

  ipcMain.handle('users:getById', (_event, id) => {
    return db.getQuery('SELECT * FROM users WHERE id = ?', [id]);
  });

  ipcMain.handle('users:add', async (_event, userData) => {
    try {
      const matricule = await generateMatricule('user');
      const dataWithMatricule = { ...userData, matricule };

      const validatedData = await userValidationSchema.validateAsync(dataWithMatricule, {
        abortEarly: false,
        stripUnknown: false,
      });
      if (validatedData.password) {
        validatedData.password = bcrypt.hashSync(validatedData.password, 10);
      }
      const fieldsToInsert = userFields.filter((field) => validatedData[field] !== undefined);
      if (fieldsToInsert.length === 0) throw new Error('No valid fields to insert.');
      const placeholders = fieldsToInsert.map(() => '?').join(', ');
      const params = fieldsToInsert.map((field) => validatedData[field] ?? null);
      const sql = `INSERT INTO users (${fieldsToInsert.join(', ')}) VALUES (${placeholders})`;
      return db.runQuery(sql, params);
    } catch (error) {
      if (error.isJoi)
        throw new Error(`بيانات غير صالحة: ${error.details.map((d) => d.message).join('; ')}`);
      logError('Error in users:add handler:', error);
      throw new Error('حدث خطأ غير متوقع في الخادم.');
    }
  });

  ipcMain.handle('users:update', async (_event, { id, userData }) => {
    try {
      const validatedData = await userUpdateValidationSchema.validateAsync(userData, {
        abortEarly: false,
        stripUnknown: false,
      });
      if (validatedData.password) {
        validatedData.password = bcrypt.hashSync(validatedData.password, 10);
      }
      const fieldsToUpdate = userFields.filter(
        (field) => field !== 'matricule' && validatedData[field] !== undefined,
      );
      const setClauses = fieldsToUpdate.map((field) => `${field} = ?`).join(', ');
      const params = [...fieldsToUpdate.map((field) => validatedData[field] ?? null), id];
      const sql = `UPDATE users SET ${setClauses} WHERE id = ?`;
      return db.runQuery(sql, params);
    } catch (error) {
      if (error.isJoi)
        throw new Error(`بيانات غير صالحة: ${error.details.map((d) => d.message).join('; ')}`);
      logError('Error in users:update handler:', error);
      throw new Error('حدث خطأ غير متوقع في الخادم.');
    }
  });

  ipcMain.handle('users:delete', (_event, id) => {
    if (!id || typeof id !== 'number') throw new Error('A valid user ID is required for deletion.');
    const sql = 'DELETE FROM users WHERE id = ?';
    return db.runQuery(sql, [id]);
  });
}

module.exports = { registerUserHandlers };
