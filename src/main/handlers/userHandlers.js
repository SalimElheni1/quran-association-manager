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
  'status',
  'notes',
  'need_guide',
  'current_step',
];

function registerUserHandlers() {
  ipcMain.handle('users:get', async (_event, filters) => {
    let sql = `
      SELECT u.id, u.matricule, u.username, u.first_name, u.last_name, u.email, u.status, u.need_guide, u.current_step, r.name as role_name
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
    `;
    const params = [];
    const whereClauses = [];

    if (filters?.searchTerm) {
      whereClauses.push('(u.username LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ? OR u.matricule LIKE ?)');
      const searchTerm = `%${filters.searchTerm}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm);
    }
    if (filters?.statusFilter && filters.statusFilter !== 'all') {
      whereClauses.push('u.status = ?');
      params.push(filters.statusFilter);
    }
    if (filters?.roleFilter && filters.roleFilter !== 'all') {
        sql = `
            SELECT u.id, u.matricule, u.username, u.first_name, u.last_name, u.email, u.status, u.need_guide, u.current_step, r.name as role_name
            FROM users u
            INNER JOIN user_roles ur ON u.id = ur.user_id
            INNER JOIN roles r ON ur.role_id = r.id
            WHERE r.name = ?
        `;
        params.unshift(filters.roleFilter);
    }

    if (whereClauses.length > 0 && !filters.roleFilter) {
        sql += ' WHERE ' + whereClauses.join(' AND ');
    }

    sql += ' ORDER BY u.username ASC';

    const rows = await db.allQuery(sql, params);
    const users = {};
    rows.forEach(row => {
        if (!users[row.id]) {
            users[row.id] = {
                ...row,
                roles: [],
            };
        }
        if (row.role_name) {
            users[row.id].roles.push(row.role_name);
        }
        delete users[row.id].role_name;
    });

    return Object.values(users);
  });

  ipcMain.handle('users:getById', async (_event, id) => {
    const user = await db.getQuery('SELECT * FROM users WHERE id = ?', [id]);
    if (user) {
      const roles = await db.allQuery(
        'SELECT r.name FROM roles r JOIN user_roles ur ON r.id = ur.role_id WHERE ur.user_id = ?',
        [id]
      );
      user.roles = roles.map(r => r.name);
    }
    return user;
  });

  ipcMain.handle('users:add', async (_event, userData) => {
    const { roles, ...restOfUserData } = userData;
    try {
      await db.runQuery('BEGIN TRANSACTION;');

      const matricule = await generateMatricule('user');
      const dataWithMatricule = { ...restOfUserData, matricule };

      const validatedData = await userValidationSchema.validateAsync(dataWithMatricule, {
        abortEarly: false,
        stripUnknown: true,
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
        const roleIds = await db.allQuery(
          `SELECT id FROM roles WHERE name IN (${roles.map(() => '?').join(',')})`,
          roles,
        );
        if (roleIds.length !== roles.length) {
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

      if (roles) {
        const currentRolesResult = await db.allQuery('SELECT r.name FROM roles r JOIN user_roles ur ON r.id = ur.role_id WHERE ur.user_id = ?', [id]);
        const currentRoles = currentRolesResult.map(r => r.name);

        const rolesToAdd = roles.filter(r => !currentRoles.includes(r));
        const rolesToRemove = currentRoles.filter(r => !roles.includes(r));

        if (rolesToAdd.length > 0) {
            const roleIds = await db.allQuery(`SELECT id FROM roles WHERE name IN (${rolesToAdd.map(() => '?').join(',')})`, rolesToAdd);
            const userRolesSql = 'INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)';
            for (const role of roleIds) {
              await db.runQuery(userRolesSql, [id, role.id]);
            }
        }

        if (rolesToRemove.length > 0) {
            const roleIds = await db.allQuery(`SELECT id FROM roles WHERE name IN (${rolesToRemove.map(() => '?').join(',')})`, rolesToRemove);
            const deleteSql = `DELETE FROM user_roles WHERE user_id = ? AND role_id IN (${roleIds.map(() => '?').join(',')})`;
            await db.runQuery(deleteSql, [id, ...roleIds.map(r => r.id)]);
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
