const { ipcMain } = require('electron');
const { allQuery, runQuery, getQuery } = require('../../db/db');
const { error: logError } = require('../logger');
const { generateMatricule } = require('../services/matriculeService');
const { requireRoles } = require('../authMiddleware');

// --- Generic Error Handler ---
function createHandler(handler) {
  return async (event, ...args) => {
    try {
      return await handler(event, ...args);
    } catch (err) {
      logError(`Error in handler ${handler.name}:`, err.message);
      // Re-throw the error to be caught by the renderer process
      throw new Error(err.message || 'An unexpected error occurred in the main process.');
    }
  };
}

// --- Inventory Handlers ---
async function handleGetInventoryItems() {
  const query = 'SELECT * FROM inventory_items ORDER BY item_name ASC';
  return allQuery(query);
}

async function handleCheckItemUniqueness(event, { itemName, currentId }) {
  let sql = 'SELECT id FROM inventory_items WHERE item_name = ? COLLATE NOCASE';
  const params = [itemName];

  if (currentId) {
    sql += ' AND id != ?';
    params.push(currentId);
  }

  const result = await getQuery(sql, params);
  // If `result` is undefined (no item found), it's unique.
  // If `result` is an object (item found), it's not unique.
  return { isUnique: !result };
}

async function handleAddInventoryItem(event, item) {
  const {
    item_name,
    category,
    quantity,
    unit_value,
    acquisition_date,
    acquisition_source,
    condition_status,
    location,
    notes,
  } = item;

  const matricule = await generateMatricule('inventory');
  const total_value = (Number(quantity) || 0) * (Number(unit_value) || 0);

  const sql = `
    INSERT INTO inventory_items (
      matricule, item_name, category, quantity, unit_value, total_value,
      acquisition_date, acquisition_source, condition_status, location, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  const result = await runQuery(sql, [
    matricule,
    item_name,
    category,
    quantity,
    unit_value,
    total_value,
    acquisition_date,
    acquisition_source,
    condition_status,
    location,
    notes,
  ]);

  return getQuery('SELECT * FROM inventory_items WHERE id = ?', [result.id]);
}

async function handleUpdateInventoryItem(event, item) {
  const {
    id,
    item_name,
    category,
    quantity,
    unit_value,
    acquisition_date,
    acquisition_source,
    condition_status,
    location,
    notes,
  } = item;

  const total_value = (Number(quantity) || 0) * (Number(unit_value) || 0);

  const sql = `
    UPDATE inventory_items SET
      item_name = ?, category = ?, quantity = ?, unit_value = ?, total_value = ?,
      acquisition_date = ?, acquisition_source = ?, condition_status = ?, location = ?,
      notes = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `;
  await runQuery(sql, [
    item_name,
    category,
    quantity,
    unit_value,
    total_value,
    acquisition_date,
    acquisition_source,
    condition_status,
    location,
    notes,
    id,
  ]);

  return getQuery('SELECT * FROM inventory_items WHERE id = ?', [id]);
}

async function handleDeleteInventoryItem(event, itemId) {
  await runQuery('DELETE FROM inventory_items WHERE id = ?', [itemId]);
  return { id: itemId };
}

function registerInventoryHandlers() {
  ipcMain.handle('inventory:get', createHandler(handleGetInventoryItems));
  ipcMain.handle('inventory:check-uniqueness', createHandler(handleCheckItemUniqueness));
  ipcMain.handle('inventory:add', requireRoles(['Superadmin', 'Administrator'])(createHandler(handleAddInventoryItem)));
  ipcMain.handle('inventory:update', requireRoles(['Superadmin', 'Administrator'])(createHandler(handleUpdateInventoryItem)));
  ipcMain.handle('inventory:delete', requireRoles(['Superadmin', 'Administrator'])(createHandler(handleDeleteInventoryItem)));
}

module.exports = {
  registerInventoryHandlers,
};