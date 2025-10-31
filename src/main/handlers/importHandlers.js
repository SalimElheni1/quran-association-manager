const { ipcMain, dialog, BrowserWindow } = require('electron');
const { importExcelData } = require('../importManager');
const { getAllSheets, getSheetInfo } = require('../importConstants');
const { generateExcelTemplate } = require('../exportManager');
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
      // Map UI sheet names to canonical sheet names if needed
      const sheetNameMap = {
        'المداخيل': 'العمليات المالية',
        'المصاريف': 'العمليات المالية',
        'رسوم الطلاب': 'رسوم الطلاب', // Use dedicated student fees sheet
        'الجرد': 'المخزون',
        // Canonical names are already correct
        'الطلاب': 'الطلاب',
        'المعلمون': 'المعلمون',
        'المستخدمون': 'المستخدمون',
        'الفصول': 'الفصول',
        'العمليات المالية': 'العمليات المالية',
        'الحضور': 'الحضور',
        'المجموعات': 'المجموعات',
        'المخزون': 'المخزون',
      };

      const canonicalSheets = selectedSheets.map(sheet => sheetNameMap[sheet] || sheet);

      const result = await importExcelData(filePath, canonicalSheets);
      // Broadcast import completion to all renderer windows so they can refresh their data
      try {
        const payload = { sheets: selectedSheets, results: result };
        BrowserWindow.getAllWindows().forEach((w) => {
          try {
            w.webContents.send('import:completed', payload);
          } catch (err) {
            // Non-fatal; continue notifying other windows
            logError('Failed to send import:completed to a window:', err);
          }
        });
      } catch (err) {
        // Log but don't fail the import response
        logError('Error broadcasting import completion:', err);
      }

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

  /**
   * Generate import template for specific sheet(s)
   */
  ipcMain.handle('generate-import-template', async (_event, options = {}) => {
    try {
      // Map UI import type names to their corresponding sheet names for template generation
      const importTypeToSheetMap = {
        'المداخيل': 'العمليات المالية',
        'المصاريف': 'العمليات المالية',
        'رسوم الطلاب': 'رسوم الطلاب', // Use dedicated student fees sheet
        'الجرد': 'المخزون',
        // Direct matches for other types
        'الطلاب': 'الطلاب',
        'المعلمون': 'المعلمون',
        'المستخدمون': 'المستخدمون',
        'الفصول': 'الفصول',
        'العمليات المالية': 'العمليات المالية',
        'الحضور': 'الحضور',
        'المجموعات': 'المجموعات',
        'المخزون': 'المخزون',
      };

      const mappedOptions = { ...options };
      if (options.sheetName && importTypeToSheetMap[options.sheetName]) {
        // Store original import type for filtering dummy data
        mappedOptions.importType = options.sheetName;
        mappedOptions.sheetName = importTypeToSheetMap[options.sheetName];
      }

      // Generate filename based on original import type for better differentiation
      let filename = 'quran_association_import_template.xlsx';
      if (mappedOptions.sheetName) {
        if (mappedOptions.importType && mappedOptions.importType !== mappedOptions.sheetName) {
          // Use import type in filename for financial sheets (e.g., المصاريف instead of العمليات المالية)
          filename = `quran_association_${mappedOptions.importType}_template.xlsx`;
        } else {
          filename = `quran_association_${mappedOptions.sheetName}_template.xlsx`;
        }
      }

      const { filePath, canceled } = await dialog.showSaveDialog({
        title: 'Save Import Template',
        defaultPath: filename,
        filters: [{ name: 'Excel Files', extensions: ['xlsx'] }],
      });

      if (canceled) {
        return { success: false, message: 'Template generation canceled.' };
      }

      await generateExcelTemplate(filePath, mappedOptions);
      return { success: true };
    } catch (error) {
      logError('Failed to generate import template:', error);
      return { success: false, message: error.message };
    }
  });
}

module.exports = { registerImportHandlers };
