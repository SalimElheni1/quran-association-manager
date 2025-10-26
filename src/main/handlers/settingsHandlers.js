const { ipcMain, app, dialog } = require('electron');
const Joi = require('joi');
const Store = require('electron-store');
const db = require('../../db/db');
const fs = require('fs');
const path = require('path');
const backupManager = require('../backupManager');
const { startScheduler: startFeeChargeScheduler, stopScheduler: stopFeeChargeScheduler } = require('../feeChargeScheduler');
const { log, error: logError } = require('../logger');

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
  adultAgeThreshold: Joi.number().integer().min(1).max(100).required(),
  backup_reminder_enabled: Joi.boolean(),
  backup_reminder_frequency_days: Joi.number().integer().min(1).max(365),
  annual_fee: Joi.number().min(0).allow(null),
  standard_monthly_fee: Joi.number().min(0).allow(null),
  auto_charge_generation_enabled: Joi.boolean(),
  charge_generation_frequency: Joi.string().valid('daily', 'weekly'),
  pre_generate_months_ahead: Joi.number().integer().min(1).max(12),
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
  adultAgeThreshold: 18,
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
    // Convert string representations of booleans and numbers back to their types
    if (value === 'true') {
      acc[key] = true;
    } else if (value === 'false') {
      acc[key] = false;
    } else if (!isNaN(value) && value !== null && value !== undefined && value.trim() !== '') {
      acc[key] = Number(value);
    } else {
      acc[key] = value;
    }
    return acc;
  }, {});

  // Normalize legacy/snake_case keys from the DB to the schema's camelCase keys
  if (Object.prototype.hasOwnProperty.call(dbSettings, 'adult_age_threshold')) {
    dbSettings.adultAgeThreshold = dbSettings['adult_age_threshold'];
    delete dbSettings['adult_age_threshold'];
  }

  // Merge database settings with defaults to ensure all keys are present
  const settings = { ...defaultSettings, ...dbSettings };

  return { success: true, settings };
};

const internalCopyLogoAsset = async (tempPath) => {
  if (!tempPath || !fs.existsSync(tempPath)) {
    return null; // No new file to copy
  }
  const userDataPath = app.getPath('userData');
  const logosDir = path.join(userDataPath, 'assets', 'logos');
  if (!fs.existsSync(logosDir)) {
    fs.mkdirSync(logosDir, { recursive: true });
  }
  const fileName = path.basename(tempPath);
  const newPath = path.join(logosDir, fileName);
  fs.copyFileSync(tempPath, newPath);
  return path.join('assets', 'logos', fileName).replace(/\\/g, '/'); // Ensure forward slashes
};

const internalUpdateSettingsHandler = async (settingsData) => {
  // Accept legacy snake_case keys from the renderer and map them to the schema's camelCase
  const normalized = { ...settingsData };
  if (Object.prototype.hasOwnProperty.call(normalized, 'adult_age_threshold')) {
    normalized.adultAgeThreshold = normalized['adult_age_threshold'];
    delete normalized['adult_age_threshold'];
  }

  const validatedData = await settingsValidationSchema.validateAsync(normalized);
  // Reverse-map camelCase validated keys back to snake_case DB keys when necessary
  const dbKeyMap = {
    adultAgeThreshold: 'adult_age_threshold',
  };

  function camelToSnake(s) {
    return s.replace(/([A-Z])/g, (m) => `_${m.toLowerCase()}`).replace(/^_/, '');
  }

  await db.runQuery('BEGIN TRANSACTION;');
  try {
    for (const [key, value] of Object.entries(validatedData)) {
      const primaryDbKey = Object.prototype.hasOwnProperty.call(dbKeyMap, key)
        ? dbKeyMap[key]
        : key;
      const dbValue = value === null || value === undefined ? '' : String(value);

      // Use INSERT OR REPLACE to ensure the setting is always saved
      await db.runQuery('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [
        primaryDbKey,
        dbValue,
      ]);
    }
    await db.runQuery('COMMIT;');
    return { success: true, message: 'تم تحديث الإعدادات بنجاح.' };
  } catch (error) {
    await db.runQuery('ROLLBACK;');
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
      const result = await internalUpdateSettingsHandler(settingsData);
      if (result.success) {
        log('Settings updated, restarting backup and fee charge schedulers...');
        const { settings: newSettings } = await internalGetSettingsHandler();
        if (newSettings) {
          backupManager.startScheduler(newSettings);
          startFeeChargeScheduler(newSettings);
        }
        await refreshSettings();
      }
      return result;
    } catch (error) {
      logError('Error in settings:update IPC wrapper:', error);
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('settings:getLogo', async () => {
    try {
      const userDataPath = app.getPath('userData');

      // If the database is open, fetch the logo path from the database.
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
        // If the database is closed (e.g., on the login screen after logout),
        // try to get the logo path from the persistent store.
        const store = new Store();
        const cachedLogoPath = store.get('cached_logo_path');
        if (cachedLogoPath) {
          const logoPath = path.join(userDataPath, cachedLogoPath);
          if (fs.existsSync(logoPath)) {
            return { success: true, path: `safe-image://${cachedLogoPath}` };
          }
        }
      }

      // Fallback if no logo is found
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
}

module.exports = {
  registerSettingsHandlers,
  internalGetSettingsHandler,
  internalUpdateSettingsHandler,
};
