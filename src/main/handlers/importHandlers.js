const { ipcMain, dialog } = require('electron');
const { analyzeImportFile, processImport } = require('../importManager');
const { COLUMN_MAPPINGS } = require('../importManager');

function registerImportHandlers() {
  ipcMain.handle('import:open-file-dialog', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Excel', extensions: ['xlsx', 'xls'] }],
    });
    if (canceled) {
      return null;
    }
    return filePaths[0];
  });

  ipcMain.handle('import:analyze', async (event, filePath) => {
    try {
      const analysis = await analyzeImportFile(filePath);
      return { success: true, analysis };
    } catch (error) {
      console.error('Failed to analyze import file:', error);
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('import:get-column-mappings', () => {
    // This is not async, it just returns the constant.
    // We keep the handle structure for consistency.
    return COLUMN_MAPPINGS;
  });

  ipcMain.handle('import:process', async (event, { filePath, confirmedMappings }) => {
    try {
      const results = await processImport(filePath, confirmedMappings);
      return { success: true, results };
    } catch (error) {
      console.error('Failed to process import:', error);
      return { success: false, message: error.message };
    }
  });
}

module.exports = { registerImportHandlers };
