const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const PizZip = require('pizzip');
const Store = require('electron-store');
const { app } = require('electron');
const {
  getDatabasePath,
  isDbOpen,
  closeDatabase,
  initializeDatabase,
  getDb,
  dbExec,
} = require('../db/db');

const saltStore = new Store({ name: 'db-config' });

/**
 * Validates a packaged backup file by checking for the required contents.
 * @param {string} filePath - The path to the `.qdb` backup file to validate.
 * @returns {Promise<{isValid: boolean, message: string}>}
 */
async function validateDatabaseFile(filePath) {
  try {
    const zipFileContent = await fs.readFile(filePath);
    const zip = new PizZip(zipFileContent);

    const sqlFile = zip.file('backup.sql');
    const configFile = zip.file('config.json');

    if (!sqlFile || !configFile) {
      return { isValid: false, message: 'ملف النسخ الاحتياطي غير صالح أو تالف.' };
    }

    // Further validation could check if config.json is valid JSON, etc.
    // For now, presence of files is enough.
    return { isValid: true, message: 'تم التحقق من ملف النسخ الاحتياطي بنجاح.' };
  } catch (error) {
    console.error('Error during backup validation:', error);
    return { isValid: false, message: `خطأ في قراءة ملف النسخ الاحتياطي: ${error.message}` };
  }
}

/**
 * Retries unlinking a file if it's busy, common on Windows.
 * @param {string} filePath - The path to the file to delete.
 * @param {number} retries - The maximum number of retries.
 * @param {number} delay - The delay between retries in milliseconds.
 */
async function unlinkWithRetry(filePath, retries = 5, delay = 100) {
  for (let i = 0; i < retries; i++) {
    try {
      await fs.unlink(filePath);
      console.log(`Successfully unlinked ${filePath}`);
      return; // Success
    } catch (error) {
      if (error.code === 'EBUSY' && i < retries - 1) {
        console.warn(`EBUSY error, retrying unlink on ${filePath} in ${delay}ms... (Attempt ${i + 1}/${retries})`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        // Re-throw the last error or any other error
        console.error(`Failed to unlink ${filePath} after ${i + 1} attempts.`);
        throw error;
      }
    }
  }
}


/**
 * Replaces the current database by importing data from a SQL dump file.
 * @param {string} importedDbPath - Path to the `.qdb` backup file.
 * @param {string} password - The user's password for the database.
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function replaceDatabase(importedDbPath, password) {
  const currentDbPath = getDatabasePath();
  const currentSaltPath = saltStore.path;

  try {
    // 1. Ensure the current DB connection is closed.
    if (isDbOpen()) {
      await closeDatabase();
    }

    // 2. Read the contents of the backup package
    const zipFileContent = await fs.readFile(importedDbPath);
    const zip = new PizZip(zipFileContent);
    const sqlFile = zip.file('backup.sql');
    const configFile = zip.file('config.json');

    if (!sqlFile || !configFile) {
      throw new Error('Could not find required files (backup.sql, config.json) in backup package.');
    }

    const sqlScript = sqlFile.asText();
    const configBuffer = configFile.asNodeBuffer();
    const configJson = JSON.parse(configBuffer.toString());
    const newSalt = configJson['db-salt'];

    if (!newSalt) {
      throw new Error('Backup configuration is missing the required salt.');
    }

    // 3. Overwrite the salt config file and update the in-memory store
    await fs.writeFile(currentSaltPath, configBuffer);
    saltStore.set('db-salt', newSalt);
    console.log('Salt configuration updated from backup.');

    // 4. Delete the old database file, if it exists
    if (fsSync.existsSync(currentDbPath)) {
      console.log(`Deleting old database file at ${currentDbPath}...`);
      await unlinkWithRetry(currentDbPath);
    }

    // 5. Initialize a new, empty, encrypted database with the new salt
    console.log('Initializing new database with imported salt...');
    await initializeDatabase(password);
    console.log('New database initialized successfully.');

    // 6. Execute the SQL script to populate the new database
    console.log('Executing SQL script to import data...');
    await dbExec(getDb(), sqlScript);
    console.log('Data import completed successfully.');

    // 7. Relaunch the application to apply all changes
    console.log('Database import successful. The app will now restart.');
    app.relaunch();
    app.quit();

    return { success: true, message: 'تم استيراد قاعدة البيانات بنجاح. سيتم إعادة تشغيل التطبيق الآن.' };
  } catch (error) {
    console.error('Failed to replace database from package:', error);
    // Attempt to restore previous state if something went wrong
    // This is complex; for now, we just log the error. A more robust
    // solution might try to restore the pre-import backup.
    return { success: false, message: `فشل استيراد قاعدة البيانات: ${error.message}` };
  }
}

module.exports = {
  validateDatabaseFile,
  replaceDatabase,
};
