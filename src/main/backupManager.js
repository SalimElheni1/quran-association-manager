const fs = require('fs').promises;
const path = require('path');
const Store = require('electron-store');
const PizZip = require('pizzip');
const { allQuery } = require('../db/db');
const { log, error: logError } = require('./logger');
const { getDbSalt } = require('./keyManager');
const schema = require('../db/schema');

const store = new Store();

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
 * This creates a zip file containing a full SQL dump and the encryption salt config.
 * @param {Object} settings - The application settings object.
 * @param {string} backupFilePath - The path to save the backup file.
 * @returns {Promise<{success: boolean, message: string}>}
 */
const runBackup = async (settings, backupFilePath) => {
  log('SQL-based backup process started...');

  try {
    // 1. Get DB salt (this will create it if it doesn't exist)
    const dbSalt = getDbSalt();
    log(`Using database salt for backup.`);

    // 2. Generate SQL data dump
    log('Generating SQL dump...');
    const sqlDump = await generateSqlReplaceStatements();
    log('SQL dump generated successfully.');

    // 3. Create salt configuration content
    const saltConfig = {
      'db-salt': dbSalt,
    };
    const saltFileContent = Buffer.from(JSON.stringify(saltConfig, null, 2));

    // 4. Create a zip package
    const zip = new PizZip();
    zip.file('backup.sql', sqlDump);
    zip.file('salt.json', saltFileContent); // Use a more descriptive name

    const zipContent = zip.generate({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    });

    // 5. Write the package to the destination
    await fs.writeFile(backupFilePath, zipContent);

    const message = `Backup completed successfully.`;
    store.set('last_backup_status', {
      success: true,
      message,
      timestamp: new Date().toISOString(),
    });
    log(message, `Path: ${backupFilePath}`);
    return { success: true, message };
  } catch (error) {
    const message = `Failed to create SQL backup: ${error.message}`;
    store.set('last_backup_status', {
      success: false,
      message,
      timestamp: new Date().toISOString(),
    });
    logError(message);
    return { success: false, message };
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
  if (!lastBackup?.timestamp) {
    return true; // No backup has ever run
  }

  const lastBackupTime = new Date(lastBackup.timestamp).getTime();
  const now = Date.now();
  const diffHours = (now - lastBackupTime) / (1000 * 60 * 60);

  switch (settings.backup_frequency) {
    case 'daily':
      return diffHours >= 24;
    case 'weekly':
      return diffHours >= 24 * 7;
    case 'monthly':
      return diffHours >= 24 * 30; // Approximation
    default:
      return false;
  }
};

/**
 * Starts the backup scheduler.
 * @param {Object} settings - The application settings object.
 */
const startScheduler = (settings) => {
  stopScheduler(); // Stop any existing scheduler first

  if (!settings.backup_enabled) {
    log('Backup scheduler is disabled.');
    return;
  }

  log(`Backup scheduler started. Frequency: ${settings.backup_frequency}.`);

  // Check every hour to see if a backup is due
  schedulerIntervalId = setInterval(
    async () => {
      // Re-fetch settings in case they changed, though restarting the scheduler is better.
      // For simplicity here, we use the settings from when it was started.
      // A more robust implementation would fetch settings inside the interval.
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
  ); // Check every hour
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
  isBackupDue, // Exported for testing purposes
};
