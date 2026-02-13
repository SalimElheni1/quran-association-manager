const { ipcMain, app, dialog } = require('electron');
const path = require('path');
const db = require('../../db/db');
const { log, warn: logWarn, error: logError, getLogFilePath, clearLogFile } = require('../logger');
const fs = require('fs');

const exportManager = require('../exportManager');
const importManager = require('../importManager');
const backupManager = require('../backupManager');
const { internalGetSettingsHandler } = require('./settingsHandlers');
const Store = require('electron-store');
const bcrypt = require('bcryptjs');

async function handleGetBackupReminderStatus() {
  try {
    const store = new Store();
    const { settings } = await internalGetSettingsHandler();

    if (!settings.backup_reminder_enabled) {
      return { showReminder: false };
    }

    const lastBackupStatus = store.get('last_backup_status');
    if (!lastBackupStatus || !lastBackupStatus.timestamp) {
      return { showReminder: true, daysSinceLastBackup: Infinity };
    }

    const lastBackupDate = new Date(lastBackupStatus.timestamp);
    const today = new Date();
    const daysSinceLastBackup = Math.floor((today - lastBackupDate) / (1000 * 60 * 60 * 24));

    if (daysSinceLastBackup > settings.backup_reminder_frequency_days) {
      return { showReminder: true, daysSinceLastBackup };
    }

    return { showReminder: false };
  } catch (error) {
    logError('Error checking backup reminder status:', error);
    return { showReminder: false, error: 'Could not check backup status.' };
  }
}

function registerSystemHandlers() {
  ipcMain.handle('get-app-version', () => {
    return app.getVersion();
  });

  ipcMain.handle('export:generate', async (_event, { exportType, format, columns, options }) => {
    try {
      const { filePath } = await dialog.showSaveDialog({
        title: `Save ${exportType} Export`,
        defaultPath: `${exportType}-export-${Date.now()}.${format}`,
        filters: [
          format === 'pdf'
            ? { name: 'PDF Documents', extensions: ['pdf'] }
            : format === 'xlsx'
              ? { name: 'Excel Spreadsheets', extensions: ['xlsx'] }
              : { name: 'Word Documents', extensions: ['docx'] },
        ],
      });

      if (!filePath) {
        return { success: false, message: 'Export canceled by user.' };
      }

      // Fetch header data for all export types
      const headerData = await exportManager.getExportHeaderData();

      if (exportType === 'financial-report') {
        const period = options.period || null;
        const data = await exportManager.fetchFinancialData(period);
        // We will need to update generateFinancialXlsx to accept headerData later
        await exportManager.generateFinancialXlsx(data, filePath);
      } else {
        const fields = columns.map((c) => c.key);
        const data = await exportManager.fetchExportData({ type: exportType, fields, options });

        if (data.length === 0) {
          return { success: false, message: 'No data available for the selected criteria.' };
        }

        const reportTitle = `${exportType.charAt(0).toUpperCase() + exportType.slice(1)} Report`;
        const sheetNameMap = {
          students: 'الطلاب',
          teachers: 'المعلمون',
          admins: 'المستخدمون',
          users: 'المستخدمون',
          classes: 'الفصول',
          attendance: 'الحضور',
          'student-fees': 'رسوم الطلاب',
          expenses: 'المصاريف',
          income: 'المداخيل',
          inventory: 'المخزون',
        };
        const sheetName = sheetNameMap[exportType] || 'Exported Data';
        if (format === 'pdf') {
          await exportManager.generatePdf(reportTitle, columns, data, filePath, headerData);
        } else if (format === 'xlsx') {
          await exportManager.generateXlsx(columns, data, filePath, sheetName);
        } else if (format === 'docx') {
          await exportManager.generateDocx(reportTitle, columns, data, filePath, headerData);
        } else {
          throw new Error(`Unsupported export format: ${format}`);
        }
      }

      return { success: true, message: `Export saved to ${filePath}` };
    } catch (error) {
      logError(`Error during export (${exportType}, ${format}):`, error);
      // Show error toast notification to user
      try {
        const mainWindow = require('../index').mainWindow;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send(
            'ui:show-error-toast',
            `فشل في تصدير ${exportType}: ${error.message}`,
          );
        }
      } catch (toastError) {
        logError('Error showing error toast:', toastError);
      }
      return { success: false, message: `Export failed: ${error.message}` };
    }
  });

  ipcMain.handle('import:generate-template', async () => {
    try {
      const { filePath } = await dialog.showSaveDialog({
        title: 'Save Import Template',
        defaultPath: `import-template-${Date.now()}.xlsx`,
        filters: [{ name: 'Excel Spreadsheets', extensions: ['xlsx'] }],
      });

      if (!filePath) {
        return { success: false, message: 'Template generation canceled by user.' };
      }

      await exportManager.generateExcelTemplate(filePath);

      return { success: true, message: `Template saved to ${filePath}` };
    } catch (error) {
      logError('Error during template generation:', error);
      return { success: false, message: `Template generation failed: ${error.message}` };
    }
  });

  ipcMain.handle('import:execute', async (_event, { selectedSheets }) => {
    try {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: 'Select Excel File to Import',
        properties: ['openFile'],
        filters: [{ name: 'Excel Spreadsheets', extensions: ['xlsx'] }],
      });

      if (canceled || !filePaths || filePaths.length === 0) {
        return { success: false, message: 'Import canceled by user.' };
      }

      const results = await importManager.importExcelData(filePaths[0], selectedSheets);

      return { success: true, ...results };
    } catch (error) {
      logError('Error during import execution:', error);
      return { success: false, message: `Import failed: ${error.message}` };
    }
  });

  ipcMain.handle('dialog:openDirectory', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    });
    if (canceled) {
      return { success: false };
    } else {
      return { success: true, path: filePaths[0] };
    }
  });

  ipcMain.handle('backup:run', async (_event, settings) => {
    try {
      let backupFilePath = null;

      if (settings.backup_path) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        backupFilePath = path.join(settings.backup_path, `manual-backup-${timestamp}.qdb`);
      } else {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const { canceled, filePath } = await dialog.showSaveDialog({
          title: 'Save Database Backup',
          defaultPath: `backup-${timestamp}.qdb`,
          filters: [{ name: 'Quran DB Backups', extensions: ['qdb'] }],
        });

        if (canceled || !filePath) {
          return { success: false, message: 'Backup canceled by user.' };
        }
        backupFilePath = filePath;
      }

      log(`Starting manual backup to: ${backupFilePath}`);
      return await backupManager.runBackup(settings, backupFilePath);
    } catch (error) {
      logError('Error in backup:run IPC wrapper:', error);
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('backup:runCloud', async (_event, settings, createdBy) => {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const tempPath = path.join(app.getPath('temp'), `cloud-backup-${timestamp}.qdb`);

      log(`Starting manual cloud backup to temp path: ${tempPath}`);

      // Force cloud backup to be enabled for this specific call
      const cloudSettings = { ...settings, cloud_backup_enabled: true };

      // 1. Create a local backup file first (in temp)
      const localResult = await backupManager.runBackup(cloudSettings, tempPath);
      if (!localResult.success) {
        return localResult;
      }

      // 2. Upload it to the cloud explicitly
      const cloudBackupManager = require('../cloudBackupManager');
      const result = await cloudBackupManager.uploadBackup(tempPath, cloudSettings, createdBy);

      // Cleanup the temporary file after upload (runBackup handles the upload)
      try {
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
          log(`Temporary backup file deleted: ${tempPath}`);
        }
      } catch (unlinkError) {
        logWarn(`Failed to delete temporary backup file: ${unlinkError.message}`);
      }

      return result;
    } catch (error) {
      logError('Error in backup:runCloud IPC wrapper:', error);
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('backup:getStatus', () => {
    try {
      const store = new Store();
      const lastBackupStatus = store.get('last_backup_status');
      return { success: true, status: lastBackupStatus };
    } catch (error) {
      logError('Error in backup:getStatus IPC wrapper:', error);
      return { success: false, message: 'Could not retrieve backup status.' };
    }
  });

  ipcMain.handle('db:import', async (_event, { password, userId, filePath }) => {
    if (!password || !userId) {
      return { success: false, message: 'بيانات المصادقة غير كاملة.' };
    }
    try {
      const currentUser = await db.getQuery('SELECT password FROM users WHERE id = ?', [userId]);
      if (!currentUser) {
        return { success: false, message: 'المستخدم الحالي غير موجود.' };
      }
      const isMatch = await bcrypt.compare(password, currentUser.password);
      if (!isMatch) {
        return { success: false, message: 'كلمة المرور الحالية التي أدخلتها غير صحيحة.' };
      }

      let importedDbPath = filePath;
      if (!importedDbPath) {
        const { canceled, filePaths } = await dialog.showOpenDialog({
          title: 'Select Database to Import',
          properties: ['openFile'],
          filters: [{ name: 'Quran DB Backups', extensions: ['qdb'] }],
        });
        if (canceled || !filePaths || !filePaths[0]) {
          return { success: false, message: 'لم يتم تحديد أي ملف.' };
        }
        importedDbPath = filePaths[0];
      }

      const validationResult = await importManager.validateDatabaseFile(importedDbPath);
      if (!validationResult.isValid) {
        return { success: false, message: validationResult.message };
      }
      return await importManager.replaceDatabase(importedDbPath, password);
    } catch (error) {
      logError('Error during database import process:', error);
      return {
        success: false,
        message: `حدث خطأ فادح أثناء الاستيراد: ${error.message}`,
      };
    }
  });

  ipcMain.handle('backup:get-reminder-status', handleGetBackupReminderStatus);

  ipcMain.handle('backup:listCloud', async (_event, settings) => {
    try {
      const cloudBackupManager = require('../cloudBackupManager');
      const result = await cloudBackupManager.listCloudBackups(settings);
      return result; // Now returns { success, backups, message }
    } catch (error) {
      logError('Error in backup:listCloud IPC wrapper:', error);
      return { success: false, backups: [], message: error.message };
    }
  });

  ipcMain.handle('backup:downloadCloud', async (_event, fileId, fileName) => {
    try {
      const cloudBackupManager = require('../cloudBackupManager');
      return await cloudBackupManager.downloadBackup(fileId, fileName);
    } catch (error) {
      logError('Error in backup:downloadCloud IPC wrapper:', error);
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('backup:downloadFromLink', async (_event, link) => {
    try {
      const cloudBackupManager = require('../cloudBackupManager');
      return await cloudBackupManager.downloadFromLink(link);
    } catch (error) {
      logError('Error in backup:downloadFromLink IPC wrapper:', error);
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('backup:deleteCloud', async (_event, id) => {
    try {
      const cloudBackupManager = require('../cloudBackupManager');
      return await cloudBackupManager.deleteBackup(id);
    } catch (error) {
      logError('Error in backup:deleteCloud IPC wrapper:', error);
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('backup:googleConnect', async () => {
    try {
      const cloudBackupManager = require('../cloudBackupManager');
      const result = await cloudBackupManager.connectGoogle();
      return result; // Usually returns { success: true, email: ... }
    } catch (error) {
      logError('Error in backup:googleConnect IPC wrapper:', error);
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('backup:googleDisconnect', async () => {
    try {
      const cloudBackupManager = require('../cloudBackupManager');
      return await cloudBackupManager.disconnectGoogle();
    } catch (error) {
      logError('Error in backup:googleDisconnect IPC wrapper:', error);
      return { success: false, message: error.message };
    }
  });

  // Log management handlers for testing
  ipcMain.handle('logs:get-recent', async (_event, { lines = 100 } = {}) => {
    try {
      const logFilePath = getLogFilePath();
      if (!logFilePath || !fs.existsSync(logFilePath)) {
        return { success: true, logs: [], message: 'Log file not found' };
      }

      const content = fs.readFileSync(logFilePath, 'utf-8');
      const allLines = content.split('\n').filter((l) => l.trim());
      const recentLines = allLines.slice(-lines);

      return { success: true, logs: recentLines };
    } catch (error) {
      logError('Error reading logs:', error);
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('logs:get-filtered', async (_event, { keyword, lines = 100 } = {}) => {
    try {
      const logFilePath = getLogFilePath();
      if (!logFilePath || !fs.existsSync(logFilePath)) {
        return { success: true, logs: [], message: 'Log file not found' };
      }

      const content = fs.readFileSync(logFilePath, 'utf-8');
      const allLines = content.split('\n').filter((l) => l.trim());
      const filtered = allLines.filter((l) => l.includes(keyword)).slice(-lines);

      return { success: true, logs: filtered };
    } catch (error) {
      logError('Error filtering logs:', error);
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('logs:clear', async () => {
    try {
      clearLogFile();
      return { success: true, message: 'Logs cleared' };
    } catch (error) {
      logError('Error clearing logs:', error);
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('logs:get-file-path', async () => {
    try {
      const logFilePath = getLogFilePath();
      return { success: true, path: logFilePath };
    } catch (error) {
      logError('Error getting log file path:', error);
      return { success: false, message: error.message };
    }
  });

  // ========================================================================
  // UI NOTIFICATION APIs
  // ========================================================================

  /**
   * Shows an error toast notification in the renderer process
   * @param {Object} event IPC event
   * @param {string} message Error message to display
   */
  ipcMain.on('ui:show-error-toast', (event, message) => {
    try {
      // Forward to renderer process main window
      const mainWindow = require('../index').mainWindow;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ui:show-error-toast', message);
      }
    } catch (error) {
      logError('Error showing error toast:', error);
    }
  });

  /**
   * Shows a success toast notification in the renderer process
   * @param {Object} event IPC event
   * @param {string} message Success message to display
   */
  ipcMain.on('ui:show-success-toast', (event, message) => {
    try {
      // Forward to renderer process main window
      const mainWindow = require('../index').mainWindow;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ui:show-success-toast', message);
      }
    } catch (error) {
      logError('Error showing success toast:', error);
    }
  });

  ipcMain.handle('app:relaunch', () => {
    app.relaunch();
    app.exit(0);
  });
}

module.exports = { registerSystemHandlers, handleGetBackupReminderStatus };
