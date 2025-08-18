const fs = require('fs');
const path = require('path');
const Store = require('electron-store');
const { getDatabasePath } = require('../db/db');

const store = new Store();

/**
 * Runs the database backup process.
 * @param {Object} settings - The application settings object.
 * @returns {Promise<{success: boolean, message: string}>}
 */
const runBackup = async (settings) => {
  console.log('Backup process started...');

  if (!settings.backup_enabled || !settings.backup_path) {
    const message = 'Backup is not enabled or path is not configured.';
    console.log(`Backup check failed: ${message}`);
    store.set('last_backup_status', { success: false, message, timestamp: new Date().toISOString() });
    return { success: false, message };
  }

  console.log(`Backup settings validated. Enabled: ${settings.backup_enabled}, Path: ${settings.backup_path}`);
  const sourcePath = getDatabasePath();
  const destPath = settings.backup_path;

  // 1. Check if source exists
  if (!fs.existsSync(sourcePath)) {
    const message = `Source database file not found at: ${sourcePath}`;
    console.log(`Backup check failed: ${message}`);
    store.set('last_backup_status', { success: false, message, timestamp: new Date().toISOString() });
    return { success: false, message };
  }

  console.log(`Source database found at: ${sourcePath}`);

  // 2. Check if destination directory exists and is writable
  try {
    fs.accessSync(destPath, fs.constants.W_OK);
    console.log(`Destination directory is writable: ${destPath}`);
  } catch (error) {
    const message = `Backup destination path is not accessible or writable: ${destPath}`;
    console.log(`Backup check failed: ${message}`, error);
    store.set('last_backup_status', { success: false, message, timestamp: new Date().toISOString() });
    return { success: false, message };
  }

  // 3. Create timestamped filename
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFileName = `backup-${timestamp}.sqlite`;
  const backupFilePath = path.join(destPath, backupFileName);

  // 4. Copy the file
  try {
    const startTime = Date.now();
    fs.copyFileSync(sourcePath, backupFilePath);
    const duration = (Date.now() - startTime) / 1000; // in seconds

    const message = `Backup completed successfully in ${duration.toFixed(2)}s.`;
    store.set('last_backup_status', { success: true, message, timestamp: new Date().toISOString() });
    console.log(message, `Path: ${backupFilePath}`);
    return { success: true, message };
  } catch (error) {
    const message = `Failed to copy database file: ${error.message}`;
    store.set('last_backup_status', { success: false, message, timestamp: new Date().toISOString() });
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
  schedulerIntervalId = setInterval(async () => {
    // Re-fetch settings in case they changed, though restarting the scheduler is better.
    // For simplicity here, we use the settings from when it was started.
    // A more robust implementation would fetch settings inside the interval.
    if (settings.backup_enabled && isBackupDue(settings)) {
      console.log('Scheduled backup is due. Running now...');
      await runBackup(settings);
    }
  }, 1000 * 60 * 60); // Check every hour
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
