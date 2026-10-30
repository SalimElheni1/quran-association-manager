const fs = require('fs').promises;
const fsSync = require('fs');
const PizZip = require('pizzip');
const path = require('path');
const Store = require('electron-store');
const ExcelJS = require('exceljs');
const { log, error: logError, warn: logWarn } = require('./logger');
const backupManager = require('./backupManager');
const {
  getDatabasePath,
  isDbOpen,
  closeDatabase,
  initializeDatabase,
  getDb,
  dbExec,
  withTransaction,
  runQuery,
  getQuery,
  allQuery,
} = require('../db/db');
const crypto = require('crypto');
const { generateMatricule } = require('./services/matriculeService');
const { setDbSalt } = require('./keyManager');
const { CHANNEL_ROLES } = require('./ipcSecurity');

const CLASS_GENDER_MAP = {
  ذكر: 'men',
  أنثى: 'women',
  مختلط: 'all',
  رجال: 'men',
  نساء: 'women',
  أطفال: 'kids',
  male: 'men',
  female: 'women',
  mixed: 'all',
  male_only: 'men',
  female_only: 'women',
  kids: 'kids',
  all: 'all',
  women: 'women',
  men: 'men',
};

const mainStore = new Store();

/**
 * Extracts raw ZIP buffer from encrypted or plaintext file.
 * Handles auto-detection for legacy unencrypted backups (v1.2.9 or earlier) vs encrypted .qdb files.
 * @param {Buffer} fileBuffer
 * @param {string} [userPassword]
 * @returns {Buffer}
 */
function isZipBuffer(buffer) {
  return (
    Buffer.isBuffer(buffer) &&
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  );
}

/**
 * The transfer keys to try on a backup: the one passed by the caller (read from the settings
 * table before the database is closed), else the legacy store entry.
 * @param {string} [savedTransferKey]
 * @returns {string|undefined}
 */
function resolveTransferKey(savedTransferKey) {
  if (savedTransferKey) return savedTransferKey;
  const settings = mainStore.get('settings') || {};
  return settings.association_transfer_key;
}

async function extractZipFromBuffer(fileBuffer, userPassword, savedTransferKey) {
  if (!Buffer.isBuffer(fileBuffer)) {
    return fileBuffer;
  }

  // Check for PK ZIP magic bytes (0x50 0x4b 0x03 0x04) or short/mock buffers
  if (
    fileBuffer.length < 44 ||
    (fileBuffer[0] === 0x50 &&
      fileBuffer[1] === 0x4b &&
      fileBuffer[2] === 0x03 &&
      fileBuffer[3] === 0x04)
  ) {
    return fileBuffer;
  }

  // Encrypted format: Candidate keys for decryption
  const associationKey = resolveTransferKey(savedTransferKey);
  const { getDbKey } = require('./keyManager');

  const candidateKeys = [userPassword, associationKey, getDbKey()].filter(Boolean);

  for (const key of candidateKeys) {
    try {
      return await backupManager.decryptBackup(fileBuffer, key);
    } catch (err) {
      // Try next key
    }
  }

  return fileBuffer;
}

// The only statements a backup may run: rows going into a table this database already has
// (the schema comes from the app, never from the file). Leading comment lines are allowed.
const BACKUP_ROW_STATEMENT =
  /^(?:--[^\n]*\n\s*)*(?:REPLACE|INSERT(?:\s+OR\s+(?:REPLACE|IGNORE))?)\s+INTO\s+["']?([A-Za-z_]\w*)["']?\s*\(/i;
// Tables a backup never writes into: the migration log decides which migrations still run.
const NON_RESTORABLE_TABLES = new Set(['migrations']);

async function executeSqlScriptSafely(sqlScript) {
  // Get current database tables and their columns
  const tables = await allQuery(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
  );
  const existingTables = new Set(
    tables.map((t) => t.name).filter((name) => !NON_RESTORABLE_TABLES.has(name)),
  );

  // Get column info for each table
  const tableColumns = {};
  for (const table of tables) {
    const columns = await allQuery(`PRAGMA table_info("${table.name}")`);
    tableColumns[table.name] = new Set(columns.map((c) => c.name));
  }

  // Split SQL script into individual statements, respecting string literals,
  // quoted identifiers and comments (semicolons inside strings/comments must
  // not break statements)
  const statements = splitSqlList(sqlScript, ';');

  const validStatements = [];
  const skippedTables = new Set();
  const fixedStatements = [];
  let skippedStatements = 0;
  // What the backup brings, for the fix-ups after the import.
  const tablesWithRows = new Set();
  const legacyUserRoles = [];

  for (const statement of statements) {
    // Anything that is not a row insert (CREATE, DROP, ATTACH, PRAGMA, triggers...) is skipped:
    // a backup file must not be able to change the schema or reach outside the database.
    const match = statement.match(BACKUP_ROW_STATEMENT);
    // Only "(columns) VALUES (...)" rows are restored, not INSERT ... SELECT, which could copy
    // data around the database.
    const columnsMatch = match && statement.match(/\(([^)]+)\)\s*VALUES/i);
    if (!columnsMatch) {
      skippedStatements++;
      continue;
    }
    const tableName = match[1];
    if (!existingTables.has(tableName)) {
      skippedTables.add(tableName);
      continue;
    }

    const columns = splitSqlList(columnsMatch[1], ',').map((col) =>
      col.trim().replace(/^"|"$/g, ''),
    );
    const currentColumns = tableColumns[tableName];
    tablesWithRows.add(tableName);
    if (tableName === 'users' && !currentColumns.has('role')) {
      legacyUserRoles.push(...readLegacyUserRoles(statement, columns));
    }

    // Check if all columns exist
    const invalidColumns = columns.filter((col) => !currentColumns.has(col));

    if (invalidColumns.length > 0) {
      // Fix the statement by removing invalid columns
      const fixed = fixStatementColumns(statement, columns, invalidColumns);
      if (fixed) {
        validStatements.push(fixed);
        fixedStatements.push(`${tableName}: removed columns [${invalidColumns.join(', ')}]`);
      }
      continue;
    }

    validStatements.push(statement);
  }

  if (skippedStatements > 0) {
    log(`Skipped ${skippedStatements} backup statement(s) that do not insert rows.`);
  }
  if (skippedTables.size > 0) {
    logWarn(`Skipped data for non-existent tables: ${Array.from(skippedTables).join(', ')}`);
  }
  if (fixedStatements.length > 0) {
    log(`Fixed column mismatches: ${fixedStatements.join('; ')}`);
  }

  // Execute valid statements
  const finalScript = validStatements.join(';\n');
  if (finalScript.trim()) {
    await dbExec(getDb(), finalScript);
  }
  return { tablesWithRows, legacyUserRoles };
}

// Splits a SQL fragment on a delimiter, ignoring delimiters that appear inside
// single-quoted strings ('', '' escaped), double-quoted identifiers ("" escaped)
// or -- line comments.
function splitSqlList(text, delimiter) {
  const parts = [];
  let current = '';
  let inSingle = false;
  let inDouble = false;
  let inComment = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inComment) {
      current += char;
      if (char === '\n') inComment = false;
      continue;
    }
    if (inSingle) {
      current += char;
      if (char === "'") {
        if (text[i + 1] === "'") {
          current += text[i + 1];
          i++;
        } else {
          inSingle = false;
        }
      }
      continue;
    }
    if (inDouble) {
      current += char;
      if (char === '"') {
        if (text[i + 1] === '"') {
          current += text[i + 1];
          i++;
        } else {
          inDouble = false;
        }
      }
      continue;
    }
    if (char === '-' && text[i + 1] === '-') {
      inComment = true;
      current += char;
      continue;
    }
    if (char === "'") {
      inSingle = true;
      current += char;
      continue;
    }
    if (char === '"') {
      inDouble = true;
      current += char;
      continue;
    }
    if (char === delimiter) {
      const part = current.trim();
      if (part.length > 0) parts.push(part);
      current = '';
      continue;
    }
    current += char;
  }

  const lastPart = current.trim();
  if (lastPart.length > 0) parts.push(lastPart);

  return parts;
}

// Parses the VALUES section of an INSERT/REPLACE statement into an array of
// rows, each row being an array of raw value tokens. Handles multi-row inserts
// (VALUES (...), (...)), parentheses and commas inside string literals, and
// escaped quotes ('').
function parseValuesRows(valuesSection) {
  const rows = [];
  let currentRow = [];
  let currentValue = '';
  let depth = 0;
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < valuesSection.length; i++) {
    const char = valuesSection[i];
    if (inSingle) {
      currentValue += char;
      if (char === "'") {
        if (valuesSection[i + 1] === "'") {
          currentValue += valuesSection[i + 1];
          i++;
        } else {
          inSingle = false;
        }
      }
      continue;
    }
    if (inDouble) {
      currentValue += char;
      if (char === '"') {
        if (valuesSection[i + 1] === '"') {
          currentValue += valuesSection[i + 1];
          i++;
        } else {
          inDouble = false;
        }
      }
      continue;
    }
    if (char === '-' && valuesSection[i + 1] === '-') {
      while (i < valuesSection.length && valuesSection[i] !== '\n') i++;
      continue;
    }
    if (char === "'") {
      inSingle = true;
      currentValue += char;
      continue;
    }
    if (char === '"') {
      inDouble = true;
      currentValue += char;
      continue;
    }
    if (char === '(') {
      if (depth === 0) {
        depth = 1;
      } else {
        depth++;
        currentValue += char;
      }
      continue;
    }
    if (char === ')') {
      if (depth === 1) {
        depth = 0;
        currentRow.push(currentValue.trim());
        currentValue = '';
      } else if (depth > 1) {
        depth--;
        currentValue += char;
      }
      continue;
    }
    if (char === ',' && depth === 1) {
      currentRow.push(currentValue.trim());
      currentValue = '';
      continue;
    }
    if (char === ',' && depth === 0) {
      if (currentRow.length > 0) {
        rows.push(currentRow);
        currentRow = [];
      }
      continue;
    }
    currentValue += char;
  }

  if (currentRow.length > 0) rows.push(currentRow);

  return rows;
}

// The one role per user that backups made before user_roles existed carried in users.role, and
// the role each one is today.
const LEGACY_USER_ROLES = {
  Superadmin: 'Superadmin',
  Admin: 'Administrator',
  Manager: 'Administrator',
  Administrator: 'Administrator',
  FinanceManager: 'FinanceManager',
  SessionSupervisor: 'SessionSupervisor',
};

/** A SQL literal from a VALUES list as a JS value ('it''s' -> it's, NULL -> null). */
function sqlLiteralValue(token) {
  const text = String(token).trim();
  if (/^NULL$/i.test(text)) return null;
  if (text.startsWith("'") && text.endsWith("'")) return text.slice(1, -1).replace(/''/g, "'");
  return text;
}

/**
 * The legacy users.role value of each row of a users insert, by user id.
 * @returns {Array<{id: number, role: string}>}
 */
function readLegacyUserRoles(statement, columns) {
  const idIndex = columns.indexOf('id');
  const roleIndex = columns.indexOf('role');
  if (idIndex === -1 || roleIndex === -1) return [];
  const valuesIndex = statement.search(/\bVALUES\b/i);
  if (valuesIndex === -1) return [];
  return parseValuesRows(statement.slice(valuesIndex + 6))
    .map((values) => ({
      id: Number(sqlLiteralValue(values[idIndex])),
      role: sqlLiteralValue(values[roleIndex]),
    }))
    .filter((row) => Number.isInteger(row.id) && row.role);
}

function fixStatementColumns(statement, columns, invalidColumns) {
  try {
    // Strip leading comment lines before matching the command
    const cleanStatement = statement.replace(/^(--[^\n]*\n\s*)+/, '');
    const command = cleanStatement.match(
      /^(INSERT\s+OR\s+(?:IGNORE|REPLACE)|REPLACE|INSERT)/i,
    )?.[0];
    const tableMatch = cleanStatement.match(
      /(?:REPLACE|INSERT)\s+(?:OR\s+(?:IGNORE|REPLACE)\s+)?INTO\s+["']?([^\s"'(\s]+)["']?/i,
    );
    if (!command || !tableMatch) return null;
    const tableName = tableMatch[1];

    const validIndices = [];
    const validColumns = [];
    columns.forEach((col, idx) => {
      if (!invalidColumns.includes(col)) {
        validIndices.push(idx);
        validColumns.push(`"${col}"`);
      }
    });

    const valuesIndex = cleanStatement.search(/\bVALUES\b/i);
    if (valuesIndex === -1) return null;
    const valuesSection = cleanStatement.slice(valuesIndex + 6);

    const rows = parseValuesRows(valuesSection);
    if (rows.length === 0) return null;

    const fixedRows = rows.map((values) => {
      const validValues = validIndices.map((idx) => (idx < values.length ? values[idx] : 'NULL'));
      return `(${validValues.join(', ')})`;
    });

    return `${command} INTO "${tableName}" (${validColumns.join(', ')}) VALUES ${fixedRows.join(', ')}`;
  } catch (error) {
    logError('Failed to fix statement:', error);
    return null;
  }
}

const WRONG_KEY_MESSAGE =
  'تعذر فتح النسخة الاحتياطية: رمز النسخة الاحتياطية (رمز النقل) غير صحيح، أو الملف ليس نسخة احتياطية صالحة.';

/** A problem with the backup file itself; its message is shown to the user as it is. */
class BackupFileError extends Error {}

/**
 * Opens a backup: decrypts it with the candidate keys, checks its signature, and reads its SQL
 * and salt. Nothing is changed.
 * @returns {Promise<{zip: PizZip, sqlScript: string, salt: string, unsigned: boolean}>}
 *   `unsigned` is true for a plain ZIP without a signature (backups made before version 1.3.0):
 *   nothing proves who made it, so the user confirms before it is restored.
 * @throws {BackupFileError} When the file is not a backup this app can restore.
 */
async function readBackupPackage(filePath, backupPassword, savedTransferKey) {
  const rawBuffer = await fs.readFile(filePath);
  const zipBuffer = await extractZipFromBuffer(rawBuffer, backupPassword, savedTransferKey);
  // AES-GCM authenticates what it decrypts: a decrypted backup was made with one of the keys.
  const decrypted = zipBuffer !== rawBuffer;
  if (!decrypted && rawBuffer.length >= 44 && !isZipBuffer(rawBuffer)) {
    // An encrypted backup that none of the keys could decrypt.
    throw new BackupFileError(WRONG_KEY_MESSAGE);
  }

  const zip = new PizZip(zipBuffer);
  const sqlFile = zip.file('backup.sql');
  const configFile = zip.file('salt.json') || zip.file('config.json'); // config.json: legacy name
  if (!sqlFile || !configFile) {
    throw new BackupFileError('ملف النسخ الاحتياطي غير صالح أو تالف.');
  }
  const sqlScript = sqlFile.asText();

  const signatureFile = zip.file('signature.txt');
  if (signatureFile) {
    const { getDbKey } = require('./keyManager');
    const candidateKeys = [backupPassword, resolveTransferKey(savedTransferKey), getDbKey()].filter(
      Boolean,
    );
    const signature = signatureFile.asText();
    if (!candidateKeys.some((key) => backupManager.verifySignature(sqlScript, key, signature))) {
      throw new BackupFileError(
        'توقيع النسخة الاحتياطية غير مطابق. قد يكون الملف تالفاً أو تم تعديله.',
      );
    }
  }

  let salt = null;
  try {
    salt = JSON.parse(configFile.asNodeBuffer().toString())['db-salt'];
  } catch {
    salt = null;
  }
  if (!salt) {
    throw new BackupFileError('Backup configuration is missing the required salt.');
  }

  return { zip, sqlScript, salt, unsigned: !decrypted && !signatureFile };
}

async function validateDatabaseFile(filePath, backupPassword, savedTransferKey) {
  try {
    const { unsigned } = await readBackupPackage(filePath, backupPassword, savedTransferKey);
    return { isValid: true, unsigned, message: 'تم التحقق من ملف النسخ الاحتياطي بنجاح.' };
  } catch (error) {
    if (error instanceof BackupFileError) return { isValid: false, message: error.message };
    logError('Error during backup validation:', error);
    return { isValid: false, message: `خطأ في قراءة ملف النسخ الاحتياطي: ${error.message}` };
  }
}

// The database files: the main file and SQLite's WAL companions.
const DB_FILE_SUFFIXES = ['', '-wal', '-shm'];
// Where the current database waits while a backup is restored. It stays there afterwards (the
// next restore replaces it), so the data from before the last restore can still be recovered.
const PREVIOUS_DB_SUFFIX = '.pre-restore';

async function renameWithRetry(from, to, retries = 5, delay = 100) {
  for (let i = 0; i < retries; i++) {
    try {
      await fs.rename(from, to);
      return;
    } catch (error) {
      if (error.code === 'EBUSY' && i < retries - 1) {
        logWarn(`EBUSY renaming ${from}, retrying in ${delay}ms (attempt ${i + 1}/${retries})`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
}

async function unlinkWithRetry(filePath, retries = 5, delay = 100) {
  for (let i = 0; i < retries; i++) {
    try {
      await fs.unlink(filePath);
      log(`Successfully unlinked ${filePath}`);
      return;
    } catch (error) {
      if (error.code === 'EBUSY' && i < retries - 1) {
        logWarn(
          `EBUSY error, retrying unlink on ${filePath} in ${delay}ms... (Attempt ${i + 1}/${retries})`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        logError(`Failed to unlink ${filePath} after ${i + 1} attempts.`);
        throw error;
      }
    }
  }
}

/** Moves the database files at `fromPath` (and their -wal/-shm) to `toPath`. */
async function moveDatabaseFiles(fromPath, toPath) {
  for (const suffix of DB_FILE_SUFFIXES) {
    if (fsSync.existsSync(`${toPath}${suffix}`)) await unlinkWithRetry(`${toPath}${suffix}`);
  }
  for (const suffix of DB_FILE_SUFFIXES) {
    if (fsSync.existsSync(`${fromPath}${suffix}`)) {
      await renameWithRetry(`${fromPath}${suffix}`, `${toPath}${suffix}`);
    }
  }
}

/**
 * After a failed restore: drops the half-imported database, puts the previous one back and
 * opens it again, so the app keeps working with the data it had.
 */
async function putPreviousDatabaseBack(currentDbPath, previousDbPath) {
  try {
    if (isDbOpen()) await closeDatabase();
    for (const suffix of DB_FILE_SUFFIXES) {
      if (fsSync.existsSync(`${previousDbPath}${suffix}`)) {
        if (fsSync.existsSync(`${currentDbPath}${suffix}`)) {
          await unlinkWithRetry(`${currentDbPath}${suffix}`);
        }
        await renameWithRetry(`${previousDbPath}${suffix}`, `${currentDbPath}${suffix}`);
      }
    }
    await initializeDatabase();
    log('The database from before the restore is back in place.');
  } catch (error) {
    logError(
      `CRITICAL: could not put the previous database back; it is kept at ${previousDbPath}.`,
      error,
    );
  }
}

/**
 * Backups made before user_roles existed (versions 1.0 and 1.1) kept one role per user in
 * users.role: those users get the matching role. A backup that has user_roles rows is taken as
 * it is; a user it gives no role keeps none (no role is ever made up).
 * @param {{tablesWithRows: Set<string>, legacyUserRoles: Array<{id: number, role: string}>}} imported
 */
async function giveLegacyUsersTheirRole({ tablesWithRows, legacyUserRoles }) {
  if (tablesWithRows.has('user_roles') || legacyUserRoles.length === 0) return;
  log(`Backup without user_roles: mapping the old role of ${legacyUserRoles.length} user(s).`);
  for (const { id, role } of legacyUserRoles) {
    const roleName = Object.hasOwn(LEGACY_USER_ROLES, role) ? LEGACY_USER_ROLES[role] : null;
    if (!roleName) {
      logWarn(`User ${id} had an unknown role in the backup; no role given.`);
      continue;
    }
    const roleRow = await getQuery('SELECT id FROM roles WHERE name = ?', [roleName]);
    if (roleRow) {
      await runQuery('INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [
        id,
        roleRow.id,
      ]);
    }
  }
}

/** Old 6-digit matricules (S-000012) become the 4-digit form (S-0012). */
async function convertLegacyMatricules() {
  log('Checking for matricules that need format conversion...');
  const matriculeTables = [
    { name: 'students', prefix: 'S-' },
    { name: 'teachers', prefix: 'T-' },
    { name: 'users', prefix: 'U-' },
    { name: 'groups', prefix: 'G-' },
    { name: 'inventory_items', prefix: 'INV-' },
  ];

  let matriculeFixes = 0;
  for (const table of matriculeTables) {
    // Find matricules that are longer than expected (old 6-digit format)
    const matriculesToFix = await allQuery(`
        SELECT id, matricule
        FROM ${table.name}
        WHERE matricule IS NOT NULL
          AND LENGTH(matricule) > 0
          AND LENGTH(SUBSTR(matricule, INSTR(matricule, '-') + 1)) > 4
      `);

    for (const record of matriculesToFix) {
      // Extract the numeric part and convert to 4-digit format
      const parts = record.matricule.split('-');
      if (parts.length === 2) {
        const prefix = parts[0] + '-';
        const number = parseInt(parts[1], 10);
        const newMatricule = prefix + number.toString().padStart(4, '0');

        await runQuery(`UPDATE ${table.name} SET matricule = ? WHERE id = ?`, [
          newMatricule,
          record.id,
        ]);

        log(`Converted matricule: ${record.matricule} → ${newMatricule}`);
        matriculeFixes++;
      }
    }
  }

  if (matriculeFixes > 0) {
    log(`Fixed ${matriculeFixes} matricule formats during import.`);
  } else {
    log('All matricules were already in the correct format.');
  }
}

/**
 * Loads the backup's rows into the freshly created database, in one transaction: a failure
 * leaves nothing half imported.
 */
async function importBackupRows(sqlScript) {
  // Foreign keys can only be switched outside a transaction. Rows arrive in table order, so
  // they are off while loading, and always turned back on.
  log('Disabling foreign key constraints for import...');
  await dbExec(getDb(), 'PRAGMA foreign_keys = OFF');
  try {
    await withTransaction(async () => {
      const imported = await executeSqlScriptSafely(sqlScript);
      await giveLegacyUsersTheirRole(imported);
      await convertLegacyMatricules();
    });
    log('Data import completed successfully.');
  } finally {
    log('Re-enabling foreign key constraints...');
    await dbExec(getDb(), 'PRAGMA foreign_keys = ON');
  }
}

/** Writes the backup's student photos and logos into userData/assets. */
function restoreBackupAssets(zip) {
  try {
    const electron = require('electron');
    const app = electron.app;
    if (app && typeof app.getPath === 'function') {
      const targetAssetsDir = path.join(app.getPath('userData'), 'assets');
      if (!fsSync.existsSync(targetAssetsDir)) {
        fsSync.mkdirSync(targetAssetsDir, { recursive: true });
      }
      const assetFiles = zip.file(/^assets\//);
      for (const assetFile of assetFiles) {
        const relativePath = assetFile.name.replace(/^assets\//, '');
        if (relativePath && !assetFile.dir) {
          const destPath = path.resolve(targetAssetsDir, relativePath);
          // Zip entry names are untrusted: never write outside the assets folder.
          if (!destPath.startsWith(path.resolve(targetAssetsDir) + path.sep)) {
            logWarn(`Skipping backup asset outside the assets folder: ${assetFile.name}`);
            continue;
          }
          fsSync.mkdirSync(path.dirname(destPath), { recursive: true });
          fsSync.writeFileSync(destPath, assetFile.asNodeBuffer());
        }
      }
    }
  } catch (assetExtractErr) {
    logWarn('Asset extraction warning:', assetExtractErr.message);
  }
}

/**
 * Replaces the database with a backup, after a safety copy of the current data.
 * The backup is read and checked before anything changes; the current database is moved aside
 * (not deleted) and put back if the import fails.
 * @param {string} importedDbPath The backup file.
 * @param {string} _password The logged-in user's password (checked by the caller).
 * @param {string} [backupPassword] A key typed in the restore dialog.
 * @param {object} [currentSettings] The settings of the current database, read by the caller
 *   while it is still open: the backup folder for the safety copy, and the transfer key.
 */
async function replaceDatabase(importedDbPath, _password, backupPassword, currentSettings) {
  const currentDbPath = getDatabasePath();
  const settings = currentSettings || mainStore.get('settings') || {};
  const savedTransferKey = settings.association_transfer_key;

  let backup;
  try {
    backup = await readBackupPackage(importedDbPath, backupPassword, savedTransferKey);
  } catch (error) {
    if (!(error instanceof BackupFileError)) logError('Failed to read the backup:', error);
    return { success: false, message: `فشل استيراد قاعدة البيانات: ${error.message}` };
  }

  // Auto-backup safeguard
  try {
    if (settings.backup_path) {
      const validation = backupManager.validateBackupPath(settings.backup_path);
      if (!validation.valid) {
        logWarn(`Skipping auto-backup before import: ${validation.message}`);
      } else {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(validation.path, `pre-import-backup-${timestamp}.qdb`);
        log(`Creating safeguard backup before import at: ${backupPath}`);
        await backupManager.runBackup(settings, backupPath);
      }
    } else {
      logWarn('Skipping auto-backup before import: No backup path configured.');
    }
  } catch (e) {
    logError('Failed to create auto-backup before import:', e);
  }

  const previousDbPath = `${currentDbPath}${PREVIOUS_DB_SUFFIX}`;
  try {
    if (isDbOpen()) await closeDatabase();
    log(`Moving the current database aside to ${previousDbPath}...`);
    await moveDatabaseFiles(currentDbPath, previousDbPath);
  } catch (error) {
    logError('Could not move the current database aside:', error);
    await putPreviousDatabaseBack(currentDbPath, previousDbPath);
    return { success: false, message: `فشل استيراد قاعدة البيانات: ${error.message}` };
  }

  try {
    log('Initializing a new database for the backup...');
    await initializeDatabase();
    log('Processing SQL script to import data...');
    await importBackupRows(backup.sqlScript);
  } catch (error) {
    logError('Failed to import the backup; putting the previous database back:', error);
    await putPreviousDatabaseBack(currentDbPath, previousDbPath);
    return {
      success: false,
      message: `فشل استيراد قاعدة البيانات: ${error.message} (بقيت البيانات السابقة كما هي).`,
    };
  }

  setDbSalt(backup.salt);
  log('Salt configuration updated from backup.');
  restoreBackupAssets(backup.zip);

  // Generate missing charges for students after import
  try {
    log('Checking for students without charges...');
    const { checkAndGenerateChargesForAllStudents } = require('./handlers/studentFeeHandlers');
    const chargeGenResult = await checkAndGenerateChargesForAllStudents();
    if (chargeGenResult.success) {
      log(`Generated charges for ${chargeGenResult.studentsProcessed} students.`);
    } else {
      logWarn('Failed to generate charges after import:', chargeGenResult.message);
    }
  } catch (error) {
    logError('Generating charges after the import failed:', error);
  }

  mainStore.set('force-relogin-after-restart', true);
  log('Database import successful. Waiting for renderer to relaunch app.');
  return {
    success: true,
    message: 'تم استيراد قاعدة البيانات بنجاح. سيتم إعادة تشغيل التطبيق الآن.',
  };
}

const REQUIRED_COLUMNS = {
  الطلاب: ['الاسم واللقب'],
  المعلمون: ['الاسم واللقب'],
  المستخدمون: ['اسم المستخدم', 'الاسم الأول', 'اللقب', 'الدور', 'نوع التوظيف'],
  الفصول: ['اسم الفصل', 'معرف المعلم'],
  'العمليات المالية': ['النوع', 'الفئة', 'المبلغ', 'التاريخ', 'طريقة الدفع'],
  'رسوم الطلاب': ['رقم التعريفي', 'المبلغ', 'تاريخ الدفع', 'طريقة الدفع'],
  الحضور: ['الرقم التعريفي للطالب', 'اسم الفصل', 'التاريخ', 'الحالة'],
  المجموعات: ['اسم المجموعة', 'الفئة'],
  المخزون: ['اسم العنصر', 'الفئة', 'الكمية', 'قيمة الوحدة'],
};

const getColumnIndex = (headerRow, headerText) => {
  let index = -1;
  headerRow.eachCell((cell, colNumber) => {
    if (cell.value && cell.value === headerText) {
      index = colNumber;
    }
  });
  return index;
};

// Safe helper to get a cell value from a data row by header text.
// Returns null when the header is not found instead of calling row.getCell(-1).
const getCellValueByHeader = (headerRow, dataRow, headerText) => {
  const idx = getColumnIndex(headerRow, headerText);
  if (!idx || idx < 1) return null;
  try {
    const cell = dataRow.getCell(idx);
    if (!cell) return null;
    // Handle hyperlinks which have a .text property
    return cell.value?.text || cell.value;
  } catch (e) {
    // Defensive: if ExcelJS throws for any reason, return null so import can continue gracefully
    logWarn(`Failed to read cell for header "${headerText}": ${e.message}`);
    return null;
  }
};

// Normalize sheet names for tolerant matching (remove Arabic diacritics, normalize chars, trim)
const normalizeSheetName = (s) => {
  if (!s || typeof s !== 'string') return s;
  // NFKC normalization, remove common Arabic diacritics/tashkeel, collapse spaces
  const withoutDiacritics = s
    .normalize('NFKC')
    .replace(/[\u064B-\u065F\u0610-\u061A\u06D6-\u06ED]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    // map Arabic alef/yaa/taa variants that commonly differ in input files
    .replace(/ى/g, 'ي')
    .replace(/أ|إ|آ/g, 'ا');
  return withoutDiacritics;
};

const findWorksheetTolerant = (workbook, sheetName) => {
  if (!workbook || !sheetName) return null;
  // exact first
  let ws = workbook.getWorksheet(sheetName);
  if (ws) return ws;

  const target = normalizeSheetName(sheetName);
  for (const candidate of workbook.worksheets) {
    if (normalizeSheetName(candidate.name) === target) return candidate;
  }

  // common Arabic plural/singular fallback (quick heuristic)
  if (sheetName === 'المعلمون' || sheetName === 'المعلمين') {
    ws = workbook.getWorksheet(sheetName === 'المعلمون' ? 'المعلمين' : 'المعلمون');
    if (ws) return ws;
  }

  return null;
};

// Parse a human-friendly schedule cell into the internal JSON array format.
// Accepts either a JSON string/array or a simple Arabic string like:
// "الإثنين 08:00-10:00; الأربعاء 09:00-11:00" or "Monday 08:00-10:00|Wednesday 09:00-11:00"
const parseScheduleCell = (raw) => {
  if (!raw) return null;
  // If already a JSON array string or JS array, try parse
  if (typeof raw === 'object') {
    return raw;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    // Try JSON
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {
      // Not JSON, fall through to friendly parse
    }

    // Split on semicolon or pipe
    const parts = trimmed
      .split(/;|\|/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length === 0) return null;

    const arabicDayMap = {
      الاثنين: 'Monday',
      الإثنين: 'Monday',
      الثلاثاء: 'Tuesday',
      الأربعاء: 'Wednesday',
      الخميس: 'Thursday',
      الجمعة: 'Friday',
      السبت: 'Saturday',
      الاحد: 'Sunday',
      الأحد: 'Sunday',
    };

    const enDayMapLower = {
      monday: 'Monday',
      tuesday: 'Tuesday',
      wednesday: 'Wednesday',
      thursday: 'Thursday',
      friday: 'Friday',
      saturday: 'Saturday',
      sunday: 'Sunday',
    };

    const schedule = [];
    for (const part of parts) {
      // Try to capture "day time-range" e.g. "الإثنين 08:00-10:00" or "Monday 08:00-10:00"
      const m = part.match(/^(\S+)\s+([0-2]?\d:[0-5]\d\s*-\s*[0-2]?\d:[0-5]\d)\s*$/);
      if (m) {
        let dayToken = m[1];
        const timeToken = m[2].replace(/\s+/g, '');
        // Map Arabic day to English key if needed
        const dayKey = arabicDayMap[dayToken] || enDayMapLower[dayToken.toLowerCase()] || dayToken;
        schedule.push({ day: dayKey, time: timeToken });
        continue;
      }

      // If not matching the strict pattern, attempt a relaxed parse: find time range then the remaining is day
      const timeMatch = part.match(/([0-2]?\d:[0-5]\d\s*-\s*[0-2]?\d:[0-5]\d)/);
      if (timeMatch) {
        const timeToken = timeMatch[1].replace(/\s+/g, '');
        const dayToken = part.replace(timeMatch[0], '').trim();
        const dayKey = arabicDayMap[dayToken] || enDayMapLower[dayToken.toLowerCase()] || dayToken;
        schedule.push({ day: dayKey, time: timeToken });
        continue;
      }

      // As a last resort, skip badly formatted part
    }

    return schedule.length > 0 ? schedule : null;
  }
  return null;
};

// The channel that writes what each sheet imports. Importing a sheet needs the roles of that
// channel (CHANNEL_ROLES), so the import is never a way around them: a FinanceManager may import
// fee payments but not users, students or classes.
const SHEET_WRITE_CHANNELS = {
  الطلاب: 'students:add',
  المعلمون: 'teachers:add',
  المعلمين: 'teachers:add',
  المستخدمون: 'users:add',
  المستخدمين: 'users:add',
  الفصول: 'classes:add',
  'العمليات المالية': 'transactions:add',
  'رسوم الطلاب': 'student-fees:recordPayment',
  الحضور: 'attendance:save',
  المجموعات: 'groups:add',
  المخزون: 'inventory:add',
};

/**
 * The sheets in `sheetNames` that a user holding `roles` may not import (unknown sheets
 * included).
 * @param {string[]} roles
 * @param {string[]} sheetNames
 * @returns {string[]}
 */
function refusedImportSheets(roles, sheetNames) {
  const userRoles = Array.isArray(roles) ? roles : [];
  return sheetNames.filter((sheet) => {
    const channel = Object.hasOwn(SHEET_WRITE_CHANNELS, sheet) ? SHEET_WRITE_CHANNELS[sheet] : null;
    const allowed = channel ? CHANNEL_ROLES[channel] : null;
    return !allowed || !allowed.some((role) => userRoles.includes(role));
  });
}

// The roles a users sheet may give.
const IMPORTABLE_ROLES = ['Superadmin', 'Administrator', 'FinanceManager', 'SessionSupervisor'];

/** A random 10-character password for an imported account (shown once to the importer). */
function generateImportPassword() {
  const alphabet = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.randomBytes(10), (byte) => alphabet[byte % alphabet.length]).join('');
}

async function importExcelData(filePath, selectedSheets) {
  log(`Starting import with path: ${filePath} and sheets: ${JSON.stringify(selectedSheets)}`);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const results = { successCount: 0, errorCount: 0, errors: [], newUsers: [] };

  const allSheetProcessors = {
    الطلاب: processStudentRow,
    المعلمون: processTeacherRow,
    المعلمين: processTeacherRow, // Added for pluralization
    المستخدمون: processUserRow,
    المستخدمين: processUserRow, // Added for pluralization
    الفصول: processClassRow,
    'العمليات المالية': processTransactionRow,
    'رسوم الطلاب': processStudentFeesRow,
    الحضور: processAttendanceRow,
    المجموعات: processGroupRow,
    المخزون: processInventoryRow,
  };

  if (!Array.isArray(selectedSheets) || selectedSheets.length === 0) {
    throw new Error('No sheets selected for import.');
  }
  const sheetsToProcess = selectedSheets;
  log(`Sheets to process: ${JSON.stringify(sheetsToProcess)}`);

  for (const sheetName of sheetsToProcess) {
    const processor = allSheetProcessors[sheetName];
    if (!processor) {
      logWarn(`No processor found for sheet: ${sheetName}`);
      continue;
    }

    // Try tolerant lookup for worksheet name (accept small variations in Arabic naming)
    let worksheet = findWorksheetTolerant(workbook, sheetName);
    if (!worksheet) {
      if (selectedSheets && selectedSheets.includes(sheetName)) {
        const available = workbook.worksheets.map((w) => w.name).join(', ');
        results.errors.push(
          `ورقة "${sheetName}" المحددة للاستيراد غير موجودة في ملف Excel. الأوراق الموجودة: ${available}`,
        );
        results.errorCount++;
      }
      continue;
    }

    log(`Processing sheet: ${sheetName}`);
    const headerRow = worksheet.getRow(2);
    if (!headerRow.hasValues) {
      results.errors.push(`ورقة "${sheetName}" لا تحتوي على صف الرأس المطلوب.`);
      results.errorCount++;
      continue;
    }

    const required = REQUIRED_COLUMNS[sheetName] || REQUIRED_COLUMNS[sheetName.slice(0, -1)] || [];
    const missingColumns = required.filter((colName) => getColumnIndex(headerRow, colName) === -1);

    if (missingColumns.length > 0) {
      results.errors.push(
        `ورقة "${sheetName}" ينقصها الأعمدة المطلوبة: ${missingColumns.join(', ')}`,
      );
      results.errorCount += worksheet.rowCount - 2; // Approximate error count
      continue; // Skip processing this sheet
    }

    let processedRows = 0;
    log(`Found ${worksheet.rowCount - 2} rows to process in sheet: ${sheetName}`);
    for (let i = 3; i <= worksheet.rowCount; i++) {
      const row = worksheet.getRow(i);
      if (!row.hasValues) continue;
      processedRows++;
      try {
        const result = await processor(row, headerRow);
        if (result.success) {
          results.successCount++;
          if (result.newUser) results.newUsers.push(result.newUser);
        } else {
          results.errorCount++;
          results.errors.push(`[${sheetName}] Row ${i}: ${result.message}`);
        }
      } catch (e) {
        results.errorCount++;
        results.errors.push(`[${sheetName}] Row ${i}: An unexpected error occurred - ${e.message}`);
        logError(`Error processing row ${i} in sheet ${sheetName}:`, e);
      }
    }

    if (processedRows === 0) {
      results.errors.push(
        `[${sheetName}]: لم يتم استيراد أي بيانات. يرجى التحقق من البيانات في الورقة.`,
      );
    }
  }

  log(`Import finished with results: ${JSON.stringify(results)}`);
  return results;
}

async function processStudentRow(row, headerRow) {
  try {
    const genderIdx = getColumnIndex(headerRow, 'الجنس');
    if (genderIdx > 0) {
      const genderCell = row.getCell(genderIdx);
      if (genderCell && genderCell.value) {
        genderCell.value = GENDER_MAP_AR_TO_EN[genderCell.value] || genderCell.value;
      }
    }

    const statusIdx = getColumnIndex(headerRow, 'الحالة');
    if (statusIdx > 0) {
      const statusCell = row.getCell(statusIdx);
      if (statusCell && statusCell.value) {
        statusCell.value = STATUS_MAP_AR_TO_EN[statusCell.value] || statusCell.value;
      }
    }

    const civilStatusIdx = getColumnIndex(headerRow, 'الحالة الاجتماعية (راشد)');
    if (civilStatusIdx > 0) {
      const civilStatusCell = row.getCell(civilStatusIdx);
      if (civilStatusCell && civilStatusCell.value) {
        const civilStatusMap = {
          أعزب: 'single',
          متزوج: 'married',
          مطلق: 'divorced',
          أرمل: 'widowed',
        };
        civilStatusCell.value = civilStatusMap[civilStatusCell.value] || civilStatusCell.value;
      }
    }

    const matricule = getCellValueByHeader(headerRow, row, 'الرقم التعريفي');

    const data = {
      name: getCellValueByHeader(headerRow, row, 'الاسم واللقب'),
      date_of_birth: getCellValueByHeader(headerRow, row, 'تاريخ الميلاد'),
      gender: getCellValueByHeader(headerRow, row, 'الجنس'),
      address: getCellValueByHeader(headerRow, row, 'العنوان'),
      contact_info: getCellValueByHeader(headerRow, row, 'رقم الهاتف'),
      email: getCellValueByHeader(headerRow, row, 'البريد الإلكتروني'),
      status: getCellValueByHeader(headerRow, row, 'الحالة'),
      national_id: getCellValueByHeader(headerRow, row, 'رقم الهوية'),
      memorization_level: getCellValueByHeader(headerRow, row, 'مستوى الحفظ'),
      notes: getCellValueByHeader(headerRow, row, 'ملاحظات'),
      parent_name: getCellValueByHeader(headerRow, row, 'اسم ولي الأمر (طفل)'),
      guardian_relation: getCellValueByHeader(headerRow, row, 'صلة القرابة (طفل)'),
      parent_contact: getCellValueByHeader(headerRow, row, 'هاتف ولي الأمر (طفل)'),
      guardian_email: getCellValueByHeader(headerRow, row, 'البريد الإلكتروني للولي (طفل)'),
      emergency_contact_name: getCellValueByHeader(
        headerRow,
        row,
        'جهة الاتصال في حالات الطوارئ (طفل)',
      ),
      emergency_contact_phone: getCellValueByHeader(headerRow, row, 'هاتف الطوارئ (طفل)'),
      health_conditions: getCellValueByHeader(headerRow, row, 'الحالة الصحية (طفل)'),
      school_name: getCellValueByHeader(headerRow, row, 'اسم المدرسة (طفل)'),
      grade_level: getCellValueByHeader(headerRow, row, 'المستوى الدراسي (طفل)'),
      educational_level: getCellValueByHeader(headerRow, row, 'المستوى التعليمي (راشد)'),
      occupation: getCellValueByHeader(headerRow, row, 'المهنة (راشد)'),
      civil_status: getCellValueByHeader(headerRow, row, 'الحالة الاجتماعية (راشد)'),
      related_family_members: getCellValueByHeader(headerRow, row, 'أفراد العائلة المسجلون (راشد)'),
      fee_category: getCellValueByHeader(headerRow, row, 'فئة الرسوم'),
      sponsor_name: getCellValueByHeader(headerRow, row, 'اسم الكفيل'),
      sponsor_phone: getCellValueByHeader(headerRow, row, 'هاتف الكفيل'),
      sponsor_cin: getCellValueByHeader(headerRow, row, 'رقم هوية الكفيل'),
      financial_assistance_notes: getCellValueByHeader(headerRow, row, 'ملاحظات المساعدة المالية'),
    };

    if (!data.name) return { success: false, message: 'اسم الطالب مطلوب.' };

    const fields = Object.keys(data).filter((k) => data[k] !== null && data[k] !== undefined);

    if (matricule) {
      // Update existing record
      const existingStudent = await getQuery('SELECT id FROM students WHERE matricule = ?', [
        matricule,
      ]);
      if (!existingStudent) {
        return { success: false, message: `الطالب بالرقم التعريفي "${matricule}" غير موجود.` };
      }

      if (fields.length === 0) {
        return { success: true, message: 'لا يوجد بيانات لتحديثها.' }; // Nothing to update
      }

      const setClauses = fields.map((field) => `${field} = ?`).join(', ');
      const values = [...fields.map((k) => data[k]), matricule];
      await runQuery(`UPDATE students SET ${setClauses} WHERE matricule = ?`, values);
      return { success: true };
    }
    // Insert new record
    const existingStudent = await getQuery(
      'SELECT id FROM students WHERE name = ? OR national_id = ?',
      [data.name, data.national_id],
    );
    if (existingStudent) {
      return { success: false, message: `الطالب "${data.name}" موجود بالفعل.` };
    }

    const newMatricule = await generateMatricule('student');
    const allData = { ...data, matricule: newMatricule };

    const allFields = Object.keys(allData).filter(
      (k) => allData[k] !== null && allData[k] !== undefined,
    );
    const placeholders = allFields.map(() => '?').join(', ');
    const values = allFields.map((k) => allData[k]);

    await runQuery(
      `INSERT INTO students (${allFields.join(', ')}) VALUES (${placeholders})`,
      values,
    );
    return { success: true };
  } catch (error) {
    logError('Error processing student row:', error);
    return { success: false, message: `حدث خطأ غير متوقع: ${error.message}` };
  }
}

async function processTeacherRow(row, headerRow) {
  try {
    const genderIdx = getColumnIndex(headerRow, 'الجنس');
    if (genderIdx > 0) {
      const genderCell = row.getCell(genderIdx);
      if (genderCell && genderCell.value) {
        genderCell.value = GENDER_MAP_AR_TO_EN[genderCell.value] || genderCell.value;
      }
    }

    const matricule = getCellValueByHeader(headerRow, row, 'الرقم التعريفي');

    const data = {
      name: getCellValueByHeader(headerRow, row, 'الاسم واللقب'),
      national_id: getCellValueByHeader(headerRow, row, 'رقم الهوية'),
      contact_info: getCellValueByHeader(headerRow, row, 'رقم الهاتف'),
      email: getCellValueByHeader(headerRow, row, 'البريد الإلكتروني'),
      gender: getCellValueByHeader(headerRow, row, 'الجنس'),
      address: getCellValueByHeader(headerRow, row, 'العنوان'),
      date_of_birth: getCellValueByHeader(headerRow, row, 'تاريخ الميلاد'),
      educational_level: getCellValueByHeader(headerRow, row, 'المستوى التعليمي'),
      specialization: getCellValueByHeader(headerRow, row, 'التخصص'),
      years_of_experience: getCellValueByHeader(headerRow, row, 'سنوات الخبرة'),
      availability: getCellValueByHeader(headerRow, row, 'أوقات التوفر'),
      notes: getCellValueByHeader(headerRow, row, 'ملاحظات'),
    };

    if (!data.name) return { success: false, message: 'اسم المعلم مطلوب.' };

    const fields = Object.keys(data).filter((k) => data[k] !== null && data[k] !== undefined);

    if (matricule) {
      // Update existing record
      const existingTeacher = await getQuery('SELECT id FROM teachers WHERE matricule = ?', [
        matricule,
      ]);
      if (!existingTeacher) {
        return { success: false, message: `المعلم بالرقم التعريفي "${matricule}" غير موجود.` };
      }

      if (fields.length === 0) {
        return { success: true, message: 'لا يوجد بيانات لتحديثها.' };
      }

      const setClauses = fields.map((field) => `${field} = ?`).join(', ');
      const values = [...fields.map((k) => data[k]), matricule];
      await runQuery(`UPDATE teachers SET ${setClauses} WHERE matricule = ?`, values);
      return { success: true };
    }
    // Insert new record
    const existingTeacher = await getQuery('SELECT id FROM teachers WHERE national_id = ?', [
      data.national_id,
    ]);
    if (existingTeacher) {
      return { success: false, message: `المعلم برقم الهوية "${data.national_id}" موجود بالفعل.` };
    }

    const newMatricule = await generateMatricule('teacher');
    const allData = { ...data, matricule: newMatricule };

    const allFields = Object.keys(allData).filter(
      (k) => allData[k] !== null && allData[k] !== undefined,
    );
    const placeholders = allFields.map(() => '?').join(', ');
    const values = allFields.map((k) => allData[k]);

    await runQuery(
      `INSERT INTO teachers (${allFields.join(', ')}) VALUES (${placeholders})`,
      values,
    );
    return { success: true };
  } catch (error) {
    logError('Error processing teacher row:', error);
    return { success: false, message: error.message };
  }
}

async function processUserRow(row, headerRow) {
  try {
    const matricule = getCellValueByHeader(headerRow, row, 'الرقم التعريفي');

    // Get the role from the template (might be in English)
    const roleValue = getCellValueByHeader(headerRow, row, 'الدور');
    // Map common role names to database format if needed
    const roleMappings = {
      Superadmin: 'Superadmin',
      Administrator: 'Administrator',
      FinanceManager: 'FinanceManager',
      SessionSupervisor: 'SessionSupervisor',
      Manager: 'Administrator', // Fallback mapping for template
      مدير: 'Administrator',
      محاسب: 'FinanceManager',
    };

    const mappedRole = Object.hasOwn(roleMappings, roleValue) ? roleMappings[roleValue] : roleValue;

    const data = {
      username: getCellValueByHeader(headerRow, row, 'اسم المستخدم'),
      first_name: getCellValueByHeader(headerRow, row, 'الاسم الأول'),
      last_name: getCellValueByHeader(headerRow, row, 'اللقب'),
      employment_type: getCellValueByHeader(headerRow, row, 'نوع التوظيف'),
      date_of_birth: getCellValueByHeader(headerRow, row, 'تاريخ الميلاد'),
      national_id: getCellValueByHeader(headerRow, row, 'رقم الهوية'),
      email: getCellValueByHeader(headerRow, row, 'البريد الإلكتروني'),
      phone_number: getCellValueByHeader(headerRow, row, 'رقم الهاتف'),
      occupation: getCellValueByHeader(headerRow, row, 'المهنة'),
      civil_status: getCellValueByHeader(headerRow, row, 'الحالة الاجتماعية'),
      start_date: getCellValueByHeader(headerRow, row, 'تاريخ البدء'),
      end_date: getCellValueByHeader(headerRow, row, 'تاريخ الانتهاء'),
      status: getCellValueByHeader(headerRow, row, 'الحالة'),
      notes: getCellValueByHeader(headerRow, row, 'ملاحظات'),
    };

    if (
      !data.username ||
      !data.first_name ||
      !data.last_name ||
      !mappedRole ||
      !data.employment_type
    ) {
      return {
        success: false,
        message: 'اسم المستخدم، الاسم الأول، اللقب، الدور، ونوع التوظيف هي حقول مطلوبة.',
      };
    }

    if (!IMPORTABLE_ROLES.includes(mappedRole)) {
      return { success: false, message: `الدور "${roleValue}" غير معروف.` };
    }

    if (matricule) {
      // Update existing record - need to handle user roles
      const existingUser = await getQuery('SELECT id FROM users WHERE matricule = ?', [matricule]);
      if (!existingUser) {
        return { success: false, message: `المستخدم بالرقم التعريفي "${matricule}" غير موجود.` };
      }

      // Same rule as users:update: the last active Superadmin keeps the role and stays active.
      const {
        isLastActiveSuperadmin,
        LAST_SUPERADMIN_MESSAGE,
      } = require('./handlers/userHandlers');
      const losesSuperadmin =
        mappedRole !== 'Superadmin' || (data.status && data.status !== 'active');
      if (losesSuperadmin && (await isLastActiveSuperadmin(existingUser.id))) {
        return { success: false, message: LAST_SUPERADMIN_MESSAGE };
      }

      return await withTransaction(async () => {
        // Update basic user data
        const fields = Object.keys(data).filter((k) => data[k] !== null && data[k] !== undefined);
        if (fields.length > 0) {
          const setClauses = fields.map((field) => `${field} = ?`).join(', ');
          const values = [...fields.map((k) => data[k]), matricule];
          await runQuery(`UPDATE users SET ${setClauses} WHERE matricule = ?`, values);
        }

        // Update roles - remove existing and add new
        await runQuery('DELETE FROM user_roles WHERE user_id = ?', [existingUser.id]);

        // Get role ID and assign
        const roleRecord = await getQuery('SELECT id FROM roles WHERE name = ?', [mappedRole]);
        if (roleRecord) {
          await runQuery('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [
            existingUser.id,
            roleRecord.id,
          ]);
        }

        return { success: true };
      });
    }

    // Insert new record
    const existingUser = await getQuery('SELECT id FROM users WHERE username = ?', [data.username]);
    if (existingUser) {
      return { success: false, message: `المستخدم "${data.username}" موجود بالفعل.` };
    }

    const password = generateImportPassword();
    const newMatricule = await generateMatricule('user');

    return await withTransaction(async () => {
      // Insert main user record
      const allFields = Object.keys(data).filter((k) => data[k] !== null && data[k] !== undefined);
      const userFields = [...allFields, 'matricule', 'password'];
      const placeholders = userFields.map(() => '?').join(', ');
      const values = [
        ...allFields.map((k) => data[k]),
        newMatricule,
        require('bcryptjs').hashSync(password, 10),
      ];

      const result = await runQuery(
        `INSERT INTO users (${userFields.join(', ')}) VALUES (${placeholders})`,
        values,
      );

      // Assign role
      const roleRecord = await getQuery('SELECT id FROM roles WHERE name = ?', [mappedRole]);
      if (!roleRecord) {
        throw new Error(`Role "${mappedRole}" not found.`);
      }
      await runQuery('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)', [
        result.id,
        roleRecord.id,
      ]);

      return { success: true, newUser: { username: data.username, password } };
    });
  } catch (error) {
    logError('Error processing user row:', error);
    return { success: false, message: `حدث خطأ غير متوقع: ${error.message}` };
  }
}

async function processClassRow(row, headerRow) {
  try {
    // Accept either teacher matricule (معرف المعلم) or teacher name (اسم المعلم)
    const teacherMatricule = getCellValueByHeader(headerRow, row, 'معرف المعلم');
    const teacherName = getCellValueByHeader(headerRow, row, 'اسم المعلم');

    let teacher = null;
    if (teacherMatricule) {
      // A class is never assigned to a deleted teacher.
      teacher = await getQuery(
        'SELECT id FROM teachers WHERE matricule = ? AND deleted_at IS NULL',
        [teacherMatricule],
      );
      if (!teacher) {
        return { success: false, message: `لم يتم العثور على معلم بالمعرف "${teacherMatricule}".` };
      }
    } else if (teacherName) {
      // Try to find teacher by name (case-insensitive)
      teacher = await getQuery(
        'SELECT id FROM teachers WHERE LOWER(name) = LOWER(?) AND deleted_at IS NULL',
        [teacherName],
      );
      if (!teacher) {
        // Try a LIKE search as fallback
        const likeMatch = await getQuery(
          'SELECT id FROM teachers WHERE name LIKE ? AND deleted_at IS NULL',
          [`%${teacherName}%`],
        );
        if (likeMatch) teacher = likeMatch;
      }
      if (!teacher) {
        return { success: false, message: `لم يتم العثور على معلم بالاسم "${teacherName}".` };
      }
    } else {
      return { success: false, message: 'معرف المعلم أو اسم المعلم مطلوب.' };
    }

    const rawSchedule =
      getCellValueByHeader(headerRow, row, 'الجدول الزمني (JSON)') ||
      getCellValueByHeader(headerRow, row, 'الجدول الزمني');
    let parsedSchedule = null;
    try {
      parsedSchedule = parseScheduleCell(rawSchedule);
    } catch (e) {
      parsedSchedule = null;
    }

    const data = {
      name: getCellValueByHeader(headerRow, row, 'اسم الفصل'),
      teacher_id: teacher.id,
      class_type: getCellValueByHeader(headerRow, row, 'نوع الفصل'),
      schedule: parsedSchedule ? JSON.stringify(parsedSchedule) : rawSchedule || null,
      start_date: getCellValueByHeader(headerRow, row, 'تاريخ البدء'),
      end_date: getCellValueByHeader(headerRow, row, 'تاريخ الانتهاء'),
      status: getCellValueByHeader(headerRow, row, 'الحالة'),
      capacity: getCellValueByHeader(headerRow, row, 'السعة'),
      gender: getCellValueByHeader(headerRow, row, 'الجنس'),
    };

    // Normalize class gender to allowed DB values
    try {
      if (data.gender) {
        const rawGender = String(data.gender).trim();
        const lower = rawGender.toLowerCase();
        data.gender = CLASS_GENDER_MAP[rawGender] || CLASS_GENDER_MAP[lower] || data.gender;
      }
    } catch (e) {
      /* ignore and keep original */
    }

    // Normalize class status to DB keys
    try {
      if (data.status) {
        const rawStatus = String(data.status).trim();
        data.status =
          CLASS_STATUS_MAP[rawStatus] || CLASS_STATUS_MAP[rawStatus.toLowerCase()] || data.status;
      }
    } catch (e) {
      /* ignore and keep original */
    }

    if (!data.name) {
      return { success: false, message: 'اسم الفصل مطلوب.' };
    }

    const fields = Object.keys(data).filter((k) => data[k] !== null && data[k] !== undefined);
    const placeholders = fields.map(() => '?').join(', ');
    const values = fields.map((k) => data[k]);

    await runQuery(`INSERT INTO classes (${fields.join(', ')}) VALUES (${placeholders})`, values);
    return { success: true };
  } catch (error) {
    logError('Error processing class row:', error);
    return { success: false, message: `حدث خطأ غير متوقع: ${error.message}` };
  }
}

async function processTransactionRow(row, headerRow) {
  // Arabic translations for transaction types and payment methods
  const TRANSACTION_TYPE_MAP = {
    مدخول: 'INCOME',
    مصروف: 'EXPENSE',
    إيراد: 'INCOME',
    مصاريف: 'EXPENSE',
  };

  const PAYMENT_METHOD_MAP = {
    نقدي: 'CASH',
    شيك: 'CHECK',
    تحويل: 'TRANSFER',
    'تحويل بنكي': 'TRANSFER',
  };

  // Map old category names to new ones
  const CATEGORY_MAP = {
    'رواتب المعلمين': 'منح ومرتبات',
    'رواتب الإداريين': 'منح ومرتبات',
    الإيجار: 'كراء وفواتير',
    'الكهرباء والماء': 'كراء وفواتير',
    القرطاسية: 'لوازم مكتبية وصيانة',
    الصيانة: 'لوازم مكتبية وصيانة',
    'مصاريف أخرى': 'نفقات متنوعة',
  };

  // Get data
  const rawType = row.getCell(getColumnIndex(headerRow, 'النوع')).value;
  const rawCategory = row.getCell(getColumnIndex(headerRow, 'الفئة')).value;
  const rawPaymentMethod = row.getCell(getColumnIndex(headerRow, 'طريقة الدفع')).value;

  const data = {
    type: TRANSACTION_TYPE_MAP[rawType] || rawType,
    category: CATEGORY_MAP[rawCategory] || rawCategory,
    receipt_type: row.getCell(getColumnIndex(headerRow, 'نوع الوصل')).value,
    amount: row.getCell(getColumnIndex(headerRow, 'المبلغ')).value,
    transaction_date: row.getCell(getColumnIndex(headerRow, 'التاريخ')).value,
    description: row.getCell(getColumnIndex(headerRow, 'الوصف')).value,
    payment_method: PAYMENT_METHOD_MAP[rawPaymentMethod] || rawPaymentMethod,
    check_number: row.getCell(getColumnIndex(headerRow, 'رقم الشيك')).value,
    voucher_number: row.getCell(getColumnIndex(headerRow, 'رقم الوصل')).value,
    related_person_name: row.getCell(getColumnIndex(headerRow, 'اسم الشخص')).value,
  };

  // Validation
  if (
    !data.type ||
    !data.category ||
    !data.amount ||
    !data.transaction_date ||
    !data.payment_method
  )
    return { success: false, message: 'النوع، الفئة، المبلغ، التاريخ، وطريقة الدفع مطلوبة.' };

  // Validate transaction type
  if (!['INCOME', 'EXPENSE'].includes(data.type)) {
    return {
      success: false,
      message: 'النوع يجب أن يكون مدخول أو مصروف (أو إيراد أو مصاريف)',
    };
  }

  // Validate category exists in database
  const validCategories = await allQuery(
    'SELECT name FROM categories WHERE type = ? AND is_active = 1',
    [data.type === 'INCOME' ? 'INCOME' : 'EXPENSE'],
  );
  const categoryNames = validCategories.map((cat) => cat.name);

  if (!categoryNames.includes(data.category)) {
    return {
      success: false,
      message: `الفئة "${data.category}" غير موجودة في قاعدة البيانات. الفئات الصالحة: ${categoryNames.join(', ')}`,
    };
  }

  // Validate receipt type for cash donations
  const VALID_RECEIPT_TYPES = ['تبرع', 'هبة', 'صدقة', 'زكاة'];
  const receiptTypeIndex = getColumnIndex(headerRow, 'نوع الوصل');

  if (data.category === 'التبرعات النقدية' && receiptTypeIndex !== -1 && !data.receipt_type) {
    return { success: false, message: 'نوع الوصل مطلوب للتبرعات النقدية.' };
  }

  if (data.receipt_type && !VALID_RECEIPT_TYPES.includes(data.receipt_type)) {
    return {
      success: false,
      message: `نوع الوصل غير صالح. الأنواع الصالحة: ${VALID_RECEIPT_TYPES.join(', ')}`,
    };
  }

  // Validate payment method
  if (!['CASH', 'CHECK', 'TRANSFER'].includes(data.payment_method)) {
    return {
      success: false,
      message: 'طريقة الدفع يجب أن تكون نقدي، شيك، أو تحويل (بنكي)',
    };
  }

  // 500 TND rule - Arabic translation
  if (data.amount > 500 && data.payment_method === 'CASH')
    return {
      success: false,
      message: 'المبالغ التي تتجاوز 500 دينار يجب أن تكون عبر شيك أو تحويل بنكي.',
    };

  // Generate matricule
  const year = new Date(data.transaction_date).getFullYear();
  const prefix = data.type === 'INCOME' ? 'I' : 'E';
  const lastTransaction = await getQuery(
    `SELECT matricule FROM transactions WHERE type = ? AND matricule LIKE ? ORDER BY id DESC LIMIT 1`,
    [data.type, `${prefix}-${year}-%`],
  );
  let sequence = 1;
  if (lastTransaction?.matricule) {
    const lastSeq = parseInt(lastTransaction.matricule.split('-')[2]);
    sequence = lastSeq + 1;
  }
  const matricule = `${prefix}-${year}-${sequence.toString().padStart(3, '0')}`;

  // Generate voucher number ONLY if not provided (user's request)
  if (!data.voucher_number) {
    const { generateVoucherNumber } = require('./services/voucherService');
    data.voucher_number = await generateVoucherNumber();
  }

  return withTransaction(async () => {
    const sql = `INSERT INTO transactions (
      matricule, type, category, receipt_type, amount, transaction_date, description,
      payment_method, check_number, voucher_number, account_id, related_person_name,
      requires_dual_signature
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`;

    await runQuery(sql, [
      matricule,
      data.type,
      data.category,
      data.receipt_type || null,
      data.amount,
      data.transaction_date,
      data.description || null,
      data.payment_method,
      data.check_number || null,
      data.voucher_number,
      data.related_person_name || null,
      data.amount > 500 ? 1 : 0,
    ]);

    const adjustment = data.type === 'INCOME' ? data.amount : -data.amount;
    await runQuery('UPDATE accounts SET current_balance = current_balance + ? WHERE id = 1', [
      adjustment,
    ]);

    return { success: true };
  });
}

async function processAttendanceRow(row, headerRow) {
  const statusIdx = getColumnIndex(headerRow, 'الحالة');
  if (statusIdx > 0) {
    const statusAr = row.getCell(statusIdx)?.value;
    if (statusAr) {
      row.getCell(statusIdx).value = ATTENDANCE_MAP_AR_TO_EN[statusAr] || statusAr;
    }
  }

  const studentMatricule = getCellValueByHeader(headerRow, row, 'الرقم التعريفي للطالب');
  const className = getCellValueByHeader(headerRow, row, 'اسم الفصل');
  if (!studentMatricule || !className) {
    return { success: false, message: 'الرقم التعريفي للطالب واسم الفصل مطلوبان.' };
  }
  const student = await getQuery('SELECT id FROM students WHERE matricule = ?', [studentMatricule]);
  if (!student) {
    return {
      success: false,
      message: `لم يتم العثور على طالب بالرقم التعريفي "${studentMatricule}".`,
    };
  }
  const classData = await getQuery('SELECT id FROM classes WHERE name = ? AND deleted_at IS NULL', [
    className,
  ]);
  if (!classData) return { success: false, message: `لم يتم العثور على فصل باسم "${className}".` };
  const data = {
    student_id: student.id,
    class_id: classData.id,
    date: getCellValueByHeader(headerRow, row, 'التاريخ'),
    status: getCellValueByHeader(headerRow, row, 'الحالة'),
  };
  if (!data.date || !data.status) return { success: false, message: 'التاريخ والحالة مطلوبان.' };
  const fields = Object.keys(data).filter((k) => data[k] !== null && data[k] !== undefined);
  const placeholders = fields.map(() => '?').join(', ');
  const values = fields.map((k) => data[k]);
  await runQuery(`INSERT INTO attendance (${fields.join(', ')}) VALUES (${placeholders})`, values);
  return { success: true };
}

async function processGroupRow(row, headerRow) {
  try {
    const matricule = getCellValueByHeader(headerRow, row, 'الرقم التعريفي');
    const name = getCellValueByHeader(headerRow, row, 'اسم المجموعة');
    const description = getCellValueByHeader(headerRow, row, 'الوصف');
    const category = getCellValueByHeader(headerRow, row, 'الفئة');

    if (!name || !category) {
      return { success: false, message: 'عمود اسم المجموعة أو الفئة غير موجود.' };
    }

    const data = {
      name,
      description,
      category,
    };

    if (!data.name || !data.category) {
      return { success: false, message: 'اسم المجموعة والفئة مطلوبان.' };
    }

    const fields = Object.keys(data).filter((k) => data[k] !== null && data[k] !== undefined);

    if (matricule) {
      // Update existing record
      const existingGroup = await getQuery('SELECT id FROM groups WHERE matricule = ?', [
        matricule,
      ]);
      if (!existingGroup) {
        return { success: false, message: `المجموعة بالرقم التعريفي "${matricule}" غير موجودة.` };
      }

      if (fields.length === 0) {
        return { success: true, message: 'لا يوجد بيانات لتحديثها.' };
      }

      const setClauses = fields.map((field) => `${field} = ?`).join(', ');
      const values = [...fields.map((k) => data[k]), matricule];
      await runQuery(`UPDATE groups SET ${setClauses} WHERE matricule = ?`, values);
      return { success: true };
    }

    // Insert new record
    const existingGroup = await getQuery('SELECT id FROM groups WHERE name = ?', [data.name]);
    if (existingGroup) {
      return { success: false, message: `المجموعة "${data.name}" موجودة بالفعل.` };
    }

    const newMatricule = await generateMatricule('group');
    const allData = { ...data, matricule: newMatricule };

    const allFields = Object.keys(allData).filter(
      (k) => allData[k] !== null && allData[k] !== undefined,
    );
    const placeholders = allFields.map(() => '?').join(', ');
    const values = allFields.map((k) => allData[k]);
    await runQuery(`INSERT INTO groups (${allFields.join(', ')}) VALUES (${placeholders})`, values);
    return { success: true };
  } catch (error) {
    logError('Error processing group row:', error);
    return { success: false, message: `حدث خطأ غير متوقع: ${error.message}` };
  }
}

async function processInventoryRow(row, headerRow) {
  try {
    const conditionMap = {
      جديد: 'New',
      جيد: 'Good',
      مقبول: 'Fair',
      رديء: 'Poor',
    };

    const data = {
      item_name: getCellValueByHeader(headerRow, row, 'اسم العنصر'),
      category: getCellValueByHeader(headerRow, row, 'الفئة'),
      quantity: getCellValueByHeader(headerRow, row, 'الكمية'),
      unit_value: getCellValueByHeader(headerRow, row, 'قيمة الوحدة'),
      acquisition_date: getCellValueByHeader(headerRow, row, 'تاريخ الاقتناء'),
      acquisition_source: getCellValueByHeader(headerRow, row, 'مصدر الاقتناء'),
      condition_status: getCellValueByHeader(headerRow, row, 'الحالة'),
      location: getCellValueByHeader(headerRow, row, 'موقع التخزين'),
      notes: getCellValueByHeader(headerRow, row, 'ملاحظات'),
    };

    if (
      !data.item_name ||
      !data.category ||
      data.quantity === null ||
      data.quantity === undefined ||
      !data.unit_value
    ) {
      return { success: false, message: 'اسم العنصر، الفئة، الكمية، وقيمة الوحدة مطلوبة.' };
    }

    // Check if item already exists - if so, update quantity instead of rejecting
    const existingItem = await getQuery(
      'SELECT id, quantity, unit_value FROM inventory_items WHERE item_name = ? COLLATE NOCASE AND deleted_at IS NULL',
      [data.item_name],
    );
    if (existingItem) {
      // Update existing item: add to quantity and recalculate total_value
      const newQuantity = existingItem.quantity + data.quantity;
      const newTotalValue = newQuantity * existingItem.unit_value;
      await runQuery('UPDATE inventory_items SET quantity = ?, total_value = ? WHERE id = ?', [
        newQuantity,
        newTotalValue,
        existingItem.id,
      ]);
      return {
        success: true,
        message: `تم تحديث كمية "${data.item_name}" إلى ${newQuantity} وقيمة إجمالية ${newTotalValue.toFixed(2)}.`,
      };
    }

    if (data.condition_status && conditionMap[data.condition_status]) {
      data.condition_status = conditionMap[data.condition_status];
    }

    const total_value = data.quantity * data.unit_value;
    const newMatricule = await generateMatricule('inventory');

    const allData = {
      ...data,
      matricule: newMatricule,
      total_value,
    };

    const allFields = Object.keys(allData).filter(
      (k) => allData[k] !== null && allData[k] !== undefined,
    );
    const placeholders = allFields.map(() => '?').join(', ');
    const values = allFields.map((k) => allData[k]);

    await runQuery(
      `INSERT INTO inventory_items (${allFields.join(', ')}) VALUES (${placeholders})`,
      values,
    );
    return { success: true };
  } catch (error) {
    logError('Error processing inventory row:', error);
    return { success: false, message: `حدث خطأ غير متوقع: ${error.message}` };
  }
}

const GENDER_MAP_AR_TO_EN = { ذكر: 'Male', أنثى: 'Female' };
const STATUS_MAP_AR_TO_EN = { نشط: 'active', 'غير نشط': 'inactive' };
const ATTENDANCE_MAP_AR_TO_EN = {
  حاضر: 'present',
  غائب: 'absent',
};

// Mapping for class status values (database uses: 'pending','active','completed')
const CLASS_STATUS_MAP = {
  'قيد الانتظار': 'pending',
  قيد_الانتظار: 'pending',
  pending: 'pending',
  نشط: 'active',
  active: 'active',
  مكتمل: 'completed',
  completed: 'completed',
};

async function processStudentFeesRow(row, headerRow) {
  try {
    // Helper function to get and trim cell values, preserving leading zeros for receipt numbers
    const getTrimmedCellValue = (headerText, preserveLeadingZeros = false) => {
      const cell = row.getCell(getColumnIndex(headerRow, headerText));
      if (!cell || !cell.value) return null;
      const value = cell.value;
      if (preserveLeadingZeros && typeof value === 'number') {
        return String(value).padStart(3, '0');
      }
      return String(value).trim();
    };

    // Payment method mapping
    const PAYMENT_METHOD_MAP = {
      نقدي: 'CASH',
      شيك: 'CHECK',
      تحويل: 'TRANSFER',
      'تحويل بنكي': 'TRANSFER',
    };

    // Payment type mapping
    const PAYMENT_TYPE_MAP = {
      'رسوم شهرية': 'MONTHLY',
      'رسوم سنوية': 'ANNUAL',
      'رسوم خاصة': 'SPECIAL',
      MONTHLY: 'MONTHLY',
      ANNUAL: 'ANNUAL',
      SPECIAL: 'SPECIAL',
    };

    const data = {
      student_matricule: getTrimmedCellValue('رقم التعريفي'),
      amount: getTrimmedCellValue('المبلغ'),
      payment_date: getTrimmedCellValue('تاريخ الدفع'),
      payment_method: getTrimmedCellValue('طريقة الدفع'),
      payment_type: getTrimmedCellValue('نوع الدفعة'),
      class_matricule: getTrimmedCellValue('رقم تعريفي الفصل'),
      academic_year: getTrimmedCellValue('السنة الدراسية'),
      receipt_number: getTrimmedCellValue('رقم الوصل', true),
      check_number: getTrimmedCellValue('رقم الشيك', true),
      notes: getTrimmedCellValue('ملاحظات'),
    };

    // Validation with better error messages
    if (!data.student_matricule) {
      return { success: false, message: 'رقم التعريفي للطالب مطلوب.' };
    }
    if (!data.amount || isNaN(parseFloat(data.amount)) || parseFloat(data.amount) <= 0) {
      return {
        success: false,
        message: `المبلغ غير صالح: "${data.amount}". يجب أن يكون رقماً موجباً.`,
      };
    }
    if (!data.payment_date) {
      return { success: false, message: 'تاريخ الدفع مطلوب.' };
    }
    if (!data.payment_method) {
      return { success: false, message: 'طريقة الدفع مطلوبة.' };
    }

    // Validate student exists
    const student = await getQuery('SELECT id FROM students WHERE matricule = ?', [
      data.student_matricule,
    ]);
    if (!student) {
      return {
        success: false,
        message: `الطالب بالرقم التعريفي "${data.student_matricule}" غير موجود.`,
      };
    }

    // Map payment method
    const mappedPaymentMethod = PAYMENT_METHOD_MAP[data.payment_method] || data.payment_method;
    if (!['CASH', 'CHECK', 'TRANSFER'].includes(mappedPaymentMethod)) {
      return { success: false, message: 'طريقة الدفع يجب أن تكون نقدي، شيك، أو تحويل.' };
    }

    // Map payment type
    const mappedPaymentType = PAYMENT_TYPE_MAP[data.payment_type] || data.payment_type;
    if (!['MONTHLY', 'ANNUAL', 'SPECIAL'].includes(mappedPaymentType)) {
      return { success: false, message: 'نوع الدفعة يجب أن يكون رسوم شهرية، سنوية، أو خاصة.' };
    }

    // For SPECIAL payments, validate class exists if class_matricule is provided
    let classId = null;
    if (mappedPaymentType === 'SPECIAL' && data.class_matricule) {
      const classData = await getQuery('SELECT id FROM classes WHERE matricule = ?', [
        data.class_matricule,
      ]);
      if (!classData) {
        return {
          success: false,
          message: `الفصل بالرقم التعريفي "${data.class_matricule}" غير موجود.`,
        };
      }
      classId = data.class_matricule;
    }

    if (!data.receipt_number) {
      const year = new Date(data.payment_date).getFullYear();
      const lastPayment = await getQuery(
        'SELECT receipt_number FROM student_payments WHERE receipt_number LIKE ? ORDER BY id DESC LIMIT 1',
        [`RCP-${year}-%`],
      );
      let sequence = 1;
      if (lastPayment?.receipt_number) {
        const lastSeq = parseInt(lastPayment.receipt_number.split('-')[2]);
        sequence = lastSeq + 1;
      }
      data.receipt_number = `RCP-${year}-${sequence.toString().padStart(4, '0')}`;
    } else {
      const existingPayment = await getQuery(
        'SELECT id FROM student_payments WHERE receipt_number = ?',
        [data.receipt_number],
      );
      if (existingPayment) {
        return { success: false, message: `رقم الوصل "${data.receipt_number}" موجود بالفعل.` };
      }
    }

    // Record the payment using the existing handler
    const paymentDetails = {
      student_id: student.id,
      amount: parseFloat(data.amount),
      payment_method: mappedPaymentMethod,
      payment_type: mappedPaymentType,
      // Without a year, the payment goes to the current (configured) academic year.
      academic_year: data.academic_year || null,
      receipt_number: data.receipt_number,
      check_number: data.check_number,
      notes: data.notes,
      class_id: classId, // This will be stored in the class_id column
    };

    // Use the existing recordStudentPayment function
    await require('./handlers/studentFeeHandlers').recordStudentPayment(
      { sender: { userId: 1 } }, // Mock event with userId
      paymentDetails,
    );

    return { success: true };
  } catch (error) {
    logError('Error processing student fees row:', error);
    return { success: false, message: `حدث خطأ غير متوقع: ${error.message}` };
  }
}

const exported = {
  validateDatabaseFile,
  replaceDatabase,
  importExcelData,
  refusedImportSheets,
  SHEET_WRITE_CHANNELS,
};

// Conditionally export internal functions for testing
if (process.env.NODE_ENV === 'test') {
  exported.processStudentRow = processStudentRow;
  exported.processTeacherRow = processTeacherRow;
  exported.processUserRow = processUserRow;
  exported.processClassRow = processClassRow;
  exported.processTransactionRow = processTransactionRow;
  exported.processAttendanceRow = processAttendanceRow;
  exported.processGroupRow = processGroupRow;
  exported.processInventoryRow = processInventoryRow;
  exported.extractZipFromBuffer = extractZipFromBuffer;
  exported.splitSqlList = splitSqlList;
  exported.parseValuesRows = parseValuesRows;
  exported.fixStatementColumns = fixStatementColumns;
}

module.exports = exported;
