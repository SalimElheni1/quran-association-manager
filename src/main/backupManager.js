const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const crypto = require('crypto');
const util = require('util');
const Store = require('electron-store');
const PizZip = require('pizzip');
const { allQuery } = require('../db/db');
const { log, error: logError, warn: logWarn } = require('./logger');
const { getDbSalt, getDbKey } = require('./keyManager');
const schema = require('../db/schema');

const store = new Store();

/**
 * Validates the backup directory path.
 * @param {string} dirPath - The directory path to validate.
 * @returns {{valid: boolean, path?: string, message?: string}} Validation result.
 */
function validateBackupPath(dirPath) {
  if (typeof dirPath !== 'string' || dirPath.length === 0) {
    return { valid: false, message: 'مسار النسخ الاحتياطي غير محدد.' };
  }
  if (dirPath.includes('\0')) {
    return { valid: false, message: 'مسار النسخ الاحتياطي يحتوي على أحرف غير صالحة.' };
  }
  if (!path.isAbsolute(dirPath)) {
    return { valid: false, message: 'مسار النسخ الاحتياطي يجب أن يكون مساراً كاملاً.' };
  }
  let stat;
  try {
    stat = fsSync.statSync(dirPath);
  } catch (err) {
    return { valid: false, message: 'مجلد النسخ الاحتياطي غير موجود.' };
  }
  if (!stat.isDirectory()) {
    return { valid: false, message: 'مجلد النسخ الاحتياطي غير موجود.' };
  }
  try {
    fsSync.accessSync(dirPath, fsSync.constants.W_OK);
  } catch (err) {
    return { valid: false, message: 'مجلد النسخ الاحتياطي غير قابل للكتابة.' };
  }
  return { valid: true, path: path.resolve(dirPath) };
}

// Encrypted backup files (.qdb), AES-256-GCM with a key stretched by PBKDF2-SHA256:
// - current: "QDB2" | iterations (uint32, big-endian) | salt(16) | iv(12) | authTag(16) | data
// - versions 1.3.0 to 1.4.x: salt(16) | iv(12) | authTag(16) | data, with 100,000 iterations.
const BACKUP_MAGIC = Buffer.from('QDB2');
const HEADER_LENGTH = BACKUP_MAGIC.length + 4;
// OWASP's figure for PBKDF2-HMAC-SHA256: the transfer key is typed by people (8+ characters).
const BACKUP_KDF_ITERATIONS = 600000;
const LEGACY_KDF_ITERATIONS = 100000;
// A file cannot make a restore spin for minutes.
const MAX_KDF_ITERATIONS = 5000000;
const SALT_IV_TAG_LENGTH = 16 + 12 + 16;

const pbkdf2 = util.promisify(crypto.pbkdf2);

/**
 * Encrypts a buffer (current format). The key is stretched on libuv's thread pool, so the window
 * does not freeze while 600,000 PBKDF2 rounds run.
 * @param {Buffer} buffer
 * @param {string} passwordOrKey
 * @returns {Promise<Buffer>}
 */
async function encryptBackup(buffer, passwordOrKey) {
  const salt = crypto.randomBytes(16);
  const key = await pbkdf2(passwordOrKey, salt, BACKUP_KDF_ITERATIONS, 32, 'sha256');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag();
  const header = Buffer.alloc(HEADER_LENGTH);
  BACKUP_MAGIC.copy(header);
  header.writeUInt32BE(BACKUP_KDF_ITERATIONS, BACKUP_MAGIC.length);
  return Buffer.concat([header, salt, iv, authTag, ciphertext]);
}

async function decryptWith(body, passwordOrKey, iterations) {
  const salt = body.subarray(0, 16);
  const iv = body.subarray(16, 28);
  const authTag = body.subarray(28, 44);
  const ciphertext = body.subarray(44);
  const key = await pbkdf2(passwordOrKey, salt, iterations, 32, 'sha256');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

/**
 * Decrypts a backup in either format. Throws when the key is wrong or the file was changed (the
 * GCM tag does not match).
 * @param {Buffer} encryptedBuffer
 * @param {string} passwordOrKey
 * @returns {Promise<Buffer>}
 */
async function decryptBackup(encryptedBuffer, passwordOrKey) {
  if (!Buffer.isBuffer(encryptedBuffer) || encryptedBuffer.length < SALT_IV_TAG_LENGTH) {
    throw new Error('Invalid encrypted backup file structure: Buffer too short.');
  }
  const hasHeader =
    encryptedBuffer.length >= HEADER_LENGTH + SALT_IV_TAG_LENGTH &&
    encryptedBuffer.subarray(0, BACKUP_MAGIC.length).equals(BACKUP_MAGIC);
  if (hasHeader) {
    const iterations = encryptedBuffer.readUInt32BE(BACKUP_MAGIC.length);
    if (iterations >= LEGACY_KDF_ITERATIONS && iterations <= MAX_KDF_ITERATIONS) {
      try {
        return await decryptWith(
          encryptedBuffer.subarray(HEADER_LENGTH),
          passwordOrKey,
          iterations,
        );
      } catch (error) {
        // An old backup whose random salt happens to start with "QDB2": read it the old way.
      }
    }
  }
  return decryptWith(encryptedBuffer, passwordOrKey, LEGACY_KDF_ITERATIONS);
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
 * This creates an encrypted zip file containing a full SQL dump, encryption salt, HMAC signature, and optional assets.
 * @param {Object} settings - The application settings object.
 * @param {string} backupFilePath - The path to save the backup file.
 * @param {string} [userPassword] - Optional user password / transfer key for cross-device backup encryption.
 * @returns {Promise<{success: boolean, message: string}>}
 */
const runBackup = async (settings, backupFilePath, userPassword) => {
  log('SQL-based backup process started...');

  try {
    const dbSalt = getDbSalt();
    const dbKey = getDbKey();

    const encryptionKey = userPassword || (settings && settings.association_transfer_key) || dbKey;
    const signingKey = encryptionKey;

    log('Generating SQL dump...');
    const sqlDump = await generateSqlReplaceStatements();
    log('SQL dump generated successfully.');

    const saltConfig = { 'db-salt': dbSalt };
    const saltFileContent = Buffer.from(JSON.stringify(saltConfig, null, 2));
    const signature = generateSignature(sqlDump, signingKey);

    const zip = new PizZip();
    zip.file('backup.sql', sqlDump);
    zip.file('salt.json', saltFileContent);
    zip.file('signature.txt', signature);

    // Bundle student photos & logos from userData/assets (recursively) if present
    try {
      const electron = require('electron');
      const app = electron.app;
      if (app && typeof app.getPath === 'function') {
        const assetsDir = path.join(app.getPath('userData'), 'assets');
        const walkAssets = (dir, relativePrefix) => {
          if (!fsSync.existsSync(dir)) return;
          for (const entry of fsSync.readdirSync(dir)) {
            const entryPath = path.join(dir, entry);
            const stat = fsSync.statSync(entryPath);
            const zipPath = `assets/${relativePrefix}${entry}`.replace(/\\/g, '/');
            if (stat.isDirectory()) {
              walkAssets(entryPath, `${relativePrefix}${entry}/`);
            } else if (stat.isFile()) {
              zip.file(zipPath, fsSync.readFileSync(entryPath));
            }
          }
        };
        walkAssets(assetsDir, '');
      }
    } catch (assetErr) {
      if (typeof logWarn === 'function') {
        logWarn('Asset backup note:', assetErr.message);
      }
    }

    const zipContent = zip.generate({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    });

    const encryptedContent = await encryptBackup(zipContent, encryptionKey);

    await fs.writeFile(backupFilePath, encryptedContent);

    const stats = await fs.stat(backupFilePath);
    const fileSize = stats.size;
    log(`Backup file written: ${backupFilePath} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);

    const message = `Backup completed successfully.`;
    store.set('last_backup_status', {
      success: true,
      message,
      timestamp: new Date().toISOString(),
      // Shown on the backup tab so staff know where the file went.
      filePath: backupFilePath,
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
let firstCheckTimeoutId = null;
// The first check runs a minute after start (not during start-up), then every hour: an app that
// is open for less than an hour a day still makes its scheduled backups.
const FIRST_CHECK_DELAY_MS = 60 * 1000;
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

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

    // Past today's backup time and none ran today. Count calendar days since the last one, so a
    // weekly or monthly backup waits for its day instead of running every day.
    const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const daysSinceLast = Math.round((startOfDay(now) - startOfDay(lastBackupDate)) / 86400000);
    switch (settings.backup_frequency) {
      case 'weekly':
        return daysSinceLast >= 7;
      case 'monthly':
        return daysSinceLast >= 30;
      default:
        return true;
    }
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

  if (settings.backup_path) {
    const validation = validateBackupPath(settings.backup_path);
    if (!validation.valid) {
      logError(`Backup scheduler not started: ${validation.message}`);
      return;
    }
  }

  log(`Backup scheduler started. Frequency: ${settings.backup_frequency}.`);

  firstCheckTimeoutId = setTimeout(() => {
    firstCheckTimeoutId = null;
    runScheduledBackupIfDue(settings);
  }, FIRST_CHECK_DELAY_MS);
  schedulerIntervalId = setInterval(() => runScheduledBackupIfDue(settings), CHECK_INTERVAL_MS);
};

/**
 * Makes the scheduled backup when it is due.
 * @param {Object} settings - The settings the scheduler was started with.
 */
async function runScheduledBackupIfDue(settings) {
  if (!settings.backup_enabled || !isBackupDue(settings)) return;
  log('Scheduled backup is due. Running now...');
  if (!settings.backup_path) {
    logError('Scheduled backup failed: No backup path configured.');
    return;
  }
  const validation = validateBackupPath(settings.backup_path);
  if (!validation.valid) {
    logError(`Scheduled backup skipped: ${validation.message}`);
    return;
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFilePath = path.join(validation.path, `auto-backup-${timestamp}.qdb`);
  await runBackup(settings, backupFilePath);
}

/**
 * Stops the backup scheduler.
 */
const stopScheduler = () => {
  if (firstCheckTimeoutId) {
    clearTimeout(firstCheckTimeoutId);
    firstCheckTimeoutId = null;
  }
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
  BACKUP_KDF_ITERATIONS,
  generateSignature,
  verifySignature,
  validateBackupPath,
};
