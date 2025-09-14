const { ipcMain } = require('electron');
const { allQuery, runQuery, getQuery } = require('../../db/db');
const { log, error: logError } = require('../logger');
const exportManager = require('../exportManager');
const { dialog } = require('electron');


async function handleGetExportHistory(event, { page = 1, limit = 15, sortBy = 'created_at', sortOrder = 'desc' }) {
  try {
    const offset = (page - 1) * limit;
    const history = await allQuery(
      `SELECT * FROM export_history ORDER BY ${sortBy} ${sortOrder} LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    const { total } = await getQuery('SELECT COUNT(*) as total FROM export_history');

    return { success: true, data: { history, total, page, limit } };
  } catch (error) {
    logError('Error getting export history:', error);
    return { success: false, message: error.message };
  }
}

async function handleDeleteExportHistory(event, id) {
    try {
      await runQuery('DELETE FROM export_history WHERE id = ?', [id]);
      return { success: true };
    } catch (error) {
      logError(`Error deleting export history item ${id}:`, error);
      return { success: false, message: error.message };
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
            await exportManager.generateXlsx(exportOptions, filePath);
        } else if (format === 'csv') {
            await exportManager.generateCsv(exportOptions, filePath);
        } else {
            const data = await exportManager.fetchExportData(exportOptions);
            const reportTitle = `${export_type.charAt(0).toUpperCase() + export_type.slice(1)} Report`;
            if (format === 'pdf') {
                await exportManager.generatePdf(reportTitle, columns, data, filePath, options);
            } else if (format === 'docx') {
                await exportManager.generateDocx(reportTitle, columns, data, filePath);
            }
        }
        return { success: true, message: `Export re-generated to ${filePath}` };

    } catch (error) {
        logError(`Error re-generating export ${id}:`, error);
        return { success: false, message: error.message };
    }
}

function registerHistoryHandlers() {
  ipcMain.handle('history:get-exports', handleGetExportHistory);
  ipcMain.handle('history:delete-export', handleDeleteExportHistory);
  ipcMain.handle('history:regenerate-export', handleRegenerateExport);
  log('History handlers registered.');
}

module.exports = { registerHistoryHandlers };
