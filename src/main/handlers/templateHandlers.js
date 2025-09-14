const { ipcMain } = require('electron');
const { runQuery, allQuery, getQuery } = require('../../db/db');
const { log, error: logError } = require('../logger');

async function handleGetAllTemplates() {
  try {
    const templates = await allQuery('SELECT id, name, type, is_default, created_at, updated_at FROM export_templates ORDER BY name');
    return { success: true, data: templates };
  } catch (error) {
    logError('Error getting all templates:', error);
    return { success: false, message: error.message };
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

async function handleCreateTemplate(event, { name, type, content }) {
  try {
    const result = await runQuery(
      'INSERT INTO export_templates (name, type, content) VALUES (?, ?, ?)',
      [name, type, content]
    );
    return { success: true, id: result.id };
  } catch (error) {
    logError('Error creating template:', error);
    return { success: false, message: error.message };
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

function registerTemplateHandlers() {
  ipcMain.handle('templates:get-all', handleGetAllTemplates);
  ipcMain.handle('templates:get-by-id', handleGetTemplateById);
  ipcMain.handle('templates:create', handleCreateTemplate);
  ipcMain.handle('templates:update', handleUpdateTemplate);
  ipcMain.handle('templates:delete', handleDeleteTemplate);
  log('Template handlers registered.');
}

module.exports = { registerTemplateHandlers };
