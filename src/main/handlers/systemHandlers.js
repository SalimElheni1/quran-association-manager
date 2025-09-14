const { ipcMain, app, dialog } = require('electron');
const { runQuery, getQuery } = require('../../db/db');
const { log, error: logError } = require('../logger');
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
        if (!settings.backup_reminder_enabled) return { showReminder: false };
        const lastBackupStatus = store.get('last_backup_status');
        if (!lastBackupStatus || !lastBackupStatus.timestamp) return { showReminder: true, daysSinceLastBackup: Infinity };
        const lastBackupDate = new Date(lastBackupStatus.timestamp);
        const today = new Date();
        const daysSinceLastBackup = Math.floor((today - lastBackupDate) / (1000 * 60 * 60 * 24));
        if (daysSinceLastBackup > settings.backup_reminder_frequency_days) return { showReminder: true, daysSinceLastBackup };
        return { showReminder: false };
    } catch (error) {
        logError('Error checking backup reminder status:', error);
        return { showReminder: false, error: 'Could not check backup status.' };
    }
}

function registerSystemHandlers() {
    ipcMain.handle('get-app-version', () => app.getVersion());

    ipcMain.handle('export:generate', async (_event, { exportType, format, columns, options, templateId }) => {
        const historyLog = {
            export_type: exportType,
            format,
            filters: JSON.stringify(options),
            columns: JSON.stringify(columns),
            status: 'Failed',
        };
        try {
            const formatMap = {
                pdf: { name: 'PDF Documents', extensions: ['pdf'] },
                xlsx: { name: 'Excel Spreadsheets', extensions: ['xlsx'] },
                docx: { name: 'Word Documents', extensions: ['docx'] },
                csv: { name: 'CSV Files', extensions: ['csv'] },
            };
            const { filePath } = await dialog.showSaveDialog({
                title: `Save ${exportType} Export`,
                defaultPath: `${exportType}-export-${Date.now()}.${format}`,
                filters: [formatMap[format] || { name: 'All Files', extensions: ['*'] }],
            });

            if (!filePath) return { success: false, message: 'Export canceled by user.' };

            const exportOptions = { type: exportType, fields: columns.map(c => c.key), options };

            if (exportType === 'financial-report') {
                const period = options.period || null;
                const data = await exportManager.fetchFinancialData(period);
                await exportManager.generateFinancialXlsx(data, filePath);
                historyLog.row_count = data.payments.length + data.salaries.length + data.donations.length + data.expenses.length;
            } else if (format === 'xlsx') {
                await exportManager.generateXlsx(exportOptions, filePath);
            } else if (format === 'csv') {
                await exportManager.generateCsv(exportOptions, filePath);
            } else {
                const data = await exportManager.fetchExportData(exportOptions);
                if (data.length === 0) throw new Error('No data available for the selected criteria.');
                historyLog.row_count = data.length;
                const reportTitle = `${exportType.charAt(0).toUpperCase() + exportType.slice(1)} Report`;
                let templateContent = null;
                if (templateId) {
                    const template = await getQuery('SELECT content FROM export_templates WHERE id = ?', [templateId]);
                    if (template) templateContent = template.content;
                }
                if (format === 'pdf') {
                    await exportManager.generatePdf(reportTitle, columns, data, filePath, options, templateContent);
                } else if (format === 'docx') {
                    await exportManager.generateDocx(reportTitle, columns, data, filePath, templateContent);
                }
            }
            historyLog.status = 'Success';
            historyLog.file_path = filePath;
            return { success: true, message: `Export saved to ${filePath}` };
        } catch (error) {
            logError(`Error during export (${exportType}, ${format}):`, error);
            historyLog.error_message = error.message;
            return { success: false, message: `Export failed: ${error.message}` };
        } finally {
            try {
                await runQuery('INSERT INTO export_history (export_type, format, filters, columns, row_count, file_path, status, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    [historyLog.export_type, historyLog.format, historyLog.filters, historyLog.columns, historyLog.row_count, historyLog.file_path, historyLog.status, historyLog.error_message]);
            } catch (dbError) {
                logError('Failed to log export to history:', dbError);
            }
        }
    });

    ipcMain.handle('export:generate-batch', async (event, { exportConfigs }) => {
        const historyLog = { export_type: 'batch', format: 'xlsx', filters: JSON.stringify(exportConfigs.map(c => c.exportType)), columns: JSON.stringify(exportConfigs), status: 'Failed' };
        try {
            const { filePath } = await dialog.showSaveDialog({
                title: 'Save Batch Export',
                defaultPath: `batch-export-${Date.now()}.xlsx`,
                filters: [{ name: 'Excel Spreadsheets', extensions: ['xlsx'] }],
            });
            if (!filePath) return { success: false, message: 'Export canceled by user.' };
            const datasets = {};
            let totalRows = 0;
            let count = 0;
            for (const config of exportConfigs) {
                const { exportType, columns } = config;
                const fields = columns.map(c => c.key);
                const data = await exportManager.fetchExportData({ type: exportType, fields, options: {} });
                datasets[exportType] = { columns, data };
                totalRows += data.length;
                count++;
                event.sender.send('export:progress', { processed: count, total: exportConfigs.length });
            }
            await exportManager.generateBatchXlsx(datasets, filePath);
            historyLog.row_count = totalRows;
            historyLog.status = 'Success';
            historyLog.file_path = filePath;
            return { success: true, message: `Batch export saved to ${filePath}` };
        } catch (error) {
            logError('Error during batch export:', error);
            historyLog.error_message = error.message;
            return { success: false, message: `Batch export failed: ${error.message}` };
        } finally {
            try {
                await runQuery('INSERT INTO export_history (export_type, format, filters, columns, row_count, file_path, status, error_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    [historyLog.export_type, historyLog.format, historyLog.filters, historyLog.columns, historyLog.row_count, historyLog.file_path, historyLog.status, historyLog.error_message]);
            } catch (dbError) {
                logError('Failed to log batch export to history:', dbError);
            }
        }
    });

    ipcMain.handle('export:generate-preview', async (_event, { exportType, columns, options }) => {
        try {
            const fields = columns.map((c) => c.key);
            const data = await exportManager.fetchExportData({ type: exportType, fields, options });
            const previewData = data.slice(0, 20);
            return { success: true, data: previewData };
        } catch (error) {
            logError(`Error during export preview generation (${exportType}):`, error);
            return { success: false, message: `Preview failed: ${error.message}` };
        }
    });

    ipcMain.handle('import:generate-template', async () => {
        try {
            const { filePath } = await dialog.showSaveDialog({ title: 'Save Import Template', defaultPath: `import-template-${Date.now()}.xlsx`, filters: [{ name: 'Excel Spreadsheets', extensions: ['xlsx'] }] });
            if (!filePath) return { success: false, message: 'Template generation canceled by user.' };
            await exportManager.generateExcelTemplate(filePath);
            return { success: true, message: `Template saved to ${filePath}` };
        } catch (error) {
            logError('Error during template generation:', error);
            return { success: false, message: `Template generation failed: ${error.message}` };
        }
    });

    ipcMain.handle('import:analyze', async (event, { filePath }) => {
        try {
            const headers = await importManager.parseHeadersFromFile(filePath);
            const rows = await importManager.getPreviewRows(filePath);
            return { success: true, headers, rows };
        } catch (error) {
            logError('Error analyzing import file:', error);
            return { success: false, message: `Failed to analyze file: ${error.message}` };
        }
    });

    ipcMain.handle('import:execute', async (event, { entity, filePath, mappings, dryRun }) => {
        try {
            const onProgress = (progress) => event.sender.send('import:progress', progress);
            const results = await importManager.processImport(filePath, entity, mappings, { isDryRun: dryRun }, onProgress);
            return { success: true, ...results };
        } catch (error) {
            logError('Error during import execution:', error);
            return { success: false, message: `Import failed: ${error.message}` };
        }
    });

    ipcMain.handle('dialog:openDirectory', async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog({ properties: ['openDirectory'] });
        if (canceled) return { success: false };
        return { success: true, path: filePaths[0] };
    });

    ipcMain.handle('backup:run', async (_event, settings) => {
        try {
            if (!settings) throw new Error('Backup settings were not provided.');
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const { canceled, filePath } = await dialog.showSaveDialog({ title: 'Save Database Backup', defaultPath: `backup-${timestamp}.qdb`, filters: [{ name: 'Quran DB Backups', extensions: ['qdb'] }] });
            if (canceled || !filePath) return { success: false, message: 'Backup canceled by user.' };
            return await backupManager.runBackup(settings, filePath);
        } catch (error) {
            logError('Error in backup:run IPC wrapper:', error);
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

    ipcMain.handle('db:import', async (_event, { password, userId }) => {
        if (!password || !userId) return { success: false, message: 'بيانات المصادقة غير كاملة.' };
        try {
            const currentUser = await getQuery('SELECT password FROM users WHERE id = ?', [userId]);
            if (!currentUser) return { success: false, message: 'المستخدم الحالي غير موجود.' };
            const isMatch = await bcrypt.compare(password, currentUser.password);
            if (!isMatch) return { success: false, message: 'كلمة المرور الحالية التي أدخلتها غير صحيحة.' };
            const { canceled, filePaths } = await dialog.showOpenDialog({ title: 'Select Database to Import', properties: ['openFile'], filters: [{ name: 'Quran DB Backups', extensions: ['qdb'] }] });
            if (canceled || !filePaths || !filePaths[0]) return { success: false, message: 'لم يتم تحديد أي ملف.' };
            const importedDbPath = filePaths[0];
            const validationResult = await importManager.validateDatabaseFile(importedDbPath);
            if (!validationResult.isValid) return { success: false, message: validationResult.message };
            return await importManager.replaceDatabase(importedDbPath, password);
        } catch (error) {
            logError('Error during database import process:', error);
            return { success: false, message: `حدث خطأ فادح أثناء الاستيراد: ${error.message}` };
        }
    });

    ipcMain.handle('backup:get-reminder-status', handleGetBackupReminderStatus);
}

module.exports = { registerSystemHandlers, handleGetBackupReminderStatus };
