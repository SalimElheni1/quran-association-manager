const { ipcMain, app, dialog } = require('electron');
const Joi = require('joi');
const Store = require('electron-store');
const db = require('../../db/db');
const fs = require('fs');
const path = require('path');
const backupManager = require('../backupManager');
const { startScheduler: startFeeChargeScheduler } = require('../feeChargeScheduler');
const { log, warn: logWarn, error: logError } = require('../logger');

/**
 * Safely attempt to rollback a transaction if one is active.
 * Prevents "cannot rollback - no transaction is active" errors.
 * @returns {Promise<boolean>} true if rollback was attempted, false if skipped
 */
async function safeRollback() {
  try {
    await db.runQuery('ROLLBACK;');
    return true;
  } catch (err) {
    if (err.message && err.message.includes('cannot rollback')) {
      logWarn('Attempted rollback but no transaction was active (this is expected in some cases)');
      return false;
    }
    logError('Error during rollback attempt:', err);
    return false;
  }
}

// Joi schema for settings validation
const settingsValidationSchema = Joi.object({
  national_association_name: Joi.string().allow(''),
  regional_association_name: Joi.string().allow(''),
  local_branch_name: Joi.string().allow(''),
  president_full_name: Joi.string().allow(''),
  national_logo_path: Joi.string().allow(''),
  regional_local_logo_path: Joi.string().allow(''),
  backup_path: Joi.string().allow(''),
  backup_enabled: Joi.boolean(),
  backup_frequency: Joi.string().valid('daily', 'weekly', 'monthly'),

  backup_reminder_enabled: Joi.boolean(),
  backup_reminder_frequency_days: Joi.number().integer().min(1).max(365),
  annual_fee: Joi.number().min(0).allow(null),
  standard_monthly_fee: Joi.number().min(0).allow(null),
  auto_charge_generation_enabled: Joi.boolean(),
  charge_generation_frequency: Joi.string().valid('daily', 'weekly'),
  pre_generate_months_ahead: Joi.number().integer().min(1).max(12),
  last_charge_generation_check: Joi.string().allow(null, ''),
  men_payment_frequency: Joi.string().valid('MONTHLY', 'ANNUAL'),
  women_payment_frequency: Joi.string().valid('MONTHLY', 'ANNUAL'),
  kids_payment_frequency: Joi.string().valid('MONTHLY', 'ANNUAL'),
  academic_year_start_month: Joi.number().integer().min(1).max(12),
  charge_generation_day: Joi.number().integer().min(1).max(28),
});

const defaultSettings = {
  national_association_name: 'الرابطة الوطنية للقرآن الكريم',
  regional_association_name: '',
  local_branch_name: '',
  national_logo_path: 'assets/logos/icon.png',
  regional_local_logo_path: '',
  backup_path: '',
  backup_enabled: false,
  backup_frequency: 'daily',
  president_full_name: '',

  backup_reminder_enabled: true,
  backup_reminder_frequency_days: 7,
  annual_fee: 0,
  standard_monthly_fee: 0,
  auto_charge_generation_enabled: true,
  charge_generation_frequency: 'daily',
  pre_generate_months_ahead: 2,
};

const internalGetSettingsHandler = async () => {
  const results = await db.allQuery('SELECT key, value FROM settings');
  const dbSettings = results.reduce((acc, { key, value }) => {
    // Convert snake_case keys to camelCase for compatibility
    let camelKey = key;
    if (key === 'adult_age_threshold') {
      camelKey = 'adultAgeThreshold';
    }

    if (value === 'true') {
      acc[camelKey] = true;
    } else if (value === 'false') {
      acc[camelKey] = false;
    } else if (!isNaN(value) && value !== null && value !== undefined && value.trim() !== '') {
      acc[camelKey] = Number(value);
    } else {
      acc[camelKey] = value;
    }
    return acc;
  }, {});

  const settings = { ...defaultSettings, ...dbSettings };
  return { success: true, settings };
};

const internalCopyLogoAsset = async (tempPath) => {
  if (!tempPath || !fs.existsSync(tempPath)) {
    return null;
  }
  const userDataPath = app.getPath('userData');
  const logosDir = path.join(userDataPath, 'assets', 'logos');
  if (!fs.existsSync(logosDir)) {
    fs.mkdirSync(logosDir, { recursive: true });
  }
  const fileName = path.basename(tempPath);
  const newPath = path.join(logosDir, fileName);
  fs.copyFileSync(tempPath, newPath);
  return path.join('assets', 'logos', fileName).replace(/\\/g, '/');
};

const validateLogoPath = (logoPath) => {
  if (!logoPath) return true;
  const userDataPath = app.getPath('userData');
  const fullPath = path.join(userDataPath, logoPath);
  return fs.existsSync(fullPath);
};

const internalUpdateSettingsHandler = async (settingsData) => {
  const filteredData = { ...settingsData };
  delete filteredData.adultAgeThreshold;
  delete filteredData.adult_age_threshold;

  if (filteredData.national_logo_path && !validateLogoPath(filteredData.national_logo_path)) {
    filteredData.national_logo_path = defaultSettings.national_logo_path;
  }
  if (
    filteredData.regional_local_logo_path &&
    !validateLogoPath(filteredData.regional_local_logo_path)
  ) {
    filteredData.regional_local_logo_path = '';
  }

  const validatedData = await settingsValidationSchema.validateAsync(filteredData);

  try {
    // Start transaction
    await db.runQuery('BEGIN TRANSACTION;');

    for (const [key, value] of Object.entries(validatedData)) {
      const dbValue = value === null || value === undefined ? '' : String(value);
      await db.runQuery('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [
        key,
        dbValue,
      ]);
    }

    // Commit transaction
    await db.runQuery('COMMIT;');
    return { success: true, message: 'تم تحديث الإعدادات بنجاح.' };
  } catch (error) {
    // Rollback on error
    try {
      await db.runQuery('ROLLBACK;');
    } catch (rollbackError) {
      logError('Failed to rollback transaction:', rollbackError);
    }
    logError('Failed to update settings:', error);
    throw new Error('فشل تحديث الإعدادات.');
  }
};

function registerSettingsHandlers(refreshSettings) {
  ipcMain.handle('settings:get', async () => {
    try {
      if (!db.isDbOpen()) {
        return { success: true, settings: {} };
      }
      return await internalGetSettingsHandler();
    } catch (error) {
      logError('Error in settings:get IPC wrapper:', error);
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('settings:update', async (_event, settingsData) => {
    try {
      log(
        '[DEBUG] settings:update IPC handler called with settingsData:',
        JSON.stringify(settingsData, null, 2),
      );

      const { settings: oldSettings } = await internalGetSettingsHandler();
      const oldAnnualFee = parseFloat(oldSettings.annual_fee || '0');
      const oldMonthlyFee = parseFloat(oldSettings.standard_monthly_fee || '0');
      const feesWereNotSet = oldAnnualFee <= 0 && oldMonthlyFee <= 0;

      log('[DEBUG] settings:update - oldFees:', { oldAnnualFee, oldMonthlyFee, feesWereNotSet });

      const result = await internalUpdateSettingsHandler(settingsData);

      log(`[Settings] Update result: ${JSON.stringify(result)}`);

      if (result.success) {
        log('Settings updated, restarting backup scheduler...');
        const { settings: newSettings } = await internalGetSettingsHandler();

        log(`[Settings] New settings loaded: ${JSON.stringify(newSettings)}`);

        if (newSettings) {
          backupManager.startScheduler(newSettings);
          startFeeChargeScheduler(newSettings);

          const newAnnualFee = parseFloat(newSettings.annual_fee || '0');
          const newMonthlyFee = parseFloat(newSettings.standard_monthly_fee || '0');

          log(
            `[Settings] Fees check - Old Annual: ${oldAnnualFee}, Old Monthly: ${oldMonthlyFee}, New Annual: ${newAnnualFee}, New Monthly: ${newMonthlyFee}`,
          );

          const feesWerePreviouslySet = oldAnnualFee > 0 || oldMonthlyFee > 0;
          const feesBeingSetNow = newAnnualFee > 0 || newMonthlyFee > 0;
          const isFirstTimeSetup = !feesWerePreviouslySet && feesBeingSetNow;
          const feesActuallyChanged =
            oldAnnualFee !== newAnnualFee || oldMonthlyFee !== newMonthlyFee;

          if (feesBeingSetNow && (isFirstTimeSetup || feesActuallyChanged)) {
            if (isFirstTimeSetup || newSettings.auto_charge_generation_enabled) {
              log(
                `[Settings] Charges need to be generated - First setup: ${isFirstTimeSetup}, Fees changed: ${feesActuallyChanged}`,
              );
              const { checkAndGenerateChargesForAllStudents } = require('./studentFeeHandlers');
              const chargeResult = await checkAndGenerateChargesForAllStudents(newSettings);
              log(`[Settings] Charge result: ${JSON.stringify(chargeResult)}`);

              if (chargeResult.success && !chargeResult.skipped) {
                result.message += ' تم توليد الرسوم لجميع الطلاب بنجاح.';
              }
            } else {
              log(
                '[Settings] Fee values changed but auto-generation disabled - skipping charge regeneration',
              );
            }
          } else if (feesBeingSetNow) {
            log(
              '[Settings] Fees configured but no change detected - no charge regeneration needed',
            );
          } else {
            log('[Settings] No fees configured - skipping charge generation');
          }
        }
        await refreshSettings();
      }
      return result;
    } catch (error) {
      await safeRollback();
      logError('Error in settings:update IPC wrapper:', error);
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('settings:getLogo', async () => {
    try {
      const userDataPath = app.getPath('userData');

      if (db.isDbOpen()) {
        const { settings } = await internalGetSettingsHandler();
        if (settings.regional_local_logo_path) {
          const logoPath = path.join(userDataPath, settings.regional_local_logo_path);
          if (fs.existsSync(logoPath)) {
            return { success: true, path: `safe-image://${settings.regional_local_logo_path}` };
          }
        }
        if (settings.national_logo_path) {
          const logoPath = path.join(userDataPath, settings.national_logo_path);
          if (fs.existsSync(logoPath)) {
            return { success: true, path: `safe-image://${settings.national_logo_path}` };
          }
        }
      } else {
        const store = new Store();
        const cachedLogoPath = store.get('cached_logo_path');
        if (cachedLogoPath) {
          const logoPath = path.join(userDataPath, cachedLogoPath);
          if (fs.existsSync(logoPath)) {
            return { success: true, path: `safe-image://${cachedLogoPath}` };
          }
        }
      }

      return { success: true, path: null };
    } catch (error) {
      logError('Failed to get logo:', error);
      return { success: false, message: `Error getting logo: ${error.message}` };
    }
  });

  ipcMain.handle('settings:uploadLogo', async () => {
    try {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif'] }],
      });
      if (canceled || !filePaths || filePaths.length === 0) {
        return { success: false, message: 'No file selected.' };
      }
      const tempPath = filePaths[0];
      const relativePath = await internalCopyLogoAsset(tempPath);
      if (relativePath) {
        return { success: true, path: relativePath };
      } else {
        return { success: false, message: 'Failed to copy logo.' };
      }
    } catch (error) {
      logError('Failed to upload logo:', error);
      return { success: false, message: `Error uploading logo: ${error.message}` };
    }
  });

  // Age Groups handlers
  ipcMain.handle('ageGroups:get', async () => {
    try {
      const results = await db.allQuery(
        'SELECT * FROM age_groups WHERE is_active = 1 ORDER BY min_age ASC',
      );
      return { success: true, ageGroups: results };
    } catch (error) {
      logError('Error in ageGroups:get IPC handler:', error);
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('ageGroups:create', async (_event, ageGroupData) => {
    try {
      log('[DEBUG] ageGroups:create - Input data:', JSON.stringify(ageGroupData));
      const { v4: uuidv4 } = require('uuid');

      const schema = Joi.object({
        name: Joi.string().required().min(1).max(100),
        description: Joi.string().allow('').max(500),
        min_age: Joi.number().integer().min(0).max(100).required(),
        max_age: Joi.number()
          .integer()
          .allow(null)
          .when('min_age', {
            is: Joi.number().required(),
            then: Joi.number().integer().min(Joi.ref('min_age')).max(100),
          }),
        gender: Joi.string().valid('male_only', 'female_only', 'any').required(),
        is_active: Joi.boolean().default(true),
      });

      let validatedData;
      try {
        validatedData = await schema.validateAsync(ageGroupData);
        log('[DEBUG] ageGroups:create - Validated data:', JSON.stringify(validatedData));
      } catch (validationError) {
        log('[DEBUG] ageGroups:create - Validation error:', validationError.message);
        throw validationError;
      }

      const uuid = uuidv4();
      log('[DEBUG] ageGroups:create - Generated UUID:', uuid);

      let result;
      try {
        result = await db.runQuery(
          `INSERT INTO age_groups (uuid, name, description, min_age, max_age, gender, is_active)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            uuid,
            validatedData.name,
            validatedData.description || '',
            validatedData.min_age,
            validatedData.max_age || null,
            validatedData.gender,
            validatedData.is_active ? 1 : 0,
          ],
        );
        log('[DEBUG] ageGroups:create - Insert result:', JSON.stringify(result));
      } catch (dbError) {
        log('[DEBUG] ageGroups:create - Database error:', dbError.message);
        throw dbError;
      }

      if (result.id) {
        log('[DEBUG] ageGroups:create - Success! ID:', result.id);
        return { success: true, message: 'تم إنشاء الفئة العمرية بنجاح.', ageGroupId: result.id };
      } else {
        throw new Error('Failed to create age group - no ID returned');
      }
    } catch (error) {
      logError('Error in ageGroups:create IPC handler:', error);
      log('[DEBUG] ageGroups:create - Error details:', error.message, error.stack);
      return { success: false, message: error.message || 'Failed to create age group' };
    }
  });

  ipcMain.handle('ageGroups:update', async (_event, id, ageGroupData) => {
    try {
      const schema = Joi.object({
        name: Joi.string().required().min(1).max(100),
        description: Joi.string().allow('').max(500),
        min_age: Joi.number().integer().min(0).max(100).required(),
        max_age: Joi.number()
          .integer()
          .allow(null)
          .when('min_age', {
            is: Joi.number().required(),
            then: Joi.number().integer().min(Joi.ref('min_age')).max(100),
          }),
        gender: Joi.string().valid('male_only', 'female_only', 'any').required(),
        is_active: Joi.boolean().default(true),
      });

      const validatedData = await schema.validateAsync(ageGroupData);

      await db.runQuery(
        `UPDATE age_groups SET
         name = ?, description = ?, min_age = ?, max_age = ?,
         gender = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          validatedData.name,
          validatedData.description || '',
          validatedData.min_age,
          validatedData.max_age || null,
          validatedData.gender,
          validatedData.is_active ? 1 : 0,
          id,
        ],
      );

      return { success: true, message: 'تم تحديث الفئة العمرية بنجاح.' };
    } catch (error) {
      logError('Error in ageGroups:update IPC handler:', error);
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('ageGroups:delete', async (_event, id) => {
    try {
      await db.runQuery('UPDATE age_groups SET is_active = 0 WHERE id = ?', [id]);
      return { success: true, message: 'تم إلغاء تفعيل الفئة العمرية بنجاح.' };
    } catch (error) {
      logError('Error in ageGroups:delete IPC handler:', error);
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('ageGroups:matchStudent', async (_event, studentAge, studentGender) => {
    try {
      if (studentAge === null || studentAge === undefined) {
        return { success: false, message: 'عمر الطالب غير محدد' };
      }

      let sql = `
        SELECT id, uuid, name, description, min_age, max_age, gender
        FROM age_groups
        WHERE is_active = 1
        AND min_age <= ?
        AND (max_age IS NULL OR max_age >= ?)
        AND (gender = 'any' OR gender = ?)
        ORDER BY min_age ASC
      `;

      const genderMap = {
        M: 'male_only',
        F: 'female_only',
        male: 'male_only',
        female: 'female_only',
        ذكر: 'male_only',
        أنثى: 'female_only',
      };
      const mappedGender = genderMap[studentGender] || 'any';

      const results = await db.allQuery(sql, [studentAge, studentAge, mappedGender]);
      return { success: true, ageGroups: results || [] };
    } catch (error) {
      logError('Error in ageGroups:matchStudent IPC handler:', error);
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle(
    'ageGroups:validateStudentForClass',
    async (_event, studentAge, studentGender, classAgeGroupId) => {
      try {
        if (!classAgeGroupId) {
          return { success: false, message: 'معرف فئة الفصل غير محدد' };
        }

        if (studentAge === null || studentAge === undefined) {
          return { success: true, isValid: true, warning: 'عمر الطالب غير محدد، يرجى تحديثه' };
        }

        const ageGroup = await db.getQuery(
          `SELECT id, name, min_age, max_age, gender
         FROM age_groups
         WHERE id = ? AND is_active = 1`,
          [classAgeGroupId],
        );

        if (!ageGroup) {
          return { success: false, message: 'فئة الفصل غير موجودة' };
        }

        const ageInRange =
          studentAge >= ageGroup.min_age &&
          (ageGroup.max_age === null || studentAge <= ageGroup.max_age);

        if (!ageInRange) {
          return {
            success: true,
            isValid: false,
            message: `عمر الطالب (${studentAge}) خارج نطاق فئة الفصل (${ageGroup.min_age}-${ageGroup.max_age || '+'})`,
          };
        }

        const genderMap = {
          M: 'male_only',
          F: 'female_only',
          male: 'male_only',
          female: 'female_only',
          ذكر: 'male_only',
          أنثى: 'female_only',
        };
        const mappedGender = genderMap[studentGender] || 'any';

        const genderCompatible = ageGroup.gender === 'any' || ageGroup.gender === mappedGender;

        if (!genderCompatible) {
          return {
            success: true,
            isValid: false,
            message: `جنس الطالب (${studentGender}) غير متوافق مع فئة الفصل`,
          };
        }

        return { success: true, isValid: true, ageGroup };
      } catch (error) {
        logError('Error in ageGroups:validateStudentForClass IPC handler:', error);
        return { success: false, message: error.message };
      }
    },
  );
}

module.exports = {
  registerSettingsHandlers,
  internalGetSettingsHandler,
  internalUpdateSettingsHandler,
};
