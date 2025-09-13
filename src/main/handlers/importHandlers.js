const { ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const { analyzeImportFile, processImport, COLUMN_MAPPINGS } = require('../importManager');

const TEMPLATE_FILES = {
  students: 'import_students_template.xlsx',
  teachers: 'import_teachers_template.xlsx',
  // Add other template mappings here as they become available
  // classes: 'import_classes_template.xlsx',
  // users: 'import_users_template.xlsx',
  // payments: 'import_financials_template.xlsx',
};


function registerImportHandlers() {
  ipcMain.handle('import:download-template', async (event, importType) => {
    const templateFileName = TEMPLATE_FILES[importType];
    if (!templateFileName) {
      return { success: false, message: 'نوع القالب غير معروف.' };
    }

    const sourcePath = path.join(
      __dirname,
      '..',
      'export_templates',
      'excel',
      'templates',
      templateFileName,
    );

    try {
      // Check if source file exists
      await fs.access(sourcePath);
    } catch (error) {
      console.error(`Template file not found at: ${sourcePath}`);
      return { success: false, message: `ملف القالب غير موجود: ${templateFileName}` };
    }

    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'حفظ ملف القالب',
      defaultPath: `template_${importType}.xlsx`,
      filters: [{ name: 'Excel Files', extensions: ['xlsx'] }],
    });

    if (canceled || !filePath) {
      return { success: false, message: 'تم إلغاء عملية الحفظ.' };
    }

    try {
      await fs.copyFile(sourcePath, filePath);
      return { success: true, message: `تم حفظ القالب بنجاح في: ${filePath}` };
    } catch (error) {
      console.error('Failed to save template file:', error);
      return { success: false, message: `فشل حفظ القالب: ${error.message}` };
    }
  });

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
