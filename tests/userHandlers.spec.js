const { registerUserHandlers } = require('../src/main/handlers/userHandlers');

// Mock dependencies
jest.mock('electron', () => ({
  ipcMain: {
    handle: jest.fn(),
  },
}));
jest.mock('../../db/db');
jest.mock('bcryptjs');
jest.mock('../src/main/validationSchemas');
jest.mock('../src/main/matriculeService');
jest.mock('../src/main/logger', () => ({
  error: jest.fn(),
}));

const { ipcMain } = require('electron');
const db = require('../../db/db');
const bcrypt = require('bcryptjs');
const { userValidationSchema, userUpdateValidationSchema } = require('../src/main/validationSchemas');
const { generateMatricule } = require('../src/main/matriculeService');
const { error: logError } = require('../src/main/logger');

describe('userHandlers', () => {
  let handlers = {};

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Capture registered handlers
    ipcMain.handle.mockImplementation((channel, handler) => {
      handlers[channel] = handler;
    });
    
    registerUserHandlers();
  });

  describe('users:get', () => {
    it('should get all users without filters', async () => {
      const mockUsers = [
        { id: 1, username: 'admin', first_name: 'Admin', last_name: 'User', role: 'Superadmin' }
      ];
      db.allQuery.mockResolvedValue(mockUsers);

      const result = await handlers['users:get'](null, {});

      expect(db.allQuery).toHaveBeenCalledWith(
        'SELECT id, matricule, username, first_name, last_name, email, role, status, need_guide, current_step FROM users WHERE 1=1 ORDER BY username ASC',
        []
      );
      expect(result).toBe(mockUsers);
    });

    it('should get users with search term filter', async () => {
      const mockUsers = [
        { id: 1, username: 'admin', first_name: 'Admin', last_name: 'User' }
      ];
      db.allQuery.mockResolvedValue(mockUsers);

      const result = await handlers['users:get'](null, { searchTerm: 'admin' });

      expect(db.allQuery).toHaveBeenCalledWith(
        expect.stringContaining('AND (username LIKE ? OR first_name LIKE ? OR last_name LIKE ? OR matricule LIKE ?)'),
        ['%admin%', '%admin%', '%admin%', '%admin%']
      );
      expect(result).toBe(mockUsers);
    });

    it('should get users with role filter', async () => {
      const mockUsers = [
        { id: 1, username: 'admin', role: 'Superadmin' }
      ];
      db.allQuery.mockResolvedValue(mockUsers);

      const result = await handlers['users:get'](null, { roleFilter: 'Superadmin' });

      expect(db.allQuery).toHaveBeenCalledWith(
        expect.stringContaining('AND role = ?'),
        ['Superadmin']
      );
      expect(result).toBe(mockUsers);
    });

    it('should get users with status filter', async () => {
      const mockUsers = [
        { id: 1, username: 'admin', status: 'active' }
      ];
      db.allQuery.mockResolvedValue(mockUsers);

      const result = await handlers['users:get'](null, { statusFilter: 'active' });

      expect(db.allQuery).toHaveBeenCalledWith(
        expect.stringContaining('AND status = ?'),
        ['active']
      );
      expect(result).toBe(mockUsers);
    });

    it('should ignore "all" filters', async () => {
      const mockUsers = [];
      db.allQuery.mockResolvedValue(mockUsers);

      await handlers['users:get'](null, { roleFilter: 'all', statusFilter: 'all' });

      expect(db.allQuery).toHaveBeenCalledWith(
        'SELECT id, matricule, username, first_name, last_name, email, role, status, need_guide, current_step FROM users WHERE 1=1 ORDER BY username ASC',
        []
      );
    });

    it('should combine multiple filters', async () => {
      const mockUsers = [];
      db.allQuery.mockResolvedValue(mockUsers);

      await handlers['users:get'](null, {
        searchTerm: 'john',
        roleFilter: 'Admin',
        statusFilter: 'active'
      });

      expect(db.allQuery).toHaveBeenCalledWith(
        expect.stringContaining('AND (username LIKE ? OR first_name LIKE ? OR last_name LIKE ? OR matricule LIKE ?) AND role = ? AND status = ?'),
        ['%john%', '%john%', '%john%', '%john%', 'Admin', 'active']
      );
    });
  });

  describe('users:getById', () => {
    it('should get user by id', async () => {
      const mockUser = { id: 1, username: 'admin', first_name: 'Admin' };
      db.getQuery.mockResolvedValue(mockUser);

      const result = await handlers['users:getById'](null, 1);

      expect(db.getQuery).toHaveBeenCalledWith('SELECT * FROM users WHERE id = ?', [1]);
      expect(result).toBe(mockUser);
    });
  });

  describe('users:add', () => {
    it('should add new user successfully', async () => {
      const userData = {
        username: 'newuser',
        password: 'password123',
        first_name: 'New',
        last_name: 'User',
        role: 'Admin',
        employment_type: 'contract'
      };
      const mockMatricule = 'U-001';
      const mockValidatedData = { ...userData, matricule: mockMatricule };
      const mockResult = { id: 1, changes: 1 };

      generateMatricule.mockResolvedValue(mockMatricule);
      userValidationSchema.validateAsync.mockResolvedValue(mockValidatedData);
      bcrypt.hashSync.mockReturnValue('hashed-password');
      db.runQuery.mockResolvedValue(mockResult);

      const result = await handlers['users:add'](null, userData);

      expect(generateMatricule).toHaveBeenCalledWith('user');
      expect(userValidationSchema.validateAsync).toHaveBeenCalledWith(
        { ...userData, matricule: mockMatricule },
        { abortEarly: false, stripUnknown: false }
      );
      expect(bcrypt.hashSync).toHaveBeenCalledWith('password123', 10);
      expect(db.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO users'),
        expect.arrayContaining([mockMatricule, 'newuser', 'hashed-password'])
      );
      expect(result).toBe(mockResult);
    });

    it('should add user without password', async () => {
      const userData = {
        username: 'newuser',
        first_name: 'New',
        last_name: 'User',
        role: 'Admin',
        employment_type: 'contract'
      };
      const mockMatricule = 'U-001';
      const mockValidatedData = { ...userData, matricule: mockMatricule };

      generateMatricule.mockResolvedValue(mockMatricule);
      userValidationSchema.validateAsync.mockResolvedValue(mockValidatedData);
      db.runQuery.mockResolvedValue({ id: 1 });

      await handlers['users:add'](null, userData);

      expect(bcrypt.hashSync).not.toHaveBeenCalled();
      expect(db.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO users'),
        expect.not.arrayContaining(['hashed-password'])
      );
    });

    it('should handle validation errors', async () => {
      const userData = { username: 'invalid' };
      const validationError = {
        isJoi: true,
        details: [{ message: 'First name is required' }]
      };

      generateMatricule.mockResolvedValue('U-001');
      userValidationSchema.validateAsync.mockRejectedValue(validationError);

      await expect(handlers['users:add'](null, userData))
        .rejects.toThrow('بيانات غير صالحة: First name is required');
    });

    it('should handle database errors', async () => {
      const userData = { username: 'newuser', first_name: 'New', last_name: 'User' };
      const dbError = new Error('Database connection failed');

      generateMatricule.mockResolvedValue('U-001');
      userValidationSchema.validateAsync.mockResolvedValue(userData);
      db.runQuery.mockRejectedValue(dbError);

      await expect(handlers['users:add'](null, userData))
        .rejects.toThrow('حدث خطأ غير متوقع في الخادم.');

      expect(logError).toHaveBeenCalledWith('Error in users:add handler:', dbError);
    });

    it('should throw error when no valid fields to insert', async () => {
      const userData = {};
      const mockValidatedData = {};

      generateMatricule.mockResolvedValue('U-001');
      userValidationSchema.validateAsync.mockResolvedValue(mockValidatedData);

      await expect(handlers['users:add'](null, userData))
        .rejects.toThrow('No valid fields to insert.');
    });
  });

  describe('users:update', () => {
    it('should update user successfully', async () => {
      const userData = {
        username: 'updateduser',
        first_name: 'Updated',
        last_name: 'User',
        password: 'newpassword'
      };
      const mockValidatedData = { ...userData };
      const mockResult = { changes: 1 };

      userUpdateValidationSchema.validateAsync.mockResolvedValue(mockValidatedData);
      bcrypt.hashSync.mockReturnValue('hashed-new-password');
      db.runQuery.mockResolvedValue(mockResult);

      const result = await handlers['users:update'](null, { id: 1, userData });

      expect(userUpdateValidationSchema.validateAsync).toHaveBeenCalledWith(
        userData,
        { abortEarly: false, stripUnknown: false }
      );
      expect(bcrypt.hashSync).toHaveBeenCalledWith('newpassword', 10);
      expect(db.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET'),
        expect.arrayContaining(['hashed-new-password', 1])
      );
      expect(result).toBe(mockResult);
    });

    it('should update user without password', async () => {
      const userData = {
        username: 'updateduser',
        first_name: 'Updated',
        last_name: 'User'
      };
      const mockValidatedData = { ...userData };

      userUpdateValidationSchema.validateAsync.mockResolvedValue(mockValidatedData);
      db.runQuery.mockResolvedValue({ changes: 1 });

      await handlers['users:update'](null, { id: 1, userData });

      expect(bcrypt.hashSync).not.toHaveBeenCalled();
      expect(db.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET'),
        expect.not.arrayContaining(['hashed-password'])
      );
    });

    it('should exclude matricule from update', async () => {
      const userData = {
        matricule: 'U-001',
        username: 'updateduser',
        first_name: 'Updated'
      };
      const mockValidatedData = { ...userData };

      userUpdateValidationSchema.validateAsync.mockResolvedValue(mockValidatedData);
      db.runQuery.mockResolvedValue({ changes: 1 });

      await handlers['users:update'](null, { id: 1, userData });

      expect(db.runQuery).toHaveBeenCalledWith(
        expect.not.stringContaining('matricule ='),
        expect.arrayContaining([1])
      );
    });

    it('should handle validation errors', async () => {
      const userData = { username: '' };
      const validationError = {
        isJoi: true,
        details: [{ message: 'Username cannot be empty' }]
      };

      userUpdateValidationSchema.validateAsync.mockRejectedValue(validationError);

      await expect(handlers['users:update'](null, { id: 1, userData }))
        .rejects.toThrow('بيانات غير صالحة: Username cannot be empty');
    });

    it('should handle database errors', async () => {
      const userData = { username: 'updateduser' };
      const dbError = new Error('Database error');

      userUpdateValidationSchema.validateAsync.mockResolvedValue(userData);
      db.runQuery.mockRejectedValue(dbError);

      await expect(handlers['users:update'](null, { id: 1, userData }))
        .rejects.toThrow('حدث خطأ غير متوقع في الخادم.');

      expect(logError).toHaveBeenCalledWith('Error in users:update handler:', dbError);
    });
  });

  describe('users:delete', () => {
    it('should delete user successfully', async () => {
      const mockResult = { changes: 1 };
      db.runQuery.mockResolvedValue(mockResult);

      const result = await handlers['users:delete'](null, 1);

      expect(db.runQuery).toHaveBeenCalledWith('DELETE FROM users WHERE id = ?', [1]);
      expect(result).toBe(mockResult);
    });

    it('should throw error for invalid user ID', async () => {
      await expect(handlers['users:delete'](null, null))
        .rejects.toThrow('A valid user ID is required for deletion.');

      await expect(handlers['users:delete'](null, 'invalid'))
        .rejects.toThrow('A valid user ID is required for deletion.');
    });
  });

  describe('users:updateGuide', () => {
    it('should update guide fields successfully', async () => {
      const guideData = {
        need_guide: true,
        current_step: 5
      };
      db.runQuery.mockResolvedValue({ changes: 1 });

      const result = await handlers['users:updateGuide'](null, { id: 1, guideData });

      expect(db.runQuery).toHaveBeenCalledWith(
        'UPDATE users SET need_guide = ?, current_step = ? WHERE id = ?',
        [1, 5, 1]
      );
      expect(result).toEqual({ success: true });
    });

    it('should handle string ID conversion', async () => {
      const guideData = { need_guide: false };
      db.runQuery.mockResolvedValue({ changes: 1 });

      const result = await handlers['users:updateGuide'](null, { id: '2', guideData });

      expect(db.runQuery).toHaveBeenCalledWith(
        'UPDATE users SET need_guide = ? WHERE id = ?',
        [0, 2]
      );
      expect(result).toEqual({ success: true });
    });

    it('should handle boolean conversion for need_guide', async () => {
      const guideData = {
        need_guide: false,
        current_step: '3'
      };
      db.runQuery.mockResolvedValue({ changes: 1 });

      await handlers['users:updateGuide'](null, { id: 1, guideData });

      expect(db.runQuery).toHaveBeenCalledWith(
        'UPDATE users SET need_guide = ?, current_step = ? WHERE id = ?',
        [0, 3, 1]
      );
    });

    it('should handle invalid current_step values', async () => {
      const guideData = {
        need_guide: true,
        current_step: 'invalid'
      };
      db.runQuery.mockResolvedValue({ changes: 1 });

      await handlers['users:updateGuide'](null, { id: 1, guideData });

      expect(db.runQuery).toHaveBeenCalledWith(
        'UPDATE users SET need_guide = ?, current_step = ? WHERE id = ?',
        [1, 0, 1]
      );
    });

    it('should return success when no fields to update', async () => {
      const guideData = {};

      const result = await handlers['users:updateGuide'](null, { id: 1, guideData });

      expect(db.runQuery).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        message: 'No guide fields to update.'
      });
    });

    it('should handle invalid user ID', async () => {
      const guideData = { need_guide: true };

      const result = await handlers['users:updateGuide'](null, { id: null, guideData });

      expect(result).toEqual({
        success: false,
        message: 'A valid user ID is required.'
      });
    });

    it('should handle NaN user ID', async () => {
      const guideData = { need_guide: true };

      const result = await handlers['users:updateGuide'](null, { id: 'invalid', guideData });

      expect(result).toEqual({
        success: false,
        message: 'A valid user ID is required.'
      });
    });

    it('should handle database errors', async () => {
      const guideData = { need_guide: true };
      const dbError = new Error('Database error');
      db.runQuery.mockRejectedValue(dbError);

      const result = await handlers['users:updateGuide'](null, { id: 1, guideData });

      expect(logError).toHaveBeenCalledWith('Error in users:updateGuide handler:', dbError);
      expect(result).toEqual({
        success: false,
        message: 'Database error'
      });
    });

    it('should handle errors without message', async () => {
      const guideData = { need_guide: true };
      const dbError = new Error();
      dbError.message = '';
      db.runQuery.mockRejectedValue(dbError);

      const result = await handlers['users:updateGuide'](null, { id: 1, guideData });

      expect(result).toEqual({
        success: false,
        message: 'Failed to update guide fields.'
      });
    });
  });
});