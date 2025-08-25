const { ipcMain } = require('electron');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const { getAppRoot } = require('../app-path');

const db = require(path.join(getAppRoot(), 'src', 'db', 'db.js'));
const { userUpdateValidationSchema } = require(path.join(getAppRoot(), 'src', 'main', 'validationSchemas.js'));
const Joi = require('joi'); // Keep Joi for the complex password confirmation
const { refreshSettings } = require(path.join(getAppRoot(), 'src', 'main', 'settingsManager.js'));


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
    try {
      await db.initializeDatabase(password);
      const user = await db.getQuery('SELECT * FROM users WHERE username = ?', [username]);
      if (!user) {
        return { success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
      }
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return { success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
      }
      await refreshSettings();
      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '8h' },
      );
      return {
        success: true,
        token,
        user: { id: user.id, username: user.username, role: user.role },
      };
    } catch (error) {
      console.error('Error in auth:login handler:', error.message);
      if (error.message !== 'Incorrect password or corrupt database.') {
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
