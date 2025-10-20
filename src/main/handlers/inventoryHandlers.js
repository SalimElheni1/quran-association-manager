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
async function handleGetInventoryItems(event, filters = {}) {
  const { search, category, page, limit } = filters;

  let sql = 'SELECT * FROM inventory_items WHERE 1=1';
  const params = [];

  if (search) {
    sql += ' AND (item_name LIKE ? OR category LIKE ? OR location LIKE ? OR matricule LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }

  if (category && category !== 'الكل') {
    sql += ' AND category = ?';
    params.push(category);
  }

  // Check if pagination is requested
  const hasPagination = page !== undefined && limit !== undefined;

  if (hasPagination) {
    // Get total count for pagination
    const countSql = `SELECT COUNT(*) as total FROM (${sql}) as filtered_inventory`;
    const countResult = await getQuery(countSql, params);
    const totalCount = countResult?.total || 0;

    sql += ' ORDER BY item_name ASC';

    // Apply pagination
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 25;
    const offset = (pageNum - 1) * limitNum;

    sql += ' LIMIT ? OFFSET ?';
    params.push(limitNum, offset);

    const items = await allQuery(sql, params);

    return {
      items,
      total: totalCount,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(totalCount / limitNum),
    };
  } else {
    // Return direct array for backwards compatibility
    sql += ' ORDER BY item_name ASC';
    return allQuery(sql, params);
  }
}

async function handleCheckItemUniqueness(event, { itemName, currentId }) {
  // Allow duplicates for item names as multiple donations/purchases can have same item name
  return { isUnique: true };
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
  ipcMain.handle(
    'inventory:add',
    requireRoles(['Superadmin', 'Administrator'])(createHandler(handleAddInventoryItem)),
  );
  ipcMain.handle(
    'inventory:update',
    requireRoles(['Superadmin', 'Administrator'])(createHandler(handleUpdateInventoryItem)),
  );
  ipcMain.handle(
    'inventory:delete',
    requireRoles(['Superadmin', 'Administrator'])(createHandler(handleDeleteInventoryItem)),
  );
}

module.exports = {
  registerInventoryHandlers,
  handleGetInventoryItems,
};
