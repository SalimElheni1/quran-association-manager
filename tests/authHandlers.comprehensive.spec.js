const { ipcMain } = require('electron');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Store = require('electron-store');
const db = require('../src/db/db');
const { registerAuthHandlers } = require('../src/main/handlers/authHandlers');

jest.mock('bcryptjs');
jest.mock('jsonwebtoken');
jest.mock('electron-store');
jest.mock('../src/db/db');
jest.mock('../src/main/logger');
jest.mock('../src/main/settingsManager', () => ({
  refreshSettings: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../src/main/handlers/settingsHandlers', () => ({
  internalGetSettingsHandler: jest.fn().mockResolvedValue({ settings: {} }),
}));

jest.mock('../src/main/validationSchemas', () => {
  const mockSchema = {
    validateAsync: jest.fn(),
    keys: jest.fn().mockReturnThis(),
    with: jest.fn().mockReturnThis(),
  };
  return {
    userUpdateValidationSchema: mockSchema,
    passwordUpdateValidationSchema: mockSchema,
  };
});

describe('Auth Handlers - Comprehensive', () => {
  let handlers = {};
  const mockStore = { set: jest.fn(), delete: jest.fn() };
  const {
    userUpdateValidationSchema,
    passwordUpdateValidationSchema,
  } = require('../src/main/validationSchemas');

  beforeAll(() => {
    process.env.JWT_SECRET = 'test-secret';
  });

  beforeEach(() => {
    jest.clearAllMocks();
    handlers = {};
    ipcMain.handle.mockImplementation((channel, handler) => {
      handlers[channel] = handler;
    });
    Store.mockImplementation(() => mockStore);
    userUpdateValidationSchema.validateAsync.mockImplementation((data) => Promise.resolve(data));
    passwordUpdateValidationSchema.validateAsync.mockImplementation((data) =>
      Promise.resolve(data),
    );
    registerAuthHandlers();
  });

  describe('auth:login', () => {
    it('should login successfully with valid credentials', async () => {
      const mockUser = { id: 1, username: 'admin', password: 'hashed', need_guide: 1 };
      const mockRoles = [{ name: 'Superadmin' }];

      db.isDbOpen.mockReturnValue(true);
      db.getQuery.mockResolvedValue(mockUser);
      db.allQuery.mockResolvedValue(mockRoles);
      bcrypt.compare.mockResolvedValue(true);
      jwt.sign.mockReturnValue('mock-jwt-token');

      const result = await handlers['auth:login'](null, { username: 'admin', password: 'pass123' });

      expect(result.success).toBe(true);
      expect(result.token).toBe('mock-jwt-token');
      expect(result.user.username).toBe('admin');
      expect(result.user.roles).toEqual(['Superadmin']);
      expect(result.user.need_guide).toBe(true);
    });

    it('should initialize database if not open', async () => {
      db.isDbOpen.mockReturnValue(false);
      db.initializeDatabase.mockResolvedValue(undefined);
      db.getQuery.mockResolvedValue({ id: 1, username: 'user', password: 'hash' });
      db.allQuery.mockResolvedValue([]);
      bcrypt.compare.mockResolvedValue(true);
      jwt.sign.mockReturnValue('token');

      await handlers['auth:login'](null, { username: 'user', password: 'pass' });

      expect(db.initializeDatabase).toHaveBeenCalled();
    });

    it('should return error for non-existent user', async () => {
      db.isDbOpen.mockReturnValue(true);
      db.getQuery.mockResolvedValue(null);

      const result = await handlers['auth:login'](null, {
        username: 'nonexistent',
        password: 'pass',
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('اسم المستخدم أو كلمة المرور غير صحيحة');
    });

    it('should return error for incorrect password', async () => {
      db.isDbOpen.mockReturnValue(true);
      db.getQuery.mockResolvedValue({ id: 1, username: 'user', password: 'hash' });
      bcrypt.compare.mockResolvedValue(false);

      const result = await handlers['auth:login'](null, { username: 'user', password: 'wrong' });

      expect(result.success).toBe(false);
      expect(result.message).toBe('اسم المستخدم أو كلمة المرور غير صحيحة');
    });

    it('should cache logo path on successful login', async () => {
      const { internalGetSettingsHandler } = require('../src/main/handlers/settingsHandlers');
      internalGetSettingsHandler.mockResolvedValue({
        settings: { regional_local_logo_path: '/path/to/logo.png' },
      });

      db.isDbOpen.mockReturnValue(true);
      db.getQuery.mockResolvedValue({ id: 1, username: 'user', password: 'hash' });
      db.allQuery.mockResolvedValue([]);
      bcrypt.compare.mockResolvedValue(true);
      jwt.sign.mockReturnValue('token');

      await handlers['auth:login'](null, { username: 'user', password: 'pass' });

      expect(mockStore.set).toHaveBeenCalledWith('cached_logo_path', '/path/to/logo.png');
    });

    it('should delete cached logo if no logo path in settings', async () => {
      const { internalGetSettingsHandler } = require('../src/main/handlers/settingsHandlers');
      internalGetSettingsHandler.mockResolvedValue({ settings: {} });

      db.isDbOpen.mockReturnValue(true);
      db.getQuery.mockResolvedValue({ id: 1, username: 'user', password: 'hash' });
      db.allQuery.mockResolvedValue([]);
      bcrypt.compare.mockResolvedValue(true);
      jwt.sign.mockReturnValue('token');

      await handlers['auth:login'](null, { username: 'user', password: 'pass' });

      expect(mockStore.delete).toHaveBeenCalledWith('cached_logo_path');
    });

    it('should handle database errors gracefully', async () => {
      db.isDbOpen.mockReturnValue(true);
      db.getQuery.mockRejectedValue(new Error('Database error'));

      const result = await handlers['auth:login'](null, { username: 'user', password: 'pass' });

      expect(result.success).toBe(false);
      expect(result.message).toBe('Database error');
    });

    it('should close database on non-password errors', async () => {
      db.isDbOpen.mockReturnValue(true);
      db.getQuery.mockRejectedValue(new Error('Connection failed'));
      db.closeDatabase.mockResolvedValue(undefined);

      await handlers['auth:login'](null, { username: 'user', password: 'pass' });

      expect(db.closeDatabase).toHaveBeenCalled();
    });

    it('should not close database on password errors', async () => {
      db.isDbOpen.mockReturnValue(true);
      db.getQuery.mockRejectedValue(new Error('Incorrect password or corrupt database.'));
      db.closeDatabase.mockResolvedValue(undefined);

      await handlers['auth:login'](null, { username: 'user', password: 'pass' });

      expect(db.closeDatabase).not.toHaveBeenCalled();
    });
  });

  describe('auth:getProfile', () => {
    it('should get user profile successfully', async () => {
      const mockUser = {
        id: 1,
        username: 'user',
        first_name: 'John',
        need_guide: 1,
        current_step: 2,
      };
      const mockRoles = [{ name: 'Administrator' }];

      jwt.verify.mockReturnValue({ id: 1 });
      db.getQuery.mockResolvedValue(mockUser);
      db.allQuery.mockResolvedValue(mockRoles);

      const result = await handlers['auth:getProfile'](null, { token: 'valid-token' });

      expect(result.success).toBe(true);
      expect(result.profile.username).toBe('user');
      expect(result.profile.roles).toEqual(['Administrator']);
      expect(result.profile.need_guide).toBe(true);
      expect(result.profile.current_step).toBe(2);
    });

    it('should normalize need_guide to boolean', async () => {
      jwt.verify.mockReturnValue({ id: 1 });
      db.getQuery.mockResolvedValue({ id: 1, username: 'user', need_guide: 0, current_step: 0 });
      db.allQuery.mockResolvedValue([]);

      const result = await handlers['auth:getProfile'](null, { token: 'token' });

      expect(result.profile.need_guide).toBe(false);
    });

    it('should normalize current_step to number', async () => {
      jwt.verify.mockReturnValue({ id: 1 });
      db.getQuery.mockResolvedValue({ id: 1, username: 'user', current_step: '3' });
      db.allQuery.mockResolvedValue([]);

      const result = await handlers['auth:getProfile'](null, { token: 'token' });

      expect(result.profile.current_step).toBe(3);
    });

    it('should return error for missing token', async () => {
      jwt.verify.mockImplementation(() => {
        throw new Error('Authentication token not provided.');
      });

      const result = await handlers['auth:getProfile'](null, { token: null });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Authentication token not provided');
    });

    it('should return error for invalid token', async () => {
      jwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      const result = await handlers['auth:getProfile'](null, { token: 'invalid' });

      expect(result.success).toBe(false);
    });

    it('should return error when user not found', async () => {
      jwt.verify.mockReturnValue({ id: 999 });
      db.getQuery.mockResolvedValue(null);

      const result = await handlers['auth:getProfile'](null, { token: 'token' });

      expect(result.success).toBe(false);
      expect(result.message).toBe('User profile not found.');
    });
  });

  describe('auth:updateProfile', () => {
    beforeEach(() => {
      jwt.verify.mockReturnValue({ id: 1 });
    });

    it('should update profile successfully', async () => {
      db.getQuery.mockResolvedValue(null);
      db.runQuery.mockResolvedValue({ changes: 1 });

      const result = await handlers['auth:updateProfile'](null, {
        token: 'token',
        profileData: { first_name: 'John', last_name: 'Doe' },
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe('تم تحديث الملف الشخصي بنجاح.');
    });

    it('should check username uniqueness', async () => {
      db.getQuery.mockResolvedValue({ id: 2 });

      const result = await handlers['auth:updateProfile'](null, {
        token: 'token',
        profileData: { username: 'existing' },
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('اسم المستخدم هذا موجود مسبقاً');
    });

    it('should allow updating to same username', async () => {
      db.getQuery.mockResolvedValueOnce({ id: 1 });
      db.runQuery.mockResolvedValue({ changes: 1 });

      const result = await handlers['auth:updateProfile'](null, {
        token: 'token',
        profileData: { username: 'sameuser' },
      });

      expect(result.success).toBe(true);
    });

    it('should return message when no fields to update', async () => {
      userUpdateValidationSchema.validateAsync.mockResolvedValue({});

      const result = await handlers['auth:updateProfile'](null, {
        token: 'token',
        profileData: {},
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe('لم يتم تحديث أي بيانات.');
    });

    it('should handle validation errors', async () => {
      const validationError = new Error('Validation failed');
      validationError.isJoi = true;
      validationError.details = [{ message: 'Invalid field' }];
      userUpdateValidationSchema.validateAsync.mockRejectedValue(validationError);

      const result = await handlers['auth:updateProfile'](null, {
        token: 'token',
        profileData: { invalid: 'data' },
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('بيانات غير صالحة');
    });
  });

  describe('auth:updatePassword', () => {
    beforeEach(() => {
      jwt.verify.mockReturnValue({ id: 1 });
    });

    it('should return error when user not found', async () => {
      db.getQuery.mockResolvedValue(null);

      const result = await handlers['auth:updatePassword'](null, {
        token: 'token',
        passwordData: { current_password: 'old', new_password: 'new' },
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('User not found.');
    });

    it('should handle validation errors', async () => {
      const validationError = new Error('Validation failed');
      validationError.isJoi = true;
      validationError.details = [{ message: 'Password too short' }];
      passwordUpdateValidationSchema.validateAsync.mockRejectedValue(validationError);

      const result = await handlers['auth:updatePassword'](null, {
        token: 'token',
        passwordData: { current_password: 'old', new_password: '123' },
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('بيانات غير صالحة');
    });

    it('should handle database errors', async () => {
      db.getQuery.mockResolvedValue({ password: 'hash' });
      bcrypt.compare.mockResolvedValue(true);
      bcrypt.hash.mockResolvedValue('newhash');
      db.runQuery.mockRejectedValue(new Error('DB error'));

      const result = await handlers['auth:updatePassword'](null, {
        token: 'token',
        passwordData: { current_password: 'old', new_password: 'new' },
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('DB error');
    });
  });
});
