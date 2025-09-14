const { ipcMain, dialog } = require('electron');
const fs = require('fs');
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

async function handleUploadTemplate(event, { name, content }) {
    try {
        const type = 'docx'; // Currently only support docx
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

async function handleDeleteTemplate(event, id) {
    try {
        const template = await getQuery('SELECT is_default FROM export_templates WHERE id = ?', [id]);
        if (template && template.is_default) {
            throw new Error('Cannot delete a default template.');
        }
        await runQuery('DELETE FROM export_templates WHERE id = ?', [id]);
        return { success: true };
    } catch (error) {
        logError(`Error deleting template ${id}:`, error);
        throw error;
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
