const fs = require('fs').promises;
const fsSync = require('fs');
const Store = require('electron-store');
const PizZip = require('pizzip');
const path = require('path');
const { allQuery } = require(path.resolve(__dirname, '../db/db'));

const store = new Store();
const saltStore = new Store({ name: 'db-config' });

/**
 * Generates a SQL script of REPLACE statements for all data in the database.
 * Using REPLACE (or INSERT OR REPLACE) handles conflicts with pre-existing data
 * (e.g., default settings) during the import process.
 * @returns {Promise<string>} A string containing the full SQL dump.
 */
async function generateSqlReplaceStatements() {
  const replaceStatements = [];
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
      replaceStatements.push(`REPLACE INTO "${tableName}" (${columnNames}) VALUES (${values});`);
    }
  }
  return replaceStatements.join('\n');
}

/**
 * Runs the database backup process.
 * This creates a zip file containing a full SQL dump and the encryption salt config.
 * @param {Object} settings - The application settings object.
 * @param {string} backupFilePath - The path to save the backup file.
 * @returns {Promise<{success: boolean, message: string}>}
 */
const runBackup = async (settings, backupFilePath) => {
  console.log('SQL-based backup process started...');

  const sourceSaltPath = saltStore.path;

  try {
    // 1. Check if the salt config file exists
    if (!fsSync.existsSync(sourceSaltPath)) {
      throw new Error(`Source salt file not found at: ${sourceSaltPath}`);
    }
    console.log(`Source salt config found at: ${sourceSaltPath}`);

    // 2. Generate SQL data dump and read salt file
    console.log('Generating SQL dump...');
    const sqlDump = await generateSqlReplaceStatements();
    const saltFileContent = await fs.readFile(sourceSaltPath);
    console.log('SQL dump generated successfully.');

    // 3. Create a zip package
    const zip = new PizZip();
    zip.file('backup.sql', sqlDump);
    zip.file('config.json', saltFileContent);

    const zipContent = zip.generate({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    });

    // 4. Write the package to the destination
    await fs.writeFile(backupFilePath, zipContent);

    const message = `Backup completed successfully.`;
    store.set('last_backup_status', {
      success: true,
      message,
      timestamp: new Date().toISOString(),
    });
    console.log(message, `Path: ${backupFilePath}`);
    return { success: true, message };
  } catch (error) {
    const message = `Failed to create SQL backup: ${error.message}`;
    store.set('last_backup_status', {
      success: false,
      message,
      timestamp: new Date().toISOString(),
    });
    console.error(message);
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
    console.log('Backup scheduler is disabled.');
    return;
  }

  console.log(`Backup scheduler started. Frequency: ${settings.backup_frequency}.`);

  // Check every hour to see if a backup is due
  schedulerIntervalId = setInterval(
    async () => {
      // Re-fetch settings in case they changed, though restarting the scheduler is better.
      // For simplicity here, we use the settings from when it was started.
      // A more robust implementation would fetch settings inside the interval.
      if (settings.backup_enabled && isBackupDue(settings)) {
        console.log('Scheduled backup is due. Running now...');
        await runBackup(settings);
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
    console.log('Backup scheduler stopped.');
  }
};

module.exports = {
  runBackup,
  startScheduler,
  stopScheduler,
  isBackupDue, // Exported for testing purposes
};
