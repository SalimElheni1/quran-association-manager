const fs = require('fs').promises;
const path = require('path');
const PizZip = require('pizzip');
const Store = require('electron-store');
const { getDatabasePath, isDbOpen, closeDatabase } = require('../db/db');
const { deriveKey } = require('./keyManager');
const sqlite3 = require('@journeyapps/sqlcipher').verbose();

const saltStore = new Store({ name: 'db-config' });

/**
 * Validates a packaged database file by unzipping it and trying to open the
 * database with the included salt and the user-provided password.
 * @param {string} filePath - The path to the `.qdb` backup file to validate.
 * @param {string} password - The password to test against the database.
 * @returns {Promise<{isValid: boolean, message: string}>}
 */
async function validateDatabaseFile(filePath, password) {
  let tempDbPath; // Define here to be accessible in the final catch block
  try {
    const zipFileContent = await fs.readFile(filePath);
    const zip = new PizZip(zipFileContent);

    const dbFile = zip.file('database.sqlite');
    const configFile = zip.file('config.json');

    if (!dbFile || !configFile) {
      return { isValid: false, message: 'ملف النسخ الاحتياطي غير صالح أو تالف.' };
    }

    const dbBuffer = dbFile.asNodeBuffer();
    const configContent = configFile.asText();
    const { 'db-salt': salt } = JSON.parse(configContent);

    if (!salt) {
      return { isValid: false, message: 'ملف النسخ الاحتياطي لا يحتوي على مفتاح التشفير.' };
    }

    tempDbPath = path.join(require('os').tmpdir(), `validate-${Date.now()}.sqlite`);
    await fs.writeFile(tempDbPath, dbBuffer);

    const key = deriveKey(password, salt);

    return new Promise((resolve) => {
      const tempDb = new sqlite3.Database(tempDbPath, (err) => {
        if (err) {
          fs.unlink(tempDbPath).catch((e) => console.error('Failed to cleanup temp file', e));
          return resolve({ isValid: false, message: `فشل فتح الملف: ${err.message}` });
        }

        const pragmaPromise = new Promise((res, rej) =>
          tempDb.run(`PRAGMA key = '${key}'`, (e) => (e ? rej(e) : res())),
        );

        pragmaPromise
          .then(
            () =>
              new Promise((res, rej) =>
                tempDb.get('SELECT count(*) FROM sqlite_master', (e) => (e ? rej(e) : res())),
              ),
          )
          .then(() => {
            tempDb.close((closeErr) => {
              if (closeErr) console.error('Error closing validated DB:', closeErr);
              fs.unlink(tempDbPath).catch((e) => console.error('Failed to cleanup temp file', e));
              resolve({ isValid: true, message: 'تم التحقق من صحة قاعدة البيانات بنجاح.' });
            });
          })
          .catch(() => {
            tempDb.close((closeErr) => {
              if (closeErr) console.error('Error closing invalid DB:', closeErr);
              fs.unlink(tempDbPath).catch((e) => console.error('Failed to cleanup temp file', e));
              resolve({
                isValid: false,
                message: 'كلمة المرور غير صحيحة لهذا النسخ الاحتياطي.',
              });
            });
          });
      });
    });
  } catch (error) {
    console.error('Error during backup validation:', error);
    if (tempDbPath) {
      fs.unlink(tempDbPath).catch((e) => console.error('Failed to cleanup temp file on error', e));
    }
    return { isValid: false, message: `خطأ في قراءة ملف النسخ الاحتياطي: ${error.message}` };
  }
}

/**
 * Creates a backup of the current database file.
 * @returns {Promise<{success: boolean, path?: string, message: string}>}
 */
async function backupCurrentDb() {
  const sourcePath = getDatabasePath();
  const backupDir = path.dirname(sourcePath);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFileName = `pre-import-backup-${timestamp}.sqlite`;
  const backupFilePath = path.join(backupDir, backupFileName);

  try {
    await fs.copyFile(sourcePath, backupFilePath);
    console.log(`Backup created at: ${backupFilePath}`);
    return { success: true, path: backupFilePath, message: 'تم إنشاء نسخة احتياطية من قاعدة البيانات الحالية.' };
  } catch (error) {
    console.error('Failed to create backup:', error);
    return { success: false, message: `فشل إنشاء النسخة الاحتياطية: ${error.message}` };
  }
}

/**
 * Replaces the current database file with the imported one.
 * @param {string} importedDbPath - The path to the validated, imported database file.
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function replaceDatabase(importedDbPath) {
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
    const dbFile = zip.file('database.sqlite');
    const configFile = zip.file('config.json');

    if (!dbFile || !configFile) {
      throw new Error('Could not find required files in backup package.');
    }

    const dbBuffer = dbFile.asNodeBuffer();
    const configBuffer = configFile.asNodeBuffer();

    // 3. Overwrite the current database and salt config files
    await fs.writeFile(currentDbPath, dbBuffer);
    await fs.writeFile(currentSaltPath, configBuffer);

    console.log('Database and salt config replaced successfully.');
    return { success: true, message: 'تم استيراد قاعدة البيانات بنجاح.' };
  } catch (error) {
    console.error('Failed to replace database from package:', error);
    return { success: false, message: `فشل استبدال ملف قاعدة البيانات: ${error.message}` };
  }
}

module.exports = {
  validateDatabaseFile,
  backupCurrentDb,
  replaceDatabase,
};
