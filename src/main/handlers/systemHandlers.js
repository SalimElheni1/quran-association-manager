const path = require('path');
const { ipcMain, app, dialog } = require('electron');
const db = require('../../db/db');
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
    console.error('Error checking backup reminder status:', error);
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

      if (exportType === 'financial-report') {
        const data = await exportManager.fetchFinancialData();
        await exportManager.generateFinancialXlsx(data, filePath);
      } else {
        const fields = columns.map((c) => c.key);
        const data = await exportManager.fetchExportData({ type: exportType, fields, options });

        if (data.length === 0) {
          return { success: false, message: 'No data available for the selected criteria.' };
        }

        const reportTitle = `${exportType.charAt(0).toUpperCase() + exportType.slice(1)} Report`;
        if (format === 'pdf') {
          await exportManager.generatePdf(reportTitle, columns, data, filePath);
        } else if (format === 'xlsx') {
          await exportManager.generateXlsx(columns, data, filePath);
        } else if (format === 'docx') {
          await exportManager.generateDocx(reportTitle, columns, data, filePath);
        } else {
          throw new Error(`Unsupported export format: ${format}`);
        }
      }

      return { success: true, message: `Export saved to ${filePath}` };
    } catch (error) {
      console.error(`Error during export (${exportType}, ${format}):`, error);
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
      console.error('Error during template generation:', error);
      return { success: false, message: `Template generation failed: ${error.message}` };
    }
  });

  ipcMain.handle('import:execute', async () => {
    try {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: 'Select Excel File to Import',
        properties: ['openFile'],
        filters: [{ name: 'Excel Spreadsheets', extensions: ['xlsx'] }],
      });

      if (canceled || !filePaths || filePaths.length === 0) {
        return { success: false, message: 'Import canceled by user.' };
      }

      const results = await importManager.importExcelData(filePaths[0]);

      return { success: true, ...results };
    } catch (error) {
      console.error('Error during import execution:', error);
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
      if (!settings) {
        throw new Error('Backup settings were not provided.');
      }
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const { canceled, filePath } = await dialog.showSaveDialog({
        title: 'Save Database Backup',
        defaultPath: `backup-${timestamp}.qdb`,
        filters: [{ name: 'Quran DB Backups', extensions: ['qdb'] }],
      });

      if (canceled || !filePath) {
        return { success: false, message: 'Backup canceled by user.' };
      }

      return await backupManager.runBackup(settings, filePath);
    } catch (error) {
      console.error('Error in backup:run IPC wrapper:', error);
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('backup:getStatus', () => {
    try {
      const store = new Store();
      const lastBackupStatus = store.get('last_backup_status');
      return { success: true, status: lastBackupStatus };
    } catch (error) {
      console.error('Error in backup:getStatus IPC wrapper:', error);
      return { success: false, message: 'Could not retrieve backup status.' };
    }
  });

  ipcMain.handle('db:import', async (_event, { password, userId }) => {
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
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: 'Select Database to Import',
        properties: ['openFile'],
        filters: [{ name: 'Quran DB Backups', extensions: ['qdb'] }],
      });
      if (canceled || !filePaths || !filePaths[0]) {
        return { success: false, message: 'لم يتم تحديد أي ملف.' };
      }
      const importedDbPath = filePaths[0];
      const validationResult = await importManager.validateDatabaseFile(importedDbPath);
      if (!validationResult.isValid) {
        return { success: false, message: validationResult.message };
      }
      return await importManager.replaceDatabase(importedDbPath, password);
    } catch (error) {
      console.error('Error during database import process:', error);
      return {
        success: false,
        message: `حدث خطأ فادح أثناء الاستيراد: ${error.message}`,
      };
    }
  });

  ipcMain.handle('backup:get-reminder-status', handleGetBackupReminderStatus);
}

module.exports = { registerSystemHandlers, handleGetBackupReminderStatus };
