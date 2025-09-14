const { ipcMain, dialog } = require('electron');
const { allQuery, getQuery, runQuery } = require('../../db/db');
const { log, error: logError } = require('../logger');
const exportManager = require('../exportManager');

async function handleGetExportHistory() {
  try {
    const history = await allQuery('SELECT * FROM export_history ORDER BY created_at DESC');
    return history;
  } catch (error) {
    logError('Error getting export history:', error);
    throw error;
  }
}

async function handleDeleteExportHistory(event, id) {
    try {
      await runQuery('DELETE FROM export_history WHERE id = ?', [id]);
      return { success: true };
    } catch (error) {
      logError(`Error deleting export history item ${id}:`, error);
      throw error;
    }
}

async function handleRegenerateExport(event, id) {
    try {
        const historyItem = await getQuery('SELECT * FROM export_history WHERE id = ?', [id]);
        if (!historyItem) {
            return { success: false, message: 'History item not found.' };
        }

        const { export_type, format, filters, columns: columnsJSON } = historyItem;
        if (!columnsJSON) {
            return { success: false, message: 'History item is missing column data and cannot be re-generated.' };
        }

        const options = JSON.parse(filters);
        const columns = JSON.parse(columnsJSON);

        const { filePath } = await dialog.showSaveDialog({
            title: `Re-generate ${export_type} Export`,
            defaultPath: `${export_type}-export-${Date.now()}.${format}`,
        });

        if (!filePath) {
            return { success: false, message: 'Export canceled by user.' };
        }

        const exportOptions = { type: export_type, fields: columns.map(c => c.key), options };

        if (format === 'xlsx') {
            const data = await exportManager.fetchExportData(exportOptions);
            await exportManager.generateXlsx(columns, data, filePath);
        } else if (format === 'csv') {
            const data = await exportManager.fetchExportData(exportOptions);
            await exportManager.generateCsv(columns, data, filePath);
        } else {
            const data = await exportManager.fetchExportData(exportOptions);
            const reportTitle = `${export_type.charAt(0).toUpperCase() + export_type.slice(1)} Report`;
            if (format === 'pdf') {
                await exportManager.generatePdf(reportTitle, columns, data, filePath, options);
            } else if (format === 'docx') {
                await exportManager.generateDocx(reportTitle, columns, data, filePath);
            }
        }
        return { success: true, filePath };

    } catch (error) {
        logError(`Error re-generating export ${id}:`, error);
        throw error;
    }
}

function registerHistoryHandlers() {
  ipcMain.handle('history:get', handleGetExportHistory);
  ipcMain.handle('history:delete', handleDeleteExportHistory);
  ipcMain.handle('history:regenerate', handleRegenerateExport);
  log('History handlers registered.');
}

module.exports = { registerHistoryHandlers };
