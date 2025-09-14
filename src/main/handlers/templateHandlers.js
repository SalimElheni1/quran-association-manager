const { ipcMain } = require('electron');
const { runQuery, allQuery, getQuery } = require('../../db/db');
const { log, error: logError } = require('../logger');

async function handleGetAllTemplates() {
  try {
    const templates = await allQuery('SELECT id, name, type, is_default, created_at, updated_at FROM export_templates ORDER BY name');
    return templates;
  } catch (error) {
    logError('Error getting all templates:', error);
    throw error;
  }
}

async function handleGetTemplateById(event, id) {
    try {
      const template = await getQuery('SELECT * FROM export_templates WHERE id = ?', [id]);
      if (!template) {
        return { success: false, message: 'Template not found.' };
      }
      return { success: true, data: template };
    } catch (error) {
      logError(`Error getting template by ID ${id}:`, error);
      return { success: false, message: error.message };
    }
}

async function handleUploadTemplate(event, { name, filePath }) {
    try {
        const content = fs.readFileSync(filePath);
        // a default template of type docx
        const type = 'docx';
        const result = await runQuery(
            'INSERT INTO export_templates (name, type, content) VALUES (?, ?, ?)',
            [name, type, content]
        );
        return { success: true, id: result.lastID };
    } catch (error) {
        logError('Error uploading template:', error);
        throw error;
    }
}

async function handleUpdateTemplate(event, { id, name, content }) {
    try {
      await runQuery(
        'UPDATE export_templates SET name = ?, content = ? WHERE id = ?',
        [name, content, id]
      );
      return { success: true };
    } catch (error) {
      logError(`Error updating template ${id}:`, error);
      return { success: false, message: error.message };
    }
}

async function handleDeleteTemplate(event, id) {
    try {
        const template = await getQuery('SELECT is_default FROM export_templates WHERE id = ?', [id]);
        if (template && template.is_default) {
            return { success: false, message: 'Cannot delete a default template.' };
        }
      await runQuery('DELETE FROM export_templates WHERE id = ?', [id]);
      return { success: true };
    } catch (error) {
      logError(`Error deleting template ${id}:`, error);
      return { success: false, message: error.message };
    }
}

async function handleDownloadTemplate(event, id) {
    try {
        const template = await getQuery('SELECT name, content FROM export_templates WHERE id = ?', [id]);
        if (!template) {
            return { success: false, error: 'Template not found.' };
        }
        const { filePath } = await dialog.showSaveDialog({
            title: 'Save Template',
            defaultPath: template.name,
        });

        if (filePath) {
            fs.writeFileSync(filePath, template.content);
            return { success: true, filePath };
        }
        return { success: false, error: 'Save cancelled.' };
    } catch (error) {
        logError(`Error downloading template ${id}:`, error);
        throw error;
    }
}

function registerTemplateHandlers() {
  ipcMain.handle('templates:get', handleGetAllTemplates);
  ipcMain.handle('templates:upload', handleUploadTemplate);
  ipcMain.handle('templates:delete', handleDeleteTemplate);
  ipcMain.handle('templates:download', handleDownloadTemplate);
  log('Template handlers registered.');
}

module.exports = { registerTemplateHandlers };
