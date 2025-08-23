const { ipcMain, app, dialog } = require('electron');
const Joi = require('joi');
const db = require('../../db/db');
const fs = require('fs');
const path = require('path');
const backupManager = require('../backupManager');

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
});

const defaultSettings = {
  national_association_name: 'الرابطة الوطنية للقرآن الكريم',
  regional_association_name: '',
  local_branch_name: '',
  national_logo_path: 'assets/logos/g247.png',
  regional_local_logo_path: '',
  backup_path: '',
  backup_enabled: false,
  backup_frequency: 'daily',
  president_full_name: '',
  adultAgeThreshold: 18,
  backup_reminder_enabled: true,
  backup_reminder_frequency_days: 7,
};

const internalGetSettingsHandler = async () => {
  const results = await db.allQuery('SELECT key, value FROM settings');
  const dbSettings = results.reduce((acc, { key, value }) => {
    // Convert string representations of booleans and numbers back to their types
    if (value === 'true') {
      acc[key] = true;
    } else if (value === 'false') {
      acc[key] = false;
    } else if (!isNaN(value) && value.trim() !== '') {
      acc[key] = Number(value);
    } else {
      acc[key] = value;
    }
    return acc;
  }, {});

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
  const validatedData = await settingsValidationSchema.validateAsync(settingsData);
  await db.runQuery('BEGIN TRANSACTION;');
  try {
    for (const [key, value] of Object.entries(validatedData)) {
      const dbValue = value === null || value === undefined ? '' : String(value);
      await db.runQuery('UPDATE settings SET value = ? WHERE key = ?', [dbValue, key]);
    }
    await db.runQuery('COMMIT;');
    return { success: true, message: 'تم تحديث الإعدادات بنجاح.' };
  } catch (error) {
    await db.runQuery('ROLLBACK;');
    console.error('Failed to update settings:', error);
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
      console.error('Error in settings:get IPC wrapper:', error);
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('settings:update', async (_event, settingsData) => {
    try {
      const result = await internalUpdateSettingsHandler(settingsData);
      if (result.success) {
        console.info('Settings updated, restarting backup scheduler...');
        const { settings: newSettings } = await internalGetSettingsHandler();
        if (newSettings) {
          backupManager.startScheduler(newSettings);
        }
        await refreshSettings();
      }
      return result;
    } catch (error) {
      console.error('Error in settings:update IPC wrapper:', error);
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('settings:getLogo', async () => {
    try {
      if (!db.isDbOpen()) {
        return { success: true, path: null };
      }
      const { settings } = await internalGetSettingsHandler();
      const userDataPath = app.getPath('userData');
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
      return { success: true, path: null };
    } catch (error) {
      console.error('Failed to get logo:', error);
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
      console.error('Failed to upload logo:', error);
      return { success: false, message: `Error uploading logo: ${error.message}` };
    }
  });
}

module.exports = {
  registerSettingsHandlers,
  internalGetSettingsHandler,
};
