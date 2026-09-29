// tests/userHandlers.spec.js

// Mock dependencies at the top level
jest.mock('electron', () => ({ ipcMain: { handle: jest.fn() } }));
jest.mock('../src/db/db');
jest.mock('bcryptjs');
jest.mock('../src/main/validationSchemas');
jest.mock('../src/main/services/matriculeService');
jest.mock('../src/main/logger');
jest.mock('../src/main/authMiddleware', () => ({
  requireRoles: jest.fn(() => (handler) => handler),
}));

const { ipcMain } = require('electron');
const db = require('../src/db/db');
const {
  userValidationSchema,
  userUpdateValidationSchema,
} = require('../src/main/validationSchemas');
const { generateMatricule } = require('../src/main/services/matriculeService');

describe('userHandlers', () => {
  let registerUserHandlers;
  let handlers = {};

  beforeEach(() => {
    jest.clearAllMocks();

    registerUserHandlers = require('../src/main/handlers/userHandlers').registerUserHandlers;
    ipcMain.handle.mockImplementation((channel, handler) => {
      handlers[channel] = handler;
    });
    registerUserHandlers();
  });

  describe('users:get', () => {
    it('should fetch users and their roles', async () => {
      const mockUsers = [{ id: 1, username: 'test', roles: 'Administrator,Superadmin' }];
      db.allQuery.mockResolvedValue(mockUsers);
      const result = await handlers['users:get'](null, {});
      expect(db.allQuery).toHaveBeenCalled();
      expect(result.users[0].roles).toEqual(['Administrator', 'Superadmin']);
    });
  });

  describe('users:getById', () => {
    it('should fetch a single user with roles', async () => {
      const mockUser = { id: 1, username: 'test' };
      const mockRoles = [{ name: 'Administrator' }];
      db.getQuery.mockResolvedValue(mockUser);
      db.allQuery.mockResolvedValue(mockRoles);

      const result = await handlers['users:getById'](null, 1);

      expect(db.getQuery).toHaveBeenCalledWith(
        'SELECT id, branch_id, matricule, username, first_name, last_name, date_of_birth, national_id, email, phone_number, occupation, civil_status, employment_type, start_date, end_date, status, notes, need_guide, current_step FROM users WHERE id = ?',
        [1],
      );
      expect(db.allQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT r.name FROM roles'),
        [1],
      );
      expect(result.roles).toEqual(['Administrator']);
    });
  });

  describe('users:add', () => {
    it('should add a user and commit', async () => {
      const userData = {
        username: 'new',
        password: 'password',
        first_name: 'first',
        last_name: 'last',
        roles: ['Administrator'],
      };
      userValidationSchema.validateAsync.mockResolvedValue(userData);
      generateMatricule.mockResolvedValue('U-123456');
      db.runQuery.mockResolvedValue({ id: 99 });
      db.allQuery.mockResolvedValue([{ id: 1 }]); // Mock role ID lookup

      const result = await handlers['users:add'](null, userData);

      expect(db.withTransaction).toHaveBeenCalled();
      expect(db.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO users'),
        expect.any(Array),
      );
      expect(db.runQuery).toHaveBeenCalledWith(
        'INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)',
        [99, 1],
      );
      expect(result).toEqual({ success: true, id: 99 });
    });
  });

  describe('users:update', () => {
    it('should update a user and commit', async () => {
      const userData = { userData: { first_name: 'Updated' }, id: 1 };
      userUpdateValidationSchema.validateAsync.mockResolvedValue(userData.userData);
      db.allQuery.mockResolvedValue([]); // No roles to change

      const result = await handlers['users:update'](null, userData);

      expect(db.withTransaction).toHaveBeenCalled();
      expect(db.runQuery).toHaveBeenCalledWith(expect.stringContaining('UPDATE users SET'), [
        'Updated',
        1,
      ]);
      expect(result).toEqual({ success: true });
    });
  });

  describe('users:delete', () => {
    it('should delete a user successfully', async () => {
      db.getQuery.mockResolvedValue(undefined); // not a Superadmin
      db.runQuery.mockResolvedValue({ changes: 1 });
      await handlers['users:delete'](null, 1);
      expect(db.runQuery).toHaveBeenCalledWith('DELETE FROM users WHERE id = ?', [1]);
    });

    it('should throw error for invalid user ID', async () => {
      await expect(handlers['users:delete'](null, null)).rejects.toThrow(
        'A valid user ID is required for deletion.',
      );
    });

    it('should refuse to delete the logged-in user', async () => {
      const sessionManager = require('../src/main/sessionManager');
      sessionManager.createSession({ id: 77 }, { id: 5, username: 'me' }, null);

      await expect(handlers['users:delete']({ sender: { id: 77 } }, 5)).rejects.toThrow(
        'لا يمكنك حذف حسابك الخاص',
      );
      expect(db.runQuery).not.toHaveBeenCalled();
      sessionManager.revokeAllSessions();
    });

    it('should refuse to delete the last active Superadmin', async () => {
      db.getQuery.mockResolvedValueOnce({ yes: 1 }).mockResolvedValueOnce({ count: 0 });

      await expect(handlers['users:delete'](null, 2)).rejects.toThrow('آخر مدير نظام');
      expect(db.runQuery).not.toHaveBeenCalled();
    });

    it('should delete a Superadmin when another active one remains', async () => {
      db.getQuery.mockResolvedValueOnce({ yes: 1 }).mockResolvedValueOnce({ count: 1 });
      db.runQuery.mockResolvedValue({ changes: 1 });

      await handlers['users:delete'](null, 2);

      expect(db.runQuery).toHaveBeenCalledWith('DELETE FROM users WHERE id = ?', [2]);
    });
  });

  describe('users:update - last Superadmin', () => {
    it('should refuse to deactivate the last active Superadmin', async () => {
      userUpdateValidationSchema.validateAsync.mockResolvedValue({ status: 'inactive' });
      db.getQuery.mockResolvedValueOnce({ yes: 1 }).mockResolvedValueOnce({ count: 0 });

      await expect(
        handlers['users:update'](null, { id: 1, userData: { status: 'inactive' } }),
      ).rejects.toThrow('آخر مدير نظام');
      expect(db.runQuery).not.toHaveBeenCalled();
    });

    it('should refuse to remove the Superadmin role from the last one', async () => {
      userUpdateValidationSchema.validateAsync.mockResolvedValue({ status: 'active' });
      db.getQuery.mockResolvedValueOnce({ yes: 1 }).mockResolvedValueOnce({ count: 0 });

      await expect(
        handlers['users:update'](null, {
          id: 1,
          userData: { status: 'active', roles: ['Administrator'] },
        }),
      ).rejects.toThrow('آخر مدير نظام');
    });
  });
});
