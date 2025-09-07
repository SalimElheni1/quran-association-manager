const { registerAuthHandlers } = require('../src/main/handlers/authHandlers');
const { ipcMain } = require('electron');
const db = require('../src/db/db');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// Mock the dependencies
jest.mock('../src/db/db');
jest.mock('jsonwebtoken');
jest.mock('bcryptjs');

// Mock environment variables
process.env.JWT_SECRET = 'test-secret';

describe('Authentication Handlers', () => {
  beforeAll(() => {
    // Register the handlers once for all tests in this suite
    registerAuthHandlers();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('auth:login', () => {
    it('should login successfully with correct credentials', async () => {
      const mockUser = {
        id: 1,
        username: 'testuser',
        password: 'hashedPassword',
        role: 'Admin',
      };
      db.isDbOpen.mockReturnValue(true);
      db.getQuery.mockResolvedValue(mockUser);
      bcrypt.compare.mockResolvedValue(true);
      jwt.sign.mockReturnValue('mock-token');

      const result = await ipcMain.invoke('auth:login', {
        username: 'testuser',
        password: 'password123',
      });

      expect(db.initializeDatabase).not.toHaveBeenCalled();
      expect(db.getQuery).toHaveBeenCalledWith('SELECT * FROM users WHERE username = ?', [
        'testuser',
      ]);
      expect(bcrypt.compare).toHaveBeenCalledWith('password123', 'hashedPassword');
      expect(jwt.sign).toHaveBeenCalledWith(
        { id: 1, username: 'testuser', role: 'Admin' },
        'test-secret',
        { expiresIn: '8h' },
      );
      expect(result.success).toBe(true);
      expect(result.token).toBe('mock-token');
    });

    it('should initialize the database if it is not open', async () => {
      const mockUser = {
        id: 1,
        username: 'testuser',
        password: 'hashedPassword',
        role: 'Admin',
      };
      db.isDbOpen.mockReturnValue(false); // DB is not open
      db.initializeDatabase.mockResolvedValue(); // Mock initialization
      db.getQuery.mockResolvedValue(mockUser);
      bcrypt.compare.mockResolvedValue(true);
      jwt.sign.mockReturnValue('mock-token');

      await ipcMain.invoke('auth:login', {
        username: 'testuser',
        password: 'password123',
      });

      expect(db.initializeDatabase).toHaveBeenCalled();
    });

    it('should return an error for incorrect username', async () => {
      db.isDbOpen.mockReturnValue(true);
      db.getQuery.mockResolvedValue(null); // User not found

      const result = await ipcMain.invoke('auth:login', {
        username: 'wronguser',
        password: 'password123',
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('اسم المستخدم أو كلمة المرور غير صحيحة');
    });

    it('should return an error for incorrect password', async () => {
      const mockUser = {
        id: 1,
        username: 'testuser',
        password: 'hashedPassword',
        role: 'Admin',
      };
      db.isDbOpen.mockReturnValue(true);
      db.getQuery.mockResolvedValue(mockUser);
      bcrypt.compare.mockResolvedValue(false); // Password doesn't match

      const result = await ipcMain.invoke('auth:login', {
        username: 'testuser',
        password: 'wrongpassword',
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('اسم المستخدم أو كلمة المرور غير صحيحة');
    });

    it('should handle database errors during login', async () => {
      db.isDbOpen.mockReturnValue(true);
      db.getQuery.mockRejectedValue(new Error('DB connection failed'));

      const result = await ipcMain.invoke('auth:login', {
        username: 'testuser',
        password: 'password123',
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('DB connection failed');
      expect(db.closeDatabase).toHaveBeenCalled();
    });
  });

  describe('auth:getProfile', () => {
    it('should return user profile on valid token', async () => {
      const mockToken = 'valid-token';
      const mockUser = { id: 1, username: 'testuser', email: 'test@test.com' };

      jwt.verify.mockReturnValue({ id: 1 });
      db.getQuery.mockResolvedValue(mockUser);

      const result = await ipcMain.invoke('auth:getProfile', { token: mockToken });

      expect(jwt.verify).toHaveBeenCalledWith(mockToken, 'test-secret');
      expect(db.getQuery).toHaveBeenCalledWith(expect.any(String), [1]);
      expect(result).toEqual({ success: true, profile: mockUser });
    });

    it('should return an error if token is invalid', async () => {
      const mockToken = 'invalid-token';
      jwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      const result = await ipcMain.invoke('auth:getProfile', { token: mockToken });
      expect(result.success).toBe(false);
      expect(result.message).toBe('Invalid or expired authentication token.');
    });

    it('should return an error if user profile is not found', async () => {
      const mockToken = 'valid-token';
      jwt.verify.mockReturnValue({ id: 1 });
      db.getQuery.mockResolvedValue(null); // Simulate user not found

      const result = await ipcMain.invoke('auth:getProfile', { token: mockToken });
      expect(result.success).toBe(false);
      expect(result.message).toBe('User profile not found.');
    });
  });

  describe('auth:updateProfile', () => {
    const mockToken = 'valid-token';
    const mockUserId = 1;
    const mockProfileData = {
      username: 'testuser',
      role: 'Admin',
      first_name: 'Test',
      last_name: 'User',
      email: 'test@test.com',
      phone_number: '12345678',
      employment_type: 'volunteer',
      status: 'active',
    };

    beforeEach(() => {
      jwt.verify.mockReturnValue({ id: mockUserId });
    });

    it('should update profile successfully without password change', async () => {
      db.runQuery.mockResolvedValue({ changes: 1 });

      const result = await ipcMain.invoke('auth:updateProfile', {
        token: mockToken,
        profileData: mockProfileData,
      });

      const expectedParams = [
        mockProfileData.first_name,
        mockProfileData.last_name,
        mockProfileData.email,
        mockProfileData.phone_number,
        mockProfileData.employment_type,
        mockProfileData.status,
        mockUserId,
      ];
      expect(db.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET'),
        expect.arrayContaining(expectedParams),
      );
      expect(result).toEqual({ success: true, message: 'تم تحديث الملف الشخصي بنجاح.' });
    });

    it('should update profile successfully with password change', async () => {
      const profileWithPassword = {
        ...mockProfileData,
        current_password: 'oldPassword',
        new_password: 'newPassword',
        confirm_new_password: 'newPassword',
      };

      db.getQuery
        .mockResolvedValueOnce(null) // For username check
        .mockResolvedValueOnce({ password: 'hashedOldPassword' }); // For getting current password
      bcrypt.compare.mockResolvedValue(true);
      bcrypt.hash.mockResolvedValue('hashedNewPassword');
      db.runQuery.mockResolvedValue({ changes: 1 });

      const result = await ipcMain.invoke('auth:updateProfile', {
        token: mockToken,
        profileData: profileWithPassword,
      });

      expect(db.getQuery).toHaveBeenCalledWith('SELECT id FROM users WHERE username = ?', [
        profileWithPassword.username,
      ]);
      expect(db.getQuery).toHaveBeenCalledWith('SELECT password FROM users WHERE id = ?', [
        mockUserId,
      ]);
      expect(bcrypt.compare).toHaveBeenCalledWith('oldPassword', 'hashedOldPassword');
      expect(bcrypt.hash).toHaveBeenCalledWith('newPassword', 10);
      expect(db.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('password = ?'),
        expect.any(Array),
      );
      expect(result).toEqual({ success: true, message: 'تم تحديث الملف الشخصي بنجاح.' });
    });

    it('should return an error if current password does not match', async () => {
      const profileWithPassword = {
        ...mockProfileData,
        current_password: 'wrongOldPassword',
        new_password: 'newPassword',
        confirm_new_password: 'newPassword',
      };

      db.getQuery
        .mockResolvedValueOnce(null) // For username check
        .mockResolvedValueOnce({ password: 'hashedOldPassword' }); // For getting current password
      bcrypt.compare.mockResolvedValue(false); // Password doesn't match

      const result = await ipcMain.invoke('auth:updateProfile', {
        token: mockToken,
        profileData: profileWithPassword,
      });
      expect(result.success).toBe(false);
      expect(result.message).toBe('كلمة المرور الحالية غير صحيحة.');
    });

    it('should return a Joi validation error for invalid data', async () => {
      const invalidProfileData = { ...mockProfileData, email: 'not-an-email' };

      const result = await ipcMain.invoke('auth:updateProfile', {
        token: mockToken,
        profileData: invalidProfileData,
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('بيانات غير صالحة');
    });
  });
});
