const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const Store = require('electron-store');
const PizZip = require('pizzip');
const { allQuery } = require('../db/db');
const { log, error: logError } = require('./logger');
const { getDbSalt, getDbKey } = require('./keyManager');
const schema = require('../db/schema');

const store = new Store();

/**
 * Encrypts a buffer using AES-256-GCM with PBKDF2 key derivation (100k iterations).
 * Format: salt(16) || iv(12) || authTag(16) || ciphertext
 * @param {Buffer} buffer
 * @param {string} passwordOrKey
 * @returns {Buffer}
 */
function encryptBackup(buffer, passwordOrKey) {
  const salt = crypto.randomBytes(16);
  const key = crypto.pbkdf2Sync(passwordOrKey, salt, 100000, 32, 'sha256');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([salt, iv, authTag, ciphertext]);
}

/**
 * Decrypts a buffer encrypted with AES-256-GCM (PBKDF2 100k iterations).
 * @param {Buffer} encryptedBuffer
 * @param {string} passwordOrKey
 * @returns {Buffer}
 */
function decryptBackup(encryptedBuffer, passwordOrKey) {
  if (!Buffer.isBuffer(encryptedBuffer) || encryptedBuffer.length < 44) {
    throw new Error('Invalid encrypted backup file structure: Buffer too short.');
  }
  const salt = encryptedBuffer.subarray(0, 16);
  const iv = encryptedBuffer.subarray(16, 28);
  const authTag = encryptedBuffer.subarray(28, 44);
  const ciphertext = encryptedBuffer.subarray(44);

  const key = crypto.pbkdf2Sync(passwordOrKey, salt, 100000, 32, 'sha256');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * Generates an HMAC-SHA256 signature for data string/buffer using a secret key.
 * @param {string|Buffer} data
 * @param {string} key
 * @returns {string} Hex signature string
 */
function generateSignature(data, key) {
  return crypto.createHmac('sha256', key).update(data).digest('hex');
}

/**
 * Verifies an HMAC-SHA256 signature using timing-safe comparison.
 * @param {string|Buffer} data
 * @param {string} key
 * @param {string} signatureHex
 * @returns {boolean}
 */
function verifySignature(data, key, signatureHex) {
  if (!signatureHex || typeof signatureHex !== 'string') return false;
  const expectedHex = generateSignature(data, key);
  const sigBuf = Buffer.from(signatureHex.trim(), 'hex');
  const expBuf = Buffer.from(expectedHex, 'hex');
  if (sigBuf.length === 0 || sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

/**
 * Generates a complete SQL script including schema and data.
 * Using REPLACE (or INSERT OR REPLACE) handles conflicts with pre-existing data
 * (e.g., default settings) during the import process.
 * @returns {Promise<string>} A string containing the full SQL dump with schema and data.
 */
async function generateSqlReplaceStatements() {
  const sqlParts = [];

  // Add schema first
  sqlParts.push('-- Database Schema');
  sqlParts.push(schema);
  sqlParts.push('');
  sqlParts.push('-- Database Data');

  // Get all user-defined tables, excluding the migrations tracking table
  const tables = await allQuery(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'migrations'",
  );

  for (const table of tables) {
    const tableName = table.name;
    const rows = await allQuery(`SELECT * FROM "${tableName}"`);
    if (rows.length === 0) continue;

    const columnNames = Object.keys(rows[0])
      .map((name) => `"${name}"`)
      .join(', ');

    for (const row of rows) {
      const values = Object.values(row)
        .map((val) => {
          if (val === null) return 'NULL';
          if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
          if (Buffer.isBuffer(val)) return `X'${val.toString('hex')}'`;
          return val;
        })
        .join(', ');
      // Use REPLACE INTO to avoid UNIQUE constraint errors on import
      sqlParts.push(`REPLACE INTO "${tableName}" (${columnNames}) VALUES (${values});`);
    }
  }
  return sqlParts.join('\n');
}

/**
 * Runs the database backup process.
 * This creates an encrypted zip file containing a full SQL dump, encryption salt, and HMAC signature.
 * @param {Object} settings - The application settings object.
 * @param {string} backupFilePath - The path to save the backup file.
 * @returns {Promise<{success: boolean, message: string}>}
 */
const runBackup = async (settings, backupFilePath) => {
  log('SQL-based backup process started...');

  try {
    // 1. Get DB salt and DB key
    const dbSalt = getDbSalt();
    const dbKey = getDbKey();
    log(`Using database salt and key for backup.`);

    // 2. Generate SQL data dump
    log('Generating SQL dump...');
    const sqlDump = await generateSqlReplaceStatements();
    log('SQL dump generated successfully.');

    // 3. Create salt configuration content & HMAC signature
    const saltConfig = {
      'db-salt': dbSalt,
    };
    const saltFileContent = Buffer.from(JSON.stringify(saltConfig, null, 2));
    const signature = generateSignature(sqlDump, dbKey);

    // 4. Create a zip package
    const zip = new PizZip();
    zip.file('backup.sql', sqlDump);
    zip.file('salt.json', saltFileContent);
    zip.file('signature.txt', signature);

    const zipContent = zip.generate({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    });

    // 5. Encrypt backup zip content using AES-256-GCM
    const encryptedContent = encryptBackup(zipContent, dbKey);

    // 6. Write the package to the destination
    await fs.writeFile(backupFilePath, encryptedContent);

    // Ensure it's flushed/written before getting stats
    const stats = await fs.stat(backupFilePath);
    const fileSize = stats.size;
    log(`Backup file written: ${backupFilePath} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);

    const message = `Backup completed successfully.`;
    store.set('last_backup_status', {
      success: true,
      message,
      timestamp: new Date().toISOString(),
    });
    log(message, `Path: ${backupFilePath}`);

    return {
      success: true,
      message: `تم إنشاء النسخة الاحتياطية بنجاح في: ${backupFilePath}`,
      filePath: backupFilePath,
      size: fileSize,
    };
  } catch (error) {
    logError('Detailed backup error:', error);
    store.set('last_backup_status', {
      success: false,
      message: `فشل النسخة الاحتياطية: ${error.message}`,
      timestamp: new Date().toISOString(),
    });
    return { success: false, message: `فشل النسخة الاحتياطية: ${error.message}` };
  }
};

let schedulerIntervalId = null;

/**
 * Checks if a backup is due based on frequency and last backup time.
 * @param {Object} settings - The application settings object.
 * @returns {boolean} - True if a backup is due, false otherwise.
 */
const isBackupDue = (settings) => {
  const lastBackup = store.get('last_backup_status');
  const now = new Date();

  if (!lastBackup?.timestamp) {
    return true; // No backup has ever run
  }

  const lastBackupDate = new Date(lastBackup.timestamp);
  const diffHours = (now.getTime() - lastBackupDate.getTime()) / (1000 * 60 * 60);

  if (settings.backup_time) {
    const [hours, minutes] = settings.backup_time.split(':').map(Number);
    const scheduledTimeToday = new Date(now);
    scheduledTimeToday.setHours(hours, minutes, 0, 0);

    if (now < scheduledTimeToday) {
      switch (settings.backup_frequency) {
        case 'daily':
          return diffHours >= 24;
        case 'weekly':
          return diffHours >= 24 * 7;
        case 'monthly':
          return diffHours >= 24 * 30;
        default:
          return false;
      }
    }

    const hasRunToday = lastBackupDate.toDateString() === now.toDateString();
    if (hasRunToday) {
      switch (settings.backup_frequency) {
        case 'weekly':
          return diffHours >= 24 * 7;
        case 'monthly':
          return diffHours >= 24 * 30;
        default:
          return false;
      }
    }

    return true;
  }

  switch (settings.backup_frequency) {
    case 'daily':
      return diffHours >= 24;
    case 'weekly':
      return diffHours >= 24 * 7;
    case 'monthly':
      return diffHours >= 24 * 30;
    default:
      return false;
  }
};

/**
 * Starts the backup scheduler.
 * @param {Object} settings - The application settings object.
 */
const startScheduler = (settings) => {
  stopScheduler();

  if (!settings.backup_enabled) {
    log('Backup scheduler is disabled.');
    return;
  }

  log(`Backup scheduler started. Frequency: ${settings.backup_frequency}.`);

  schedulerIntervalId = setInterval(
    async () => {
      if (settings.backup_enabled && isBackupDue(settings)) {
        log('Scheduled backup is due. Running now...');
        if (settings.backup_path) {
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const backupFilePath = path.join(settings.backup_path, `auto-backup-${timestamp}.qdb`);
          await runBackup(settings, backupFilePath);
        } else {
          logError('Scheduled backup failed: No backup path configured.');
        }
      }
    },
    1000 * 60 * 60,
  );
};

/**
 * Stops the backup scheduler.
 */
const stopScheduler = () => {
  if (schedulerIntervalId) {
    clearInterval(schedulerIntervalId);
    schedulerIntervalId = null;
    log('Backup scheduler stopped.');
  }
};

module.exports = {
  runBackup,
  startScheduler,
  stopScheduler,
  isBackupDue,
  encryptBackup,
  decryptBackup,
  generateSignature,
  verifySignature,
};
