const { ipcMain } = require('electron');
const { importExcelData } = require('../importManager');
const { getAllSheets, getSheetInfo } = require('../importConstants');
const { error: logError } = require('../logger');

/**
 * Register Excel import IPC handlers
 */
function registerImportHandlers() {
  /**
   * Import Excel data - single step
   */
  ipcMain.handle('import:excel', async (_event, filePath, selectedSheets) => {
    try {
      const result = await importExcelData(filePath, selectedSheets);
      return { success: true, data: result };
    } catch (error) {
      logError('Error in Excel import:', error);
      return { success: false, message: error.message };
    }
  });

  /**
   * Get information about all available sheets
   */
  ipcMain.handle('import:get-sheets', async () => {
    try {
      const sheets = getAllSheets();
      return { success: true, data: sheets };
    } catch (error) {
      logError('Error getting sheets info:', error);
      return { success: false, message: error.message };
    }
  });

  /**
   * Get information about a specific sheet
   */
  ipcMain.handle('import:get-sheet-info', async (_event, sheetName) => {
    try {
      const sheetInfo = getSheetInfo(sheetName);
      if (!sheetInfo) {
        return { success: false, message: `ورقة البيانات غير موجودة: ${sheetName}` };
      }
      return { success: true, data: sheetInfo };
    } catch (error) {
      logError('Error getting sheet info:', error);
      return { success: false, message: error.message };
    }
  });
}

module.exports = { registerImportHandlers };
