const { ipcMain } = require('electron');
const { registerInventoryHandlers, handleGetInventoryItems } = require('../src/main/handlers/inventoryHandlers');
const db = require('../src/db/db');
const { generateMatricule } = require('../src/main/services/matriculeService');

jest.mock('../src/db/db');
jest.mock('../src/main/services/matriculeService');
jest.mock('../src/main/logger');
jest.mock('../src/main/authMiddleware', () => ({
  requireRoles: jest.fn(() => (handler) => handler),
}));

describe('Inventory Handlers', () => {
  beforeAll(() => {
    registerInventoryHandlers();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('inventory:get', () => {
    it('should get all inventory items ordered by name', async () => {
      const mockItems = [
        { id: 1, item_name: 'Book A', quantity: 10 },
        { id: 2, item_name: 'Book B', quantity: 5 },
      ];
      db.allQuery.mockResolvedValue(mockItems);

      const result = await ipcMain.invoke('inventory:get');

      expect(db.allQuery).toHaveBeenCalledWith('SELECT * FROM inventory_items ORDER BY item_name ASC');
      expect(result).toEqual(mockItems);
    });

    it('should handle database errors', async () => {
      db.allQuery.mockRejectedValue(new Error('Database error'));

      await expect(ipcMain.invoke('inventory:get')).rejects.toThrow('Database error');
    });
  });

  describe('inventory:check-uniqueness', () => {
    it('should return isUnique true when item name does not exist', async () => {
      db.getQuery.mockResolvedValue(undefined);

      const result = await ipcMain.invoke('inventory:check-uniqueness', { itemName: 'New Item' });

      expect(db.getQuery).toHaveBeenCalledWith(
        'SELECT id FROM inventory_items WHERE item_name = ? COLLATE NOCASE',
        ['New Item']
      );
      expect(result).toEqual({ isUnique: true });
    });

    it('should return isUnique false when item name exists', async () => {
      db.getQuery.mockResolvedValue({ id: 1 });

      const result = await ipcMain.invoke('inventory:check-uniqueness', { itemName: 'Existing Item' });

      expect(result).toEqual({ isUnique: false });
    });

    it('should exclude current item when checking uniqueness for updates', async () => {
      db.getQuery.mockResolvedValue(undefined);

      await ipcMain.invoke('inventory:check-uniqueness', { itemName: 'Item', currentId: 5 });

      expect(db.getQuery).toHaveBeenCalledWith(
        'SELECT id FROM inventory_items WHERE item_name = ? COLLATE NOCASE AND id != ?',
        ['Item', 5]
      );
    });
  });

  describe('inventory:add', () => {
    it('should add a new inventory item with generated matricule', async () => {
      const itemData = {
        item_name: 'New Book',
        category: 'Books',
        quantity: 10,
        unit_value: 5.5,
        acquisition_date: '2024-01-01',
        acquisition_source: 'Donation',
        condition_status: 'Good',
        location: 'Storage A',
        notes: 'Test notes',
      };

      generateMatricule.mockResolvedValue('INV-2024-001');
      db.runQuery.mockResolvedValue({ id: 1 });
      db.getQuery.mockResolvedValue({ id: 1, ...itemData, matricule: 'INV-2024-001' });

      const result = await ipcMain.invoke('inventory:add', itemData);

      expect(generateMatricule).toHaveBeenCalledWith('inventory');
      expect(db.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO inventory_items'),
        [
          'INV-2024-001',
          'New Book',
          'Books',
          10,
          5.5,
          55, // total_value = quantity * unit_value
          '2024-01-01',
          'Donation',
          'Good',
          'Storage A',
          'Test notes',
        ]
      );
      expect(db.getQuery).toHaveBeenCalledWith('SELECT * FROM inventory_items WHERE id = ?', [1]);
      expect(result).toHaveProperty('matricule', 'INV-2024-001');
    });

    it('should calculate total_value correctly with zero values', async () => {
      const itemData = {
        item_name: 'Free Item',
        category: 'Misc',
        quantity: 0,
        unit_value: 0,
      };

      generateMatricule.mockResolvedValue('INV-2024-002');
      db.runQuery.mockResolvedValue({ id: 2 });
      db.getQuery.mockResolvedValue({ id: 2, ...itemData });

      await ipcMain.invoke('inventory:add', itemData);

      expect(db.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO inventory_items'),
        expect.arrayContaining([0]) // total_value should be 0
      );
    });
  });

  describe('inventory:update', () => {
    it('should update an existing inventory item', async () => {
      const itemData = {
        id: 1,
        item_name: 'Updated Book',
        category: 'Books',
        quantity: 15,
        unit_value: 6.0,
        acquisition_date: '2024-02-01',
        acquisition_source: 'Purchase',
        condition_status: 'Excellent',
        location: 'Storage B',
        notes: 'Updated notes',
      };

      db.runQuery.mockResolvedValue({ changes: 1 });
      db.getQuery.mockResolvedValue(itemData);

      const result = await ipcMain.invoke('inventory:update', itemData);

      expect(db.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE inventory_items SET'),
        [
          'Updated Book',
          'Books',
          15,
          6.0,
          90, // total_value = 15 * 6.0
          '2024-02-01',
          'Purchase',
          'Excellent',
          'Storage B',
          'Updated notes',
          1,
        ]
      );
      expect(db.getQuery).toHaveBeenCalledWith('SELECT * FROM inventory_items WHERE id = ?', [1]);
      expect(result).toEqual(itemData);
    });

    it('should handle updates with null or undefined values', async () => {
      const itemData = {
        id: 2,
        item_name: 'Item',
        category: 'Cat',
        quantity: null,
        unit_value: undefined,
      };

      db.runQuery.mockResolvedValue({ changes: 1 });
      db.getQuery.mockResolvedValue(itemData);

      await ipcMain.invoke('inventory:update', itemData);

      expect(db.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE inventory_items SET'),
        expect.arrayContaining([0]) // total_value should be 0 when quantity/unit_value are null/undefined
      );
    });
  });

  describe('inventory:delete', () => {
    it('should delete an inventory item by ID', async () => {
      db.runQuery.mockResolvedValue({ changes: 1 });

      const result = await ipcMain.invoke('inventory:delete', 1);

      expect(db.runQuery).toHaveBeenCalledWith('DELETE FROM inventory_items WHERE id = ?', [1]);
      expect(result).toEqual({ id: 1 });
    });

    it('should handle deletion errors', async () => {
      db.runQuery.mockRejectedValue(new Error('Delete failed'));

      await expect(ipcMain.invoke('inventory:delete', 999)).rejects.toThrow('Delete failed');
    });
  });

  describe('handleGetInventoryItems (direct export)', () => {
    it('should be callable directly', async () => {
      const mockItems = [{ id: 1, item_name: 'Test' }];
      db.allQuery.mockResolvedValue(mockItems);

      const result = await handleGetInventoryItems();

      expect(result).toEqual(mockItems);
    });
  });
});
