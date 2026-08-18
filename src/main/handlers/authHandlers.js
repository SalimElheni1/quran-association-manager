const { ipcMain } = require('electron');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Store = require('electron-store');
const db = require('../../db/db');
const sessionManager = require('../sessionManager');
const {
  userUpdateValidationSchema,
  passwordUpdateValidationSchema,
} = require('../validationSchemas');
const Joi = require('joi'); // Keep Joi for the complex password confirmation
const { refreshSettings } = require('../settingsManager');
const { internalGetSettingsHandler } = require('./settingsHandlers');
const { error: logError } = require('../logger');

let authStore = null;
const getAuthStore = () => {
  if (!authStore) authStore = new Store();
  return authStore;
};

const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCK_DURATION_MS = 5 * 60 * 1000;

const getLoginLockoutState = () => getAuthStore().get('login_lockout') || null;

const getRemainingLockMinutes = (lockedUntil) =>
  Math.max(1, Math.ceil((lockedUntil - Date.now()) / 60000));

const recordFailedLoginAttempt = () => {
  const now = Date.now();
  const prev = getLoginLockoutState() || {};
  const windowExpired = now - (prev.lastFailAt || 0) > LOGIN_LOCK_DURATION_MS;
  const failCount = windowExpired ? 1 : (prev.failCount || 0) + 1;
  const state = { failCount, lastFailAt: now, lockedUntil: null };
  if (failCount >= MAX_LOGIN_ATTEMPTS) {
    state.lockedUntil = now + LOGIN_LOCK_DURATION_MS;
  }
  getAuthStore().set('login_lockout', state);
  return state;
};

const clearLoginLockout = () => {
  getAuthStore().delete('login_lockout');
};

const profileUpdateValidationSchema = userUpdateValidationSchema
  .keys({
    current_password: Joi.string().allow(null, ''),
    new_password: Joi.string().min(6).allow(null, ''),
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

const getUserIdFromSession = (event) => {
  const senderId = event && event.sender ? event.sender.id : null;
  const session = typeof senderId === 'number' ? sessionManager.getSession(senderId) : null;
  if (!session) {
    throw new Error('Authentication required.');
  }
  return session.userId;
};

const getProfileHandler = async (userId) => {
  const userProfile = await db.getQuery(
    'SELECT id, username, first_name, last_name, date_of_birth, national_id, email, phone_number, occupation, civil_status, employment_type, start_date, end_date, status, notes, branch_id, need_guide, current_step FROM users WHERE id = ?',
    [userId],
  );

  if (!userProfile) {
    throw new Error('User profile not found.');
  }

  const roles = await db.allQuery(
    'SELECT r.name FROM roles r JOIN user_roles ur ON r.id = ur.role_id WHERE ur.user_id = ?',
    [userId],
  );
  userProfile.roles = roles.map((r) => r.name);

  // Normalize onboarding fields for the renderer: return boolean for need_guide and integer for current_step
  try {
    userProfile.need_guide = !!userProfile.need_guide;
  } catch (e) {
    userProfile.need_guide = false;
  }
  try {
    userProfile.current_step = Number(userProfile.current_step) || 0;
  } catch (e) {
    userProfile.current_step = 0;
  }

  return { success: true, profile: userProfile };
};

const updateProfileHandler = async (userId, profileData) => {
  const validatedData = await profileUpdateValidationSchema.validateAsync(profileData, {
    abortEarly: false,
    stripUnknown: true,
  });

  // Check for username uniqueness
  if (validatedData.username) {
    const existingUser = await db.getQuery('SELECT id FROM users WHERE username = ?', [
      validatedData.username,
    ]);
    if (existingUser && existingUser.id !== userId) {
      throw new Error('اسم المستخدم هذا موجود مسبقاً. الرجاء اختيار اسم آخر.');
    }
  }

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
    'current_password',
    'new_password',
    'confirm_new_password',
    'roles',
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

const updatePasswordHandler = async (userId, passwordData) => {
  const validatedData = await passwordUpdateValidationSchema.validateAsync(passwordData, {
    abortEarly: false,
    stripUnknown: true,
  });

  const currentUser = await db.getQuery('SELECT password FROM users WHERE id = ?', [userId]);
  if (!currentUser) {
    throw new Error('User not found.');
  }
  const isMatch = await bcrypt.compare(validatedData.current_password, currentUser.password);
  if (!isMatch) {
    throw new Error('كلمة المرور الحالية غير صحيحة.');
  }
  const hashedPassword = await bcrypt.hash(validatedData.new_password, 10);

  const sql = 'UPDATE users SET password = ? WHERE id = ?';
  await db.runQuery(sql, [hashedPassword, userId]);

  return { success: true, message: 'تم تحديث كلمة المرور بنجاح.' };
};

const setupSuperadminValidationSchema = Joi.object({
  username: Joi.string()
    .pattern(/^[a-zA-Z0-9_]+$/)
    .min(3)
    .max(50)
    .required()
    .messages({
      'string.pattern.base': 'اسم المستخدم يجب أن يكون بالإنجليزية: حروف وأرقام فقط',
      'string.min': 'اسم المستخدم يجب أن يكون 3 أحرف على الأقل',
      'string.empty': 'اسم المستخدم مطلوب',
    }),
  password: Joi.string().min(6).required().messages({
    'string.min': 'كلمة المرور يجب أن تكون 6 أحرف على الأقل',
    'string.empty': 'كلمة المرور مطلوبة',
  }),
  confirm_password: Joi.any().valid(Joi.ref('password')).required().messages({
    'any.only': 'كلمتا المرور غير متطابقتين',
    'any.required': 'يجب تأكيد كلمة المرور',
  }),
});

function registerAuthHandlers() {
  ipcMain.handle('auth:login', async (event, { username, password }) => {
    try {
      // The database is now initialized on app startup, not here.
      // We just need to make sure it's open.
      if (!db.isDbOpen()) {
        await db.initializeDatabase();
      }

      const lockState = getLoginLockoutState();
      if (lockState && lockState.lockedUntil && Date.now() < lockState.lockedUntil) {
        return {
          success: false,
          message: `تم قفل تسجيل الدخول مؤقتاً بسبب عدة محاولات فاشلة. حاول مرة أخرى بعد ${getRemainingLockMinutes(lockState.lockedUntil)} دقيقة.`,
        };
      }

      const user = await db.getQuery('SELECT * FROM users WHERE username = ?', [username]);
      if (!user) {
        recordFailedLoginAttempt();
        return { success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
      }
      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        recordFailedLoginAttempt();
        return { success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
      }

      clearLoginLockout();

      // SEC-04 safety net for existing installs: if the account still uses
      // the legacy default password '123456', force a password change.
      const mustChangePassword = await bcrypt.compare('123456', user.password);

      const roles = await db.allQuery(
        'SELECT r.name FROM roles r JOIN user_roles ur ON r.id = ur.role_id WHERE ur.user_id = ?',
        [user.id],
      );
      const userRoles = roles.map((r) => r.name);

      await refreshSettings();

      // After successful login, cache the logo path for offline access
      try {
        const store = new Store();
        const { settings } = await internalGetSettingsHandler();
        if (settings?.regional_local_logo_path) {
          store.set('cached_logo_path', settings.regional_local_logo_path);
        } else {
          // If no specific logo is set, clear the cache
          store.delete('cached_logo_path');
        }
      } catch (e) {
        logError('Failed to cache logo path on login:', e);
      }

      const token = jwt.sign(
        { id: user.id, username: user.username, roles: userRoles },
        process.env.JWT_SECRET,
        { expiresIn: '8h' },
      );

      // Establish the main-process session for this webContents. All later
      // IPC authorization reads from this session, not from the token.
      if (event && event.sender && typeof event.sender.id === 'number') {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        sessionManager.createSession(
          event.sender,
          { id: user.id, username: user.username, roles: userRoles },
          decoded && decoded.exp ? decoded.exp * 1000 : null,
        );
      }

      return {
        success: true,
        token,
        mustChangePassword,
        user: {
          id: user.id,
          username: user.username,
          first_name: user.first_name,
          last_name: user.last_name,
          roles: userRoles,
          need_guide: !!user.need_guide, // Ensure need_guide is passed to the renderer
        },
      };
    } catch (error) {
      logError('Error in auth:login handler:', error.message);
      if (error.message !== 'Incorrect password or corrupt database.') {
        await db.closeDatabase();
      }
      return { success: false, message: error.message || 'حدث خطأ غير متوقع في الخادم.' };
    }
  });

  ipcMain.handle('auth:setup-superadmin', async (event, credentials) => {
    try {
      if (!db.isDbOpen()) {
        await db.initializeDatabase();
      }

      // Guard: only allowed when no Superadmin exists yet. Once one exists,
      // this channel is hard-denied (the DB may have been imported meanwhile).
      if (await db.hasSuperadmin()) {
        return { success: false, message: 'تم إنشاء مدير النظام مسبقاً.' };
      }

      const validatedData = await setupSuperadminValidationSchema.validateAsync(credentials || {}, {
        abortEarly: false,
        stripUnknown: true,
      });

      const hashedPassword = await bcrypt.hash(validatedData.password, 10);
      const created = await db.createSuperadminUser(validatedData.username, hashedPassword);

      return {
        success: true,
        username: created.username,
        message: 'تم إنشاء مدير النظام بنجاح. سجّل الدخول الآن.',
      };
    } catch (error) {
      logError('Error in auth:setup-superadmin handler:', error.message);
      if (error.isJoi) {
        const messages = error.details.map((d) => d.message).join('; ');
        return { success: false, message: `بيانات غير صالحة: ${messages}` };
      }
      return { success: false, message: error.message || 'حدث خطأ غير متوقع في الخادم.' };
    }
  });

  ipcMain.handle('auth:getProfile', async (event) => {
    try {
      return await getProfileHandler(getUserIdFromSession(event));
    } catch (error) {
      logError('Error in auth:getProfile IPC wrapper:', error);
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('auth:updateProfile', async (event, { profileData }) => {
    try {
      return await updateProfileHandler(getUserIdFromSession(event), profileData);
    } catch (error) {
      logError('Error in auth:updateProfile IPC wrapper:', error);
      if (error.isJoi) {
        const messages = error.details.map((d) => d.message).join('; ');
        return { success: false, message: `بيانات غير صالحة: ${messages}` };
      }
      return { success: false, message: error.message || 'حدث خطأ غير متوقع في الخادم.' };
    }
  });

  ipcMain.handle('auth:updatePassword', async (event, { passwordData }) => {
    try {
      return await updatePasswordHandler(getUserIdFromSession(event), passwordData);
    } catch (error) {
      logError('Error in auth:updatePassword IPC wrapper:', error);
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
  getLoginLockoutState,
  recordFailedLoginAttempt,
  clearLoginLockout,
  getRemainingLockMinutes,
};
