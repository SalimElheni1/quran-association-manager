// tests/superadminSetup.spec.js
// SEC-04: first-run superadmin setup — no default credentials ever exist.

jest.mock('../src/db/db');
jest.mock('bcryptjs');
jest.mock('../src/main/logger');
jest.mock('../src/main/sessionManager', () => ({
  createSession: jest.fn(),
  getSession: jest.fn(),
  revokeAllSessions: jest.fn(),
  revokeSession: jest.fn(),
}));

const mockSchema = {
  validateAsync: jest.fn(),
  keys: jest.fn().mockReturnThis(),
  with: jest.fn().mockReturnThis(),
};
jest.mock('../src/main/validationSchemas', () => ({
  profileUpdateValidationSchema: mockSchema,
  userUpdateValidationSchema: mockSchema,
  passwordUpdateValidationSchema: mockSchema,
}));

const { ipcMain } = require('electron');
const db = require('../src/db/db');
const bcrypt = require('bcryptjs');
const joi = require('joi');
const { registerAuthHandlers } = require('../src/main/handlers/authHandlers');

process.env.JWT_SECRET = 'test-secret';

describe('Superadmin first-run setup (SEC-04)', () => {
  let handlers = {};

  beforeEach(() => {
    jest.clearAllMocks();
    handlers = {};
    ipcMain.handle.mockImplementation((channel, handler) => {
      handlers[channel] = handler;
    });
    db.isDbOpen.mockReturnValue(true);
    registerAuthHandlers();
  });

  describe('auth:setup-superadmin', () => {
    it('should create the first superadmin when none exists', async () => {
      db.hasSuperadmin.mockResolvedValue(false);
      bcrypt.hash.mockResolvedValue('hashed-password');
      db.createSuperadminUser.mockResolvedValue({ id: 1, username: 'branch_admin' });

      const result = await handlers['auth:setup-superadmin'](null, {
        username: 'branch_admin',
        password: 'securePass123',
        confirm_password: 'securePass123',
      });

      expect(result.success).toBe(true);
      expect(result.username).toBe('branch_admin');
      expect(bcrypt.hash).toHaveBeenCalledWith('securePass123', 10);
      expect(db.createSuperadminUser).toHaveBeenCalledWith('branch_admin', 'hashed-password');
    });

    it('should hard-deny when a superadmin already exists', async () => {
      db.hasSuperadmin.mockResolvedValue(true);

      const result = await handlers['auth:setup-superadmin'](null, {
        username: 'branch_admin',
        password: 'securePass123',
        confirm_password: 'securePass123',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('مسبقاً');
      expect(db.createSuperadminUser).not.toHaveBeenCalled();
    });

    it('should reject when the database was imported with its own superadmin', async () => {
      db.hasSuperadmin.mockResolvedValue(true);

      const result = await handlers['auth:setup-superadmin'](null, {
        username: 'imported_admin',
        password: 'securePass123',
        confirm_password: 'securePass123',
      });

      expect(result.success).toBe(false);
      expect(db.createSuperadminUser).not.toHaveBeenCalled();
    });

    it('should reject a short password (min 6 chars)', async () => {
      db.hasSuperadmin.mockResolvedValue(false);
      joi.object().validateAsync.mockImplementationOnce(async (val) => {
        if (val.password && val.password.length < 6) {
          throw {
            isJoi: true,
            details: [{ message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' }],
          };
        }
        return val;
      });

      const result = await handlers['auth:setup-superadmin'](null, {
        username: 'branch_admin',
        password: '123',
        confirm_password: '123',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('6 أحرف');
      expect(db.createSuperadminUser).not.toHaveBeenCalled();
    });

    it('should reject mismatching passwords', async () => {
      db.hasSuperadmin.mockResolvedValue(false);
      joi.object().validateAsync.mockImplementationOnce(async (val) => {
        if (val.password !== val.confirm_password) {
          throw {
            isJoi: true,
            details: [{ message: 'كلمتا المرور غير متطابقتين' }],
          };
        }
        return val;
      });

      const result = await handlers['auth:setup-superadmin'](null, {
        username: 'branch_admin',
        password: 'securePass123',
        confirm_password: 'differentPass',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('غير متطابقتين');
      expect(db.createSuperadminUser).not.toHaveBeenCalled();
    });

    it('should reject non-latin usernames', async () => {
      db.hasSuperadmin.mockResolvedValue(false);
      joi.object().validateAsync.mockImplementationOnce(async (val) => {
        if (!/^[a-zA-Z0-9_]+$/.test(val.username)) {
          throw {
            isJoi: true,
            details: [{ message: 'اسم المستخدم يجب أن يكون بالإنجليزية: حروف وأرقام فقط' }],
          };
        }
        return val;
      });

      const result = await handlers['auth:setup-superadmin'](null, {
        username: 'مستخدم',
        password: 'securePass123',
        confirm_password: 'securePass123',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('بالإنجليزية');
    });

    it('should surface createSuperadminUser errors (e.g. duplicate username)', async () => {
      db.hasSuperadmin.mockResolvedValue(false);
      bcrypt.hash.mockResolvedValue('hashed-password');
      db.createSuperadminUser.mockRejectedValue(
        new Error('اسم المستخدم هذا موجود مسبقاً. الرجاء اختيار اسم آخر.'),
      );

      const result = await handlers['auth:setup-superadmin'](null, {
        username: 'taken_admin',
        password: 'securePass123',
        confirm_password: 'securePass123',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('موجود مسبقاً');
    });

    it('should not establish a session (user logs in afterwards)', async () => {
      db.hasSuperadmin.mockResolvedValue(false);
      bcrypt.hash.mockResolvedValue('hashed-password');
      db.createSuperadminUser.mockResolvedValue({ id: 1, username: 'branch_admin' });

      await handlers['auth:setup-superadmin'](
        { sender: { id: 7 } },
        {
          username: 'branch_admin',
          password: 'securePass123',
          confirm_password: 'securePass123',
        },
      );

      const sessionManager = require('../src/main/sessionManager');
      expect(sessionManager.createSession).not.toHaveBeenCalled();
    });
  });

  describe('auth:login — legacy default password safety net', () => {
    it('should flag mustChangePassword when the account still uses 123456', async () => {
      db.getQuery.mockResolvedValue({ id: 1, username: 'superadmin', password: 'default-hash' });
      bcrypt.compare.mockImplementation((plain, hash) => {
        return Promise.resolve(plain === '123456' ? hash === 'default-hash' : hash === 'real-hash');
      });
      bcrypt.compare.mockResolvedValueOnce(true).mockResolvedValueOnce(true);
      const jwt = require('jsonwebtoken');
      jwt.sign.mockReturnValue('mock-jwt-token');
      jwt.verify.mockReturnValue({ id: 1, exp: Math.floor(Date.now() / 1000) + 3600 });
      db.allQuery.mockResolvedValue([{ name: 'Superadmin' }]);

      const result = await handlers['auth:login'](
        { sender: { id: 9 } },
        {
          username: 'superadmin',
          password: '123456',
        },
      );

      expect(result.success).toBe(true);
      expect(result.mustChangePassword).toBe(true);
    });

    it('should not flag mustChangePassword for a changed password', async () => {
      db.getQuery.mockResolvedValue({ id: 1, username: 'superadmin', password: 'real-hash' });
      bcrypt.compare.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      const jwt = require('jsonwebtoken');
      jwt.sign.mockReturnValue('mock-jwt-token');
      jwt.verify.mockReturnValue({ id: 1, exp: Math.floor(Date.now() / 1000) + 3600 });
      db.allQuery.mockResolvedValue([{ name: 'Superadmin' }]);

      const result = await handlers['auth:login'](
        { sender: { id: 9 } },
        {
          username: 'superadmin',
          password: 'newSecurePass',
        },
      );

      expect(result.success).toBe(true);
      expect(result.mustChangePassword).toBe(false);
    });
  });
});
