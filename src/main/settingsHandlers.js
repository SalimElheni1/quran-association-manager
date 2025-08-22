const Joi = require('joi');
const db = require('../db/db');
const fs = require('fs');
const path = require('path');

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
});

/**
 * Fetches all settings from the database and formats them into an object.
 * @returns {Promise<Object>} A promise that resolves to the settings object.
 */
const getSettingsHandler = async () => {
  const results = await db.allQuery('SELECT key, value FROM settings');
  const settings = results.reduce((acc, { key, value }) => {
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

  // Prepend the safe-image protocol to logo paths before sending to renderer
  if (settings.national_logo_path) {
    settings.national_logo_path = `safe-image://${settings.national_logo_path}`;
  }
  if (settings.regional_local_logo_path) {
    settings.regional_local_logo_path = `safe-image://${settings.regional_local_logo_path}`;
  }

  return { success: true, settings };
};

/**
 * Handles copying a new logo file to the app's data directory.
 * @param {string} tempPath - The temporary path of the file from the dialog.
 * @param {import('electron').App} app - The Electron app instance.
 * @returns {Promise<string|null>} The new relative path, or null if no copy was needed.
 */
const copyLogoAsset = async (tempPath, app) => {
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

  // Copy the file
  fs.copyFileSync(tempPath, newPath);

  // Return the relative path for storage
  return path.join('assets', 'logos', fileName).replace(/\\/g, '/'); // Ensure forward slashes
};

/**
 * Updates settings in the database.
 * @param {Object} settingsData - The object containing settings to update.
 * @returns {Promise<Object>} A promise that resolves to a success message.
 */
const updateSettingsHandler = async (settingsData) => {
  const validatedData = await settingsValidationSchema.validateAsync(settingsData);

  await db.runQuery('BEGIN TRANSACTION;');
  try {
    for (const [key, value] of Object.entries(validatedData)) {
      // Ensure value is a string for the database
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

module.exports = {
  getSettingsHandler,
  updateSettingsHandler,
  copyLogoAsset,
};
