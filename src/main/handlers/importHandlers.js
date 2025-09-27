const { ipcMain } = require('electron');
const { importExcelDataSequential } = require('../importManager');
const { getAllSteps, getStepInfo, getSheetsForStep } = require('../importConstants');
const { error: logError } = require('../logger');

/**
 * Register sequential import IPC handlers
 */
function registerImportHandlers() {
  /**
   * Import Excel data for a specific step
   */
  ipcMain.handle('import:excel-sequential', async (_event, filePath, stepId) => {
    try {
      const result = await importExcelDataSequential(filePath, stepId);
      return { success: true, data: result };
    } catch (error) {
      logError('Error in sequential import:', error);
      return { success: false, message: error.message };
    }
  });

  /**
   * Get information about all import steps
   */
  ipcMain.handle('import:get-steps', async () => {
    try {
      const steps = getAllSteps();
      return { success: true, data: steps };
    } catch (error) {
      logError('Error getting import steps:', error);
      return { success: false, message: error.message };
    }
  });

  /**
   * Get information about a specific step
   */
  ipcMain.handle('import:get-step-info', async (_event, stepId) => {
    try {
      const stepInfo = getStepInfo(stepId);
      if (!stepInfo) {
        return { success: false, message: `خطوة الاستيراد غير موجودة: ${stepId}` };
      }
      return { success: true, data: stepInfo };
    } catch (error) {
      logError('Error getting step info:', error);
      return { success: false, message: error.message };
    }
  });

  /**
   * Get sheets for a specific step
   */
  ipcMain.handle('import:get-step-sheets', async (_event, stepId) => {
    try {
      const sheets = getSheetsForStep(stepId);
      return { success: true, data: sheets };
    } catch (error) {
      logError('Error getting step sheets:', error);
      return { success: false, message: error.message };
    }
  });
}

module.exports = { registerImportHandlers };