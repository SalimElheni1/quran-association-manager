const { ipcMain } = require('electron');
const {
  registerInventoryHandlers,
  handleGetInventoryItems,
} = require('../src/main/handlers/inventoryHandlers');
const db = require('../src/db/db');
const { generateMatricule } = require('../src/main/services/matriculeService');

jest.mock('electron', () => ({
  app: {
    getPath: jest.fn().mockReturnValue('/mock/path'),
    relaunch: jest.fn(),
    quit: jest.fn(),
    on: jest.fn(),
    whenReady: jest.fn().mockResolvedValue(),
    isPackaged: true,
  },
  BrowserWindow: Object.assign(
    jest.fn(() => ({
      loadFile: jest.fn().mockResolvedValue(),
      webContents: {
        printToPDF: jest.fn().mockResolvedValue(Buffer.from('pdf-data')),
        send: jest.fn(),
        on: jest.fn(),
      },
      close: jest.fn(),
    })),
    { getAllWindows: jest.fn().mockReturnValue([]) },
  ),
  ipcMain: {
    handlers: new Map(),
    on: jest.fn(),
    handle: jest.fn(function (channel, listener) {
      this.handlers.set(channel, listener);
    }),
    invoke: jest.fn(async function (channel, ...args) {
      const handler = this.handlers.get(channel);
      if (handler) {
        const sessionManager = require('../src/main/sessionManager');
        sessionManager.createSession(
          { id: 1 },
          {
            id: 1,
            username: 'mock-user',
            roles: ['Superadmin', 'Administrator', 'FinanceManager', 'SessionSupervisor'],
          },
          null,
        );
        const mockEvent = { sender: { id: 1 } };
        return await handler(mockEvent, ...args);
      }
      throw new Error(`No handler registered for channel '${channel}'`);
    }),
  },
}));

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

      expect(db.allQuery).toHaveBeenCalledWith(
        'SELECT * FROM inventory_items WHERE deleted_at IS NULL ORDER BY item_name ASC',
        [],
      );
      expect(result).toEqual(mockItems);
    });

    it('should handle database errors', async () => {
      db.allQuery.mockRejectedValue(new Error('Database error'));

      await expect(ipcMain.invoke('inventory:get')).rejects.toThrow('Database error');
    });
  });

  describe('inventory:check-uniqueness', () => {
    it('always allows a repeated item name (several donations or purchases of one item)', async () => {
      await expect(
        ipcMain.invoke('inventory:check-uniqueness', { itemName: 'Existing Item', currentId: 5 }),
      ).resolves.toEqual({ isUnique: true });
      expect(db.getQuery).not.toHaveBeenCalled();
      expect(db.allQuery).not.toHaveBeenCalled();
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
        ],
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

      const [, params] = db.runQuery.mock.calls[0];
      expect(params[5]).toBe(0); // total_value
    });

    it('stores a total value of 0, not NaN, for a non-numeric quantity', async () => {
      generateMatricule.mockResolvedValue('INV-2024-003');
      db.runQuery.mockResolvedValue({ id: 3 });
      db.getQuery.mockResolvedValue({ id: 3 });

      await ipcMain.invoke('inventory:add', {
        item_name: 'New Item',
        quantity: 'invalid-number',
        unit_value: '10',
      });

      const [sql, params] = db.runQuery.mock.calls[0];
      expect(sql).toContain('INSERT INTO inventory_items');
      expect(params[5]).toBe(0); // total_value
    });

    it('multiplies numeric strings from the form', async () => {
      generateMatricule.mockResolvedValue('INV-2024-004');
      db.runQuery.mockResolvedValue({ id: 4 });
      db.getQuery.mockResolvedValue({ id: 4 });

      await ipcMain.invoke('inventory:add', {
        item_name: 'Mats',
        quantity: '4',
        unit_value: '12.5',
      });

      expect(db.runQuery.mock.calls[0][1][5]).toBe(50);
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
        ],
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

      const [, params] = db.runQuery.mock.calls[0];
      expect(params[4]).toBe(0); // total_value, when quantity/unit_value are null/undefined
      expect(params[10]).toBe(2); // WHERE id
    });
  });

  describe('inventory:delete', () => {
    it('should soft delete an inventory item by ID', async () => {
      db.runQuery.mockResolvedValue({ changes: 1 });

      const result = await ipcMain.invoke('inventory:delete', 1);

      expect(db.runQuery).toHaveBeenCalledWith(
        'UPDATE inventory_items SET deleted_at = ?, deleted_by = ? WHERE id = ? AND deleted_at IS NULL',
        [expect.any(String), 1, 1],
      );
      expect(result).toEqual({ id: 1 });
    });

    it('should list deleted items only when asked for', async () => {
      db.allQuery.mockResolvedValue([]);

      await ipcMain.invoke('inventory:get', { showDeleted: true });

      expect(db.allQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE deleted_at IS NOT NULL'),
        [],
      );
    });

    it('should restore a deleted inventory item', async () => {
      db.runQuery.mockResolvedValue({ changes: 1 });

      const result = await ipcMain.invoke('inventory:restore', 1);

      expect(db.runQuery).toHaveBeenCalledWith(
        'UPDATE inventory_items SET deleted_at = NULL, deleted_by = NULL WHERE id = ? AND deleted_at IS NOT NULL',
        [1],
      );
      expect(result).toEqual({ id: 1 });
    });

    it('should handle deletion errors', async () => {
      db.runQuery.mockRejectedValue(new Error('Delete failed'));

      await expect(ipcMain.invoke('inventory:delete', 999)).rejects.toThrow('Delete failed');
    });
  });

  describe('handleGetInventoryItems (used by the financial export)', () => {
    it('filters by search text and category, ignoring the "all" category', async () => {
      db.allQuery.mockResolvedValue([]);

      await handleGetInventoryItems(null, { search: 'مصحف', category: 'الكل' });

      const [sql, params] = db.allQuery.mock.calls[0];
      expect(sql).toContain(
        '(item_name LIKE ? OR category LIKE ? OR location LIKE ? OR matricule LIKE ?)',
      );
      expect(sql).not.toContain('category = ?');
      expect(params).toEqual(['%مصحف%', '%مصحف%', '%مصحف%', '%مصحف%']);
    });

    it('returns a page of items with the total count when paginated', async () => {
      db.getQuery.mockResolvedValue({ total: 51 });
      db.allQuery.mockResolvedValue([{ id: 26 }]);

      const result = await handleGetInventoryItems(null, { category: 'كتب', page: '2', limit: 25 });

      // The count runs on the same filter (the params array is reused, so only the SQL is checked).
      expect(db.getQuery.mock.calls[0][0]).toBe(
        'SELECT COUNT(*) as total FROM (SELECT * FROM inventory_items WHERE deleted_at IS NULL AND category = ?) as filtered_inventory',
      );
      expect(db.allQuery).toHaveBeenCalledWith(expect.stringContaining('LIMIT ? OFFSET ?'), [
        'كتب',
        25,
        25,
      ]);
      expect(result).toEqual({ items: [{ id: 26 }], total: 51, page: 2, limit: 25, totalPages: 3 });
    });
  });
});
