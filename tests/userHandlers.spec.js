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

      expect(db.getQuery).toHaveBeenCalledWith('SELECT * FROM users WHERE id = ?', [1]);
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

      await handlers['users:add'](null, userData);

      expect(db.runQuery).toHaveBeenCalledWith('BEGIN TRANSACTION;');
      expect(db.runQuery).toHaveBeenCalledWith('COMMIT;');
      expect(db.runQuery).not.toHaveBeenCalledWith('ROLLBACK;');
    });
  });

  describe('users:update', () => {
    it('should update a user and commit', async () => {
      const userData = { userData: { first_name: 'Updated' }, id: 1 };
      userUpdateValidationSchema.validateAsync.mockResolvedValue(userData.userData);
      db.allQuery.mockResolvedValue([]); // No roles to change

      await handlers['users:update'](null, userData);

      expect(db.runQuery).toHaveBeenCalledWith('BEGIN TRANSACTION;');
      expect(db.runQuery).toHaveBeenCalledWith('COMMIT;');
      expect(db.runQuery).not.toHaveBeenCalledWith('ROLLBACK;');
    });
  });

  describe('users:delete', () => {
    it('should delete a user successfully', async () => {
      db.runQuery.mockResolvedValue({ changes: 1 });
      await handlers['users:delete'](null, 1);
      expect(db.runQuery).toHaveBeenCalledWith('DELETE FROM users WHERE id = ?', [1]);
    });

    it('should throw error for invalid user ID', () => {
      expect(() => handlers['users:delete'](null, null)).toThrow(
        'A valid user ID is required for deletion.',
      );
    });
  });
});
