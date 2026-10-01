const { ipcMain } = require('electron');
const db = require('../../db/db');
const bcrypt = require('bcryptjs');
const { userValidationSchema, userUpdateValidationSchema } = require('../validationSchemas');
const { checkPassword } = require('../passwordPolicy');
const { generateMatricule } = require('../services/matriculeService');
const { error: logError } = require('../logger');
const { requireRoles } = require('../authMiddleware');
const { translateUser } = require('../utils/translations');
const sessionManager = require('../sessionManager');
const { deletedFilter, softDeleteRow, restoreRow } = require('../softDelete');

const LAST_SUPERADMIN_MESSAGE =
  'لا يمكن حذف آخر مدير نظام نشط أو تعطيله أو سحب صلاحيته. أضف مدير نظام آخر أولاً.';

/**
 * True when `userId` is a Superadmin and no other active Superadmin exists. Losing the last
 * one would leave nobody to manage users, and the login screen would offer first-run setup
 * (create a Superadmin) to whoever is at the computer.
 * @param {number} userId
 * @returns {Promise<boolean>}
 */
async function isLastActiveSuperadmin(userId) {
  const target = await db.getQuery(
    `SELECT 1 AS yes FROM user_roles ur JOIN roles r ON r.id = ur.role_id
     WHERE ur.user_id = ? AND r.name = 'Superadmin'`,
    [userId],
  );
  if (!target) return false;
  const others = await db.getQuery(
    `SELECT COUNT(*) AS count FROM users u
     JOIN user_roles ur ON ur.user_id = u.id
     JOIN roles r ON r.id = ur.role_id
     WHERE r.name = 'Superadmin' AND u.id != ? AND (u.status IS NULL OR u.status = 'active')
       AND u.deleted_at IS NULL`,
    [userId],
  );
  return !others || others.count === 0;
}

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
  ipcMain.handle(
    'users:get',
    requireRoles(['Superadmin', 'Administrator', 'FinanceManager'])(async (_event, filters) => {
      let sql = `
      SELECT
        u.id, u.matricule, u.username, u.first_name, u.last_name, u.email, u.status, u.need_guide, u.current_step,
        u.deleted_at, GROUP_CONCAT(r.name) as roles
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      WHERE ${deletedFilter(filters, 'u')}
    `;
      const params = [];

      if (filters?.searchTerm) {
        sql +=
          ' AND (u.username LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ? OR u.matricule LIKE ?)';
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

      // First, get the total count without pagination
      // Grouped per user: the roles join has one row per role.
      let countSql = `SELECT COUNT(*) as total FROM (${sql} GROUP BY u.id) as filtered_users`;
      const countResult = await db.getQuery(countSql, params);
      const totalCount = countResult?.total || 0;

      sql += ' GROUP BY u.id ORDER BY u.username ASC';

      // Apply pagination
      const page = parseInt(filters?.page) || 1;
      const limit = parseInt(filters?.limit) || 25;
      const offset = (page - 1) * limit;

      sql += ' LIMIT ? OFFSET ?';
      params.push(limit, offset);

      const users = await db.allQuery(sql, params);

      return {
        users: users.map(translateUser).map((user) => ({
          ...user,
          roles: user.roles ? user.roles.split(',') : [],
        })),
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit),
      };
    }),
  );

  ipcMain.handle('users:getById', async (_event, id) => {
    const user = await db.getQuery(
      'SELECT id, branch_id, matricule, username, first_name, last_name, date_of_birth, national_id, email, phone_number, occupation, civil_status, employment_type, start_date, end_date, status, notes, need_guide, current_step FROM users WHERE id = ?',
      [id],
    );
    if (user) {
      const roles = await db.allQuery(
        'SELECT r.name FROM roles r JOIN user_roles ur ON r.id = ur.role_id WHERE ur.user_id = ?',
        [id],
      );
      user.roles = roles.map((r) => r.name);
    }
    return user;
  });

  ipcMain.handle(
    'users:add',
    requireRoles(['Superadmin'])(async (_event, userData) => {
      const { roles, ...restOfUserData } = userData;
      try {
        const transactionResult = await db.withTransaction(async () => {
          const matricule = await generateMatricule('user');
          const dataWithMatricule = { ...restOfUserData, matricule, roles };

          const validatedData = await userValidationSchema.validateAsync(dataWithMatricule, {
            abortEarly: false,
            stripUnknown: true,
          });

          if (validatedData.password) {
            validatedData.password = bcrypt.hashSync(validatedData.password, 10);
          }

          // Convert empty email to null for UNIQUE constraint
          if (validatedData.email === '') validatedData.email = null;

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

          return { success: true, id: userId };
        });
        return transactionResult;
      } catch (error) {
        if (error.isJoi) {
          throw new Error(`بيانات غير صالحة: ${error.details.map((d) => d.message).join('; ')}`);
        }
        logError('Error in users:add handler:', error);
        throw new Error(error.message || 'حدث خطأ غير متوقع في الخادم.');
      }
    }),
  );

  ipcMain.handle(
    'users:update',
    requireRoles(['Superadmin'])(async (_event, { id, userData }) => {
      const { roles, ...restOfUserData } = userData;
      try {
        const transactionResult = await db.withTransaction(async () => {
          const validatedData = await userUpdateValidationSchema.validateAsync(restOfUserData, {
            abortEarly: false,
            stripUnknown: true,
          });

          const losesSuperadmin =
            validatedData.status === 'inactive' ||
            (Array.isArray(roles) && !roles.includes('Superadmin'));
          if (losesSuperadmin && (await isLastActiveSuperadmin(id))) {
            throw new Error(LAST_SUPERADMIN_MESSAGE);
          }

          if (validatedData.password) {
            // The schema rule covers length/classes/common; the username rule needs
            // the target account's username, which the payload may not carry (the
            // edit form's username field is read-only).
            const target = await db.getQuery('SELECT username FROM users WHERE id = ?', [id]);
            const policyError = checkPassword(validatedData.password, {
              username: target && target.username,
            });
            if (policyError) throw new Error(policyError);
            validatedData.password = bcrypt.hashSync(validatedData.password, 10);
          } else {
            // If password is empty (e.g. from frontend edit form), don't update it
            delete validatedData.password;
          }

          // Convert empty email to null for UNIQUE constraint
          if (validatedData.email === '') validatedData.email = null;

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
            const currentRolesResult = await db.allQuery(
              'SELECT r.name FROM roles r JOIN user_roles ur ON r.id = ur.role_id WHERE ur.user_id = ?',
              [id],
            );
            const currentRoles = currentRolesResult.map((r) => r.name);

            const rolesToAdd = roles.filter((r) => !currentRoles.includes(r));
            const rolesToRemove = currentRoles.filter((r) => !roles.includes(r));

            if (rolesToAdd.length > 0) {
              const roleIds = await db.allQuery(
                `SELECT id FROM roles WHERE name IN (${rolesToAdd.map(() => '?').join(',')})`,
                rolesToAdd,
              );
              const userRolesSql = 'INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)';
              for (const role of roleIds) {
                await db.runQuery(userRolesSql, [id, role.id]);
              }
            }

            if (rolesToRemove.length > 0) {
              const roleIds = await db.allQuery(
                `SELECT id FROM roles WHERE name IN (${rolesToRemove.map(() => '?').join(',')})`,
                rolesToRemove,
              );
              const deleteSql = `DELETE FROM user_roles WHERE user_id = ? AND role_id IN (${roleIds.map(() => '?').join(',')})`;
              await db.runQuery(deleteSql, [id, ...roleIds.map((r) => r.id)]);
            }
          }

          return { success: true };
        });
        return transactionResult;
      } catch (error) {
        if (error.isJoi) {
          throw new Error(`بيانات غير صالحة: ${error.details.map((d) => d.message).join('; ')}`);
        }
        logError('Error in users:update handler:', error);
        throw new Error(error.message || 'حدث خطأ غير متوقع في الخادم.');
      }
    }),
  );

  ipcMain.handle(
    'users:delete',
    requireRoles(['Superadmin'])(async (event, id) => {
      if (!id || typeof id !== 'number')
        throw new Error('A valid user ID is required for deletion.');
      if (id === sessionManager.getUserIdForEvent(event)) {
        throw new Error('لا يمكنك حذف حسابك الخاص.');
      }
      if (await isLastActiveSuperadmin(id)) {
        throw new Error(LAST_SUPERADMIN_MESSAGE);
      }
      // Soft delete: the user can no longer log in; what they recorded keeps their name.
      const { changes } = await softDeleteRow('users', id, sessionManager.getUserIdForEvent(event));
      return { changes };
    }),
  );

  ipcMain.handle(
    'users:restore',
    requireRoles(['Superadmin'])(async (_event, id) => {
      if (!id || typeof id !== 'number')
        throw new Error('A valid user ID is required for restore.');
      return restoreRow('users', id);
    }),
  );

  // Lightweight handler to update only onboarding-related fields without triggering full user validation
  const getUserIdFromSession = (event) => {
    const senderId = event && event.sender ? event.sender.id : null;
    const session = typeof senderId === 'number' ? sessionManager.getSession(senderId) : null;
    if (!session) {
      throw new Error('Authentication required.');
    }
    return session.userId;
  };

  ipcMain.handle('users:updateGuide', async (event, { id, guideData }) => {
    try {
      void id;
      // Accept numeric strings too (renderer may pass id as string). Coerce to number.
      const numericId = Number(getUserIdFromSession(event));
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
