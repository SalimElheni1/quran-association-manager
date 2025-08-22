const fs = require('fs').promises;
const path = require('path');
const { getDatabasePath, isDbOpen, closeDatabase, initializeDatabase } = require('../db/db');
const { getSalt, deriveKey } = require('./keyManager');
const sqlite3 = require('@journeyapps/sqlcipher').verbose();

/**
 * Checks if a database file is a plaintext SQLite database.
 * A plaintext SQLite DB starts with 'SQLite format 3\0'. An encrypted one will not.
 * @param {string} filePath Path to the database file.
 * @returns {Promise<boolean>} True if the file is plaintext, false otherwise.
 */
async function isPlaintextDB(filePath) {
  try {
    const fileHandle = await fs.open(filePath, 'r');
    const buffer = Buffer.alloc(16);
    await fileHandle.read(buffer, 0, 16, 0);
    await fileHandle.close();
    return buffer.toString('utf8', 0, 16) === 'SQLite format 3\0';
  } catch (error) {
    console.error('Error checking database file header:', error);
    // If we can't read the header, assume it's not a valid DB for our purposes.
    // Let the next validation step handle the specific error.
    return false;
  }
}

/**
 * Validates a database file by trying to open it with the current password.
 * @param {string} filePath - The path to the database file to validate.
 * @param {string} password - The current user's password to derive the key.
 * @returns {Promise<{isValid: boolean, message: string}>}
 */
async function validateDatabaseFile(filePath, password) {
  // 1. Check if the database is plaintext
  if (await isPlaintextDB(filePath)) {
    return {
      isValid: false,
      message: 'ملف قاعدة البيانات المحدد غير مشفر. لا يمكن استيراد قواعد بيانات غير مشفرة.',
    };
  }

  // 2. Try to open it with the current key
  const salt = getSalt();
  const key = deriveKey(password, salt);

  return new Promise((resolve) => {
    const tempDb = new sqlite3.Database(filePath, async (err) => {
      if (err) {
        return resolve({ isValid: false, message: `فشل فتح الملف: ${err.message}` });
      }

      try {
        // Run PRAGMA key and a simple query to verify the key.
        await new Promise((res, rej) => tempDb.run(`PRAGMA key = '${key}'`, (e) => (e ? rej(e) : res())));
        await new Promise((res, rej) => tempDb.get('SELECT count(*) FROM sqlite_master', (e) => (e ? rej(e) : res())));

        // If we got here, the key is correct.
        tempDb.close();
        resolve({ isValid: true, message: 'تم التحقق من صحة قاعدة البيانات بنجاح.' });
      } catch (e) {
        // This error most likely means the password/key is wrong.
        tempDb.close();
        resolve({
          isValid: false,
          message: 'فشل التحقق من كلمة المرور. تم تشفير هذا الملف بكلمة مرور مختلفة.',
        });
      }
    });
  });
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
  const walPath = `${currentDbPath}-wal`;
  const shmPath = `${currentDbPath}-shm`;

  try {
    // 1. Ensure the current DB connection is closed.
    if (isDbOpen()) {
      await closeDatabase();
    }

    // 2. Delete the old database files (main, -wal, -shm).
    // We wrap them in individual try/catch blocks because the -wal and -shm
    // files might not exist, and we don't want that to throw an error.
    try {
      await fs.unlink(currentDbPath);
    } catch (e) {
      if (e.code !== 'ENOENT') console.error('Could not delete main db file:', e);
    }
    try {
      await fs.unlink(walPath);
    } catch (e) {
      if (e.code !== 'ENOENT') console.error('Could not delete wal file:', e);
    }
    try {
      await fs.unlink(shmPath);
    } catch (e) {
      if (e.code !== 'ENOENT') console.error('Could not delete shm file:', e);
    }

    // 3. Copy the new database file into place.
    await fs.copyFile(importedDbPath, currentDbPath);
    return { success: true, message: 'تم استيراد قاعدة البيانات بنجاح.' };
  } catch (error) {
    console.error('Failed to replace database file:', error);
    return { success: false, message: `فشل استبدال ملف قاعدة البيانات: ${error.message}` };
  }
}

module.exports = {
  validateDatabaseFile,
  backupCurrentDb,
  replaceDatabase,
};
