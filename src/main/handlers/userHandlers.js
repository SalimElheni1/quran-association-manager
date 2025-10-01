const { ipcMain } = require('electron');
const db = require('../../db/db');
const bcrypt = require('bcryptjs');
const { userValidationSchema, userUpdateValidationSchema } = require('../validationSchemas');
const { generateMatricule } = require('../matriculeService');
const { error: logError } = require('../logger');

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
  // 'role' is deprecated and managed in user_roles table
  'status',
  'notes',
  'need_guide',
  'current_step',
];

function registerUserHandlers() {
  ipcMain.handle('users:get', async (_event, filters) => {
    let sql = `
      SELECT
        u.id, u.matricule, u.username, u.first_name, u.last_name, u.email, u.status, u.need_guide, u.current_step,
        GROUP_CONCAT(r.name) as roles
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE 1=1
    `;
    const params = [];
    if (filters?.searchTerm) {
      sql += ' AND (u.username LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ? OR u.matricule LIKE ?)';
      const searchTerm = `%${filters.searchTerm}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }
    if (filters?.statusFilter && filters.statusFilter !== 'all') {
      sql += ' AND u.status = ?';
      params.push(filters.statusFilter);
    }

    if (filters?.roleFilter && filters.roleFilter !== 'all') {
      sql += `
        AND u.id IN (
          SELECT ur.user_id FROM user_roles ur
          JOIN roles r ON ur.role_id = r.id
          WHERE r.name = ?
        )
      `;
      params.push(filters.roleFilter);
    }

    sql += ' GROUP BY u.id ORDER BY u.username ASC';
    const users = await db.allQuery(sql, params);

    return users.map((user) => ({
      ...user,
      roles: user.roles ? user.roles.split(',') : [],
    }));
  });

  ipcMain.handle('users:getById', async (_event, id) => {
    const userQuery = `
      SELECT
        u.*,
        GROUP_CONCAT(r.name) as roles
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE u.id = ?
      GROUP BY u.id
    `;
    const user = await db.getQuery(userQuery, [id]);
    if (user) {
      user.roles = user.roles ? user.roles.split(',') : [];
    }
    return user;
  });

  ipcMain.handle('users:add', async (_event, userData) => {
    // The roles are expected to be an array of role names, e.g., ['Administrator', 'FinanceManager']
    const { roles, ...restOfUserData } = userData;

    try {
      await db.runQuery('BEGIN TRANSACTION;');

      const matricule = await generateMatricule('user');
      const dataWithMatricule = { ...restOfUserData, matricule };

      const validatedData = await userValidationSchema.validateAsync(dataWithMatricule, {
        abortEarly: false,
        stripUnknown: true, // Use stripUnknown to remove fields not in schema
      });

      if (validatedData.password) {
        validatedData.password = bcrypt.hashSync(validatedData.password, 10);
      }

      const fieldsToInsert = userFields.filter((field) => validatedData[field] !== undefined);
      if (fieldsToInsert.length === 0) throw new Error('No valid user fields to insert.');

      const placeholders = fieldsToInsert.map(() => '?').join(', ');
      const params = fieldsToInsert.map((field) => validatedData[field] ?? null);
      const sql = `INSERT INTO users (${fieldsToInsert.join(', ')}) VALUES (${placeholders})`;

      const result = await db.runQuery(sql, params);
      const userId = result.id;

      if (roles && roles.length > 0) {
        // Get role IDs from role names
        const roleIds = await db.allQuery(
          `SELECT id FROM roles WHERE name IN (${roles.map(() => '?').join(',')})`,
          roles,
        );

        if (roleIds.length !== roles.length) {
          await db.runQuery('ROLLBACK;');
          throw new Error('One or more roles are invalid.');
        }

        const userRolesSql = 'INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)';
        for (const role of roleIds) {
          await db.runQuery(userRolesSql, [userId, role.id]);
        }
      }

      await db.runQuery('COMMIT;');
      return { success: true, id: userId };
    } catch (error) {
      await db.runQuery('ROLLBACK;');
      if (error.isJoi) {
        throw new Error(`بيانات غير صالحة: ${error.details.map((d) => d.message).join('; ')}`);
      }
      logError('Error in users:add handler:', error);
      throw new Error(error.message || 'حدث خطأ غير متوقع في الخادم.');
    }
  });

  ipcMain.handle('users:update', async (_event, { id, userData }) => {
    const { roles, ...restOfUserData } = userData;

    try {
      await db.runQuery('BEGIN TRANSACTION;');

      const validatedData = await userUpdateValidationSchema.validateAsync(restOfUserData, {
        abortEarly: false,
        stripUnknown: true,
      });

      if (validatedData.password) {
        validatedData.password = bcrypt.hashSync(validatedData.password, 10);
      }

      const fieldsToUpdate = userFields.filter(
        (field) => field !== 'matricule' && validatedData[field] !== undefined,
      );

      if (fieldsToUpdate.length > 0) {
        const setClauses = fieldsToUpdate.map((field) => `${field} = ?`).join(', ');
        const params = [...fieldsToUpdate.map((field) => validatedData[field] ?? null), id];
        const sql = `UPDATE users SET ${setClauses} WHERE id = ?`;
        await db.runQuery(sql, params);
      }

      // Synchronize roles
      if (roles) {
        // 1. Delete existing roles for the user
        await db.runQuery('DELETE FROM user_roles WHERE user_id = ?', [id]);

        // 2. Insert new roles if any
        if (roles.length > 0) {
          const roleIds = await db.allQuery(
            `SELECT id FROM roles WHERE name IN (${roles.map(() => '?').join(',')})`,
            roles,
          );

          if (roleIds.length !== roles.length) {
            await db.runQuery('ROLLBACK;');
            throw new Error('One or more roles are invalid.');
          }

          const userRolesSql = 'INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)';
          for (const role of roleIds) {
            await db.runQuery(userRolesSql, [id, role.id]);
          }
        }
      }

      await db.runQuery('COMMIT;');
      return { success: true };
    } catch (error) {
      await db.runQuery('ROLLBACK;');
      if (error.isJoi) {
        throw new Error(`بيانات غير صالحة: ${error.details.map((d) => d.message).join('; ')}`);
      }
      logError('Error in users:update handler:', error);
      throw new Error(error.message || 'حدث خطأ غير متوقع في الخادم.');
    }
  });

  ipcMain.handle('users:delete', (_event, id) => {
    if (!id || typeof id !== 'number') throw new Error('A valid user ID is required for deletion.');
    const sql = 'DELETE FROM users WHERE id = ?';
    return db.runQuery(sql, [id]);
  });

  // Lightweight handler to update only onboarding-related fields without triggering full user validation
  ipcMain.handle('users:updateGuide', async (_event, { id, guideData }) => {
    try {
      // Accept numeric strings too (renderer may pass id as string). Coerce to number.
      const numericId = Number(id);
      if (!numericId || Number.isNaN(numericId)) throw new Error('A valid user ID is required.');
      const allowed = {};
      if (guideData.need_guide !== undefined) allowed.need_guide = guideData.need_guide ? 1 : 0;
      if (guideData.current_step !== undefined) {
        const n = Number(guideData.current_step);
        allowed.current_step = Number.isFinite(n) ? n : 0;
      }

      const fields = Object.keys(allowed);
      if (fields.length === 0) return { success: true, message: 'No guide fields to update.' };

      const setClauses = fields.map((f) => `${f} = ?`).join(', ');
      const params = [...fields.map((f) => allowed[f]), numericId];
      const sql = `UPDATE users SET ${setClauses} WHERE id = ?`;
      await db.runQuery(sql, params);
      return { success: true };
    } catch (error) {
      logError('Error in users:updateGuide handler:', error);
      return { success: false, message: error.message || 'Failed to update guide fields.' };
    }
  });
}

module.exports = { registerUserHandlers };
