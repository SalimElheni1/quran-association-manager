const { ipcMain } = require('electron');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../../db/db');
const { userUpdateValidationSchema } = require('../validationSchemas');
const Joi = require('joi'); // Keep Joi for the complex password confirmation
const { refreshSettings } = require('../settingsManager');

const profileUpdateValidationSchema = userUpdateValidationSchema
  .keys({
    current_password: Joi.string().allow(null, ''),
    new_password: Joi.string().min(8).allow(null, ''),
    confirm_new_password: Joi.any()
      .valid(Joi.ref('new_password'))
      .when('new_password', {
        is: Joi.exist(),
        then: Joi.required(),
      })
      .messages({
        'any.only': 'كلمة المرور الجديدة غير متطابقة',
        'any.required': 'يجب تأكيد كلمة المرور الجديدة',
      }),
  })
  .with('new_password', 'current_password');

const getUserIdFromToken = (token) => {
  if (!token) {
    throw new Error('Authentication token not provided.');
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded.id;
  } catch (error) {
    throw new Error('Invalid or expired authentication token.');
  }
};

const getProfileHandler = async (token) => {
  const userId = getUserIdFromToken(token);
  const userProfile = await db.getQuery(
    'SELECT id, username, first_name, last_name, date_of_birth, national_id, email, phone_number, occupation, civil_status, employment_type, start_date, end_date, role, status, notes, branch_id FROM users WHERE id = ?',
    [userId],
  );
  if (!userProfile) {
    throw new Error('User profile not found.');
  }
  return { success: true, profile: userProfile };
};

const updateProfileHandler = async (token, profileData) => {
  const userId = getUserIdFromToken(token);

  const validatedData = await profileUpdateValidationSchema.validateAsync(profileData, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (validatedData.new_password) {
    const currentUser = await db.getQuery('SELECT password FROM users WHERE id = ?', [userId]);
    if (!currentUser) {
      throw new Error('User not found.');
    }
    const isMatch = await bcrypt.compare(validatedData.current_password, currentUser.password);
    if (!isMatch) {
      throw new Error('كلمة المرور الحالية غير صحيحة.');
    }
    validatedData.password = await bcrypt.hash(validatedData.new_password, 10);
  }

  const fieldsToExclude = [
    'id',
    'username',
    'role',
    'current_password',
    'new_password',
    'confirm_new_password',
  ];
  const fieldsToUpdate = Object.keys(validatedData).filter(
    (field) => !fieldsToExclude.includes(field) && validatedData[field] !== undefined,
  );

  if (fieldsToUpdate.length === 0) {
    return { success: true, message: 'لم يتم تحديث أي بيانات.' };
  }

  const setClauses = fieldsToUpdate.map((field) => `${field} = ?`).join(', ');
  const params = [...fieldsToUpdate.map((field) => validatedData[field] ?? null), userId];

  const sql = `UPDATE users SET ${setClauses} WHERE id = ?`;
  await db.runQuery(sql, params);

  return { success: true, message: 'تم تحديث الملف الشخصي بنجاح.' };
};

function registerAuthHandlers() {
  ipcMain.handle('auth:login', async (_event, { username, password }) => {
    console.log(`[AUTH_LOG] Login attempt for user: ${username}`);
    try {
      console.log('[AUTH_LOG] Step 1: Initializing database...');
      await db.initializeDatabase(password);
      console.log('[AUTH_LOG] Step 1 complete. Database initialization returned.');

      console.log('[AUTH_LOG] Step 2: Finding user...');
      const user = await db.getQuery('SELECT * FROM users WHERE username = ?', [username]);
      console.log(`[AUTH_LOG] Step 2 complete. User found: ${!!user}`);

      if (!user) {
        console.log('[AUTH_LOG] Login failure: User not found.');
        return { success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
      }

      console.log('[AUTH_LOG] Step 3: Comparing password hash...');
      const isMatch = await bcrypt.compare(password, user.password);
      console.log(`[AUTH_LOG] Step 3 complete. Password match: ${isMatch}`);

      if (!isMatch) {
        console.log('[AUTH_LOG] Login failure: Password does not match.');
        return { success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
      }

      console.log('[AUTH_LOG] Step 4: Login success. Refreshing settings and generating token...');
      await refreshSettings();
      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '8h' },
      );
      console.log('[AUTH_LOG] Step 4 complete. Token generated.');
      return {
        success: true,
        token,
        user: { id: user.id, username: user.username, role: user.role },
      };
    } catch (error) {
      console.error('[AUTH_LOG] ERROR in auth:login handler:', error.message);
      // Only close the database for truly critical, non-recoverable errors.
      // An incorrect password is a recoverable failure, and we want to keep the DB object
      // (even if the connection failed) for the next attempt.
      if (error.message !== 'Incorrect password or corrupt database.') {
        console.log('[AUTH_LOG] Closing database due to unexpected error.');
        await db.closeDatabase();
      }
      return { success: false, message: error.message || 'حدث خطأ غير متوقع في الخادم.' };
    }
  });

  ipcMain.handle('auth:getProfile', async (_event, { token }) => {
    try {
      return await getProfileHandler(token);
    } catch (error) {
      console.error('Error in auth:getProfile IPC wrapper:', error);
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('auth:updateProfile', async (_event, { token, profileData }) => {
    try {
      return await updateProfileHandler(token, profileData);
    } catch (error) {
      console.error('Error in auth:updateProfile IPC wrapper:', error);
      if (error.isJoi) {
        const messages = error.details.map((d) => d.message).join('; ');
        return { success: false, message: `بيانات غير صالحة: ${messages}` };
      }
      return { success: false, message: error.message || 'حدث خطأ غير متوقع في الخادم.' };
    }
  });
}

module.exports = {
  registerAuthHandlers,
};
