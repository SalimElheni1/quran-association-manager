const { ipcMain } = require('electron');
const bcrypt = require('bcryptjs');
const Store = require('electron-store');
const db = require('../../db/db');
const sessionManager = require('../sessionManager');
const {
  userUpdateValidationSchema,
  passwordUpdateValidationSchema,
} = require('../validationSchemas');
const Joi = require('joi'); // Keep Joi for the complex password confirmation
const { checkPassword, passwordPolicyValidator, JOI_RULE_MESSAGES } = require('../passwordPolicy');
const { refreshSettings } = require('../settingsManager');
const { internalGetSettingsHandler, internalSetTransferKey } = require('./settingsHandlers');
const { checkTransferKey } = require('../transferKeyPolicy');
const { error: logError } = require('../logger');
const { getUserRoleNames } = require('../utils/handlerData');

let authStore = null;
const getAuthStore = () => {
  if (!authStore) authStore = new Store();
  return authStore;
};

const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCK_DURATION_MS = 5 * 60 * 1000;
// A login lasts 8 hours; after that the main process asks for the password again.
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
// Failed logins are counted per username: guessing one account's password locks that account,
// not everybody's. Stored as { [username in lower case]: { failCount, lastFailAt, lockedUntil } }.
const LOCKOUTS_STORE_KEY = 'login_lockouts';
// Compared against when the username does not exist, so an unknown name takes as long to refuse
// as a wrong password (the hash of a random value nobody knows, same cost as real ones).
const UNKNOWN_USER_HASH = '$2a$10$Q7zbykwaa75apZ6cc0Ew8eD9oY0ezGnKLEQD7FM6sL4Jbayee7mpC';

const lockoutKey = (username) =>
  String(username || '')
    .trim()
    .toLowerCase();

const getAllLockouts = () => ({ ...(getAuthStore().get(LOCKOUTS_STORE_KEY) || {}) });

const getLoginLockoutState = (username) => getAllLockouts()[lockoutKey(username)] || null;

const getRemainingLockMinutes = (lockedUntil) =>
  Math.max(1, Math.ceil((lockedUntil - Date.now()) / 60000));

const recordFailedLoginAttempt = (username) => {
  const now = Date.now();
  const lockouts = getAllLockouts();
  // Forget counters that ran out, so mistyped usernames don't pile up in the store.
  for (const [key, state] of Object.entries(lockouts)) {
    const expired = now - (state.lastFailAt || 0) > LOGIN_LOCK_DURATION_MS;
    if (expired && !(state.lockedUntil > now)) delete lockouts[key];
  }
  const key = lockoutKey(username);
  const prev = lockouts[key] || {};
  const windowExpired = now - (prev.lastFailAt || 0) > LOGIN_LOCK_DURATION_MS;
  const failCount = windowExpired ? 1 : (prev.failCount || 0) + 1;
  const state = { failCount, lastFailAt: now, lockedUntil: null };
  if (failCount >= MAX_LOGIN_ATTEMPTS) {
    state.lockedUntil = now + LOGIN_LOCK_DURATION_MS;
  }
  lockouts[key] = state;
  getAuthStore().set(LOCKOUTS_STORE_KEY, lockouts);
  return state;
};

const clearLoginLockout = (username) => {
  const lockouts = getAllLockouts();
  delete lockouts[lockoutKey(username)];
  getAuthStore().set(LOCKOUTS_STORE_KEY, lockouts);
};

const profileUpdateValidationSchema = userUpdateValidationSchema
  .keys({
    current_password: Joi.string().allow(null, ''),
    new_password: Joi.string()
      .custom(passwordPolicyValidator)
      .allow(null, '')
      .messages({ ...JOI_RULE_MESSAGES }),
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

const PROFILE_EDITABLE_FIELDS = [
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
  'notes',
];

const getUserIdFromSession = (event) => {
  const session = sessionManager.getSessionForEvent(event);
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

  userProfile.roles = await getUserRoleNames(userId);

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

  // A plain `password` key from the renderer is never stored; only a verified new_password is.
  delete validatedData.password;
  if (validatedData.new_password) {
    const currentUser = await db.getQuery('SELECT username, password FROM users WHERE id = ?', [
      userId,
    ]);
    if (!currentUser) {
      throw new Error('User not found.');
    }
    const isMatch = await bcrypt.compare(validatedData.current_password, currentUser.password);
    if (!isMatch) {
      throw new Error('كلمة المرور الحالية غير صحيحة.');
    }
    // The schema's password rule has no username sibling here; check it against
    // the account's (possibly just-renamed) username.
    const policyError = checkPassword(validatedData.new_password, {
      username: validatedData.username || currentUser.username,
    });
    if (policyError) {
      throw new Error(policyError);
    }
    validatedData.password = await bcrypt.hash(validatedData.new_password, 10);
  }

  // Only the columns a user may edit on their own profile. The schema lets unknown keys
  // through, and the column names go into the SQL, so everything else is dropped here
  // (status and roles are admin-only; a password only ever arrives hashed, above).
  const fieldsToUpdate = Object.keys(validatedData).filter(
    (field) => PROFILE_EDITABLE_FIELDS.includes(field) && validatedData[field] !== undefined,
  );

  if (fieldsToUpdate.length === 0) {
    return { success: true, message: 'لم يتم تحديث أي بيانات.' };
  }

  // Joi turns date fields into Date objects, which SQLite cannot bind. Store them the
  // way users:add / users:update do.
  for (const field of fieldsToUpdate) {
    if (validatedData[field] instanceof Date) {
      validatedData[field] = validatedData[field].toISOString();
    } else if (validatedData[field] === '') {
      validatedData[field] = null;
    }
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

  const currentUser = await db.getQuery('SELECT username, password FROM users WHERE id = ?', [
    userId,
  ]);
  if (!currentUser) {
    throw new Error('User not found.');
  }
  const isMatch = await bcrypt.compare(validatedData.current_password, currentUser.password);
  if (!isMatch) {
    throw new Error('كلمة المرور الحالية غير صحيحة.');
  }
  // The Joi rule covers length/classes/common; the username rule needs the account.
  const policyError = checkPassword(validatedData.new_password, {
    username: currentUser.username,
  });
  if (policyError) {
    throw new Error(policyError);
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
  password: Joi.string()
    .custom(passwordPolicyValidator)
    .required()
    .messages({
      ...JOI_RULE_MESSAGES,
      'string.empty': 'كلمة المرور مطلوبة',
    }),
  confirm_password: Joi.any().valid(Joi.ref('password')).required().messages({
    'any.only': 'كلمتا المرور غير متطابقتين',
    'any.required': 'يجب تأكيد كلمة المرور',
  }),
  // Checked by checkTransferKey (transferKeyPolicy.js), which also compares it to the password.
  transfer_key: Joi.string().allow(''),
  confirm_transfer_key: Joi.string().allow(''),
});

function registerAuthHandlers() {
  ipcMain.handle('auth:login', async (event, { username, password }) => {
    try {
      // The database is now initialized on app startup, not here.
      // We just need to make sure it's open.
      if (!db.isDbOpen()) {
        await db.initializeDatabase();
      }

      const lockState = getLoginLockoutState(username);
      if (lockState && lockState.lockedUntil && Date.now() < lockState.lockedUntil) {
        return {
          success: false,
          message: `تم قفل تسجيل الدخول مؤقتاً بسبب عدة محاولات فاشلة. حاول مرة أخرى بعد ${getRemainingLockMinutes(lockState.lockedUntil)} دقيقة.`,
        };
      }

      const user = await db.getQuery('SELECT * FROM users WHERE username = ?', [username]);
      // An unknown username costs the same bcrypt comparison as a wrong password.
      const isMatch = await bcrypt.compare(
        String(password || ''),
        user ? user.password : UNKNOWN_USER_HASH,
      );
      if (!user || !isMatch) {
        recordFailedLoginAttempt(username);
        return { success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
      }

      clearLoginLockout(username);

      // A deleted account (kept for history) can no longer sign in, nor can an inactive one.
      // Checked after the password so the message doesn't reveal which usernames exist.
      if (user.deleted_at) {
        return {
          success: false,
          message: 'هذا الحساب محذوف. يرجى التواصل مع مدير النظام.',
        };
      }
      if (user.status && user.status !== 'active') {
        return {
          success: false,
          message: 'هذا الحساب غير نشط. يرجى التواصل مع مدير النظام.',
        };
      }

      // SEC-04 safety net for existing installs: if the account still uses
      // the legacy default password '123456', force a password change.
      const mustChangePassword = await bcrypt.compare('123456', user.password);

      const userRoles = await getUserRoleNames(user.id);

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

      // Establish the main-process session for this webContents. All later
      // IPC authorization reads from this session.
      if (event && event.sender && typeof event.sender.id === 'number') {
        sessionManager.createSession(
          event.sender,
          { id: user.id, username: user.username, roles: userRoles },
          Date.now() + SESSION_DURATION_MS,
          { mustChangePassword },
        );
      }

      return {
        success: true,
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
      logError('Error in auth:login handler:', error);
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

      // The backup protection key is chosen with the first account, so no backup is ever
      // locked to this machine's own database key.
      const transferKey = validatedData.transfer_key;
      const keyError = checkTransferKey(transferKey, {
        confirmKey: validatedData.confirm_transfer_key ?? '',
        password: validatedData.password,
      });
      if (keyError) {
        return { success: false, message: keyError };
      }

      const hashedPassword = await bcrypt.hash(validatedData.password, 10);
      const created = await db.createSuperadminUser(validatedData.username, hashedPassword);
      await internalSetTransferKey(transferKey);
      await refreshSettings();

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
      const result = await updateProfileHandler(getUserIdFromSession(event), profileData);
      if (result.success && profileData && profileData.new_password) {
        sessionManager.clearMustChangePassword(event.sender.id);
      }
      return result;
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
      const result = await updatePasswordHandler(getUserIdFromSession(event), passwordData);
      // The legacy default password is gone: the session may do everything its roles allow.
      if (result.success) sessionManager.clearMustChangePassword(event.sender.id);
      return result;
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
