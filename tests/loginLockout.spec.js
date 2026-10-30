// tests/loginLockout.spec.js
// Verifies the login attempt lockout: 5 consecutive failures for a username lock that username
// for 5 minutes (or until the lock window expires); other accounts can still log in.

const mockStoreData = {};

const mockStore = {
  get: jest.fn((key) => mockStoreData[key]),
  set: jest.fn((key, value) => {
    mockStoreData[key] = value;
  }),
  delete: jest.fn((key) => {
    delete mockStoreData[key];
  }),
};

jest.mock('electron-store', () => jest.fn().mockImplementation(() => mockStore));
jest.mock('bcryptjs');
jest.mock('jsonwebtoken');
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

const { ipcMain } = require('electron');
const db = require('../src/db/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { registerAuthHandlers, getLoginLockoutState } = require('../src/main/handlers/authHandlers');

describe('Login Attempt Lockout & Throttling', () => {
  let handlers = {};

  beforeEach(() => {
    jest.clearAllMocks();
    delete mockStoreData.login_lockouts;
    handlers = {};
    ipcMain.handle.mockImplementation((channel, handler) => {
      handlers[channel] = handler;
    });
    registerAuthHandlers();
  });

  const attemptLogin = (password = 'wrong-pass', username = 'admin') =>
    handlers['auth:login'](null, { username, password });

  it('should lock login after 5 consecutive failed attempts', async () => {
    db.isDbOpen.mockReturnValue(true);
    db.getQuery.mockResolvedValue(null);

    for (let i = 1; i <= 5; i++) {
      const result = await attemptLogin();
      expect(result.success).toBe(false);
      expect(result.message).toBe('اسم المستخدم أو كلمة المرور غير صحيحة');
    }

    const lockedResult = await attemptLogin();
    expect(lockedResult.success).toBe(false);
    expect(lockedResult.message).toContain('تم قفل تسجيل الدخول مؤقتاً');
    expect(lockedResult.message).toContain('دقيقة');
  });

  it('should reject login attempts while locked even with valid credentials', async () => {
    db.isDbOpen.mockReturnValue(true);
    db.getQuery.mockResolvedValue({ id: 1, username: 'admin', password: 'hashed' });
    bcrypt.compare.mockResolvedValue(true);

    mockStoreData.login_lockouts = {
      admin: {
        failCount: 5,
        lastFailAt: Date.now(),
        lockedUntil: Date.now() + 5 * 60 * 1000,
      },
    };

    const result = await attemptLogin('correct-password');
    expect(result.success).toBe(false);
    expect(result.message).toContain('تم قفل تسجيل الدخول مؤقتاً');
    expect(db.getQuery).not.toHaveBeenCalled();
  });

  it('should allow login after the lock window expires', async () => {
    db.isDbOpen.mockReturnValue(true);
    db.getQuery.mockResolvedValue({ id: 1, username: 'admin', password: 'hashed' });
    bcrypt.compare.mockResolvedValue(true);
    jwt.sign.mockReturnValue('mock-token');

    mockStoreData.login_lockouts = {
      admin: {
        failCount: 5,
        lastFailAt: Date.now() - 6 * 60 * 1000,
        lockedUntil: Date.now() - 60 * 1000,
      },
    };

    const result = await attemptLogin('correct-password');
    expect(result.success).toBe(true);
  });

  it('should clear the lockout state on successful login', async () => {
    db.isDbOpen.mockReturnValue(true);
    db.getQuery.mockResolvedValue({ id: 1, username: 'admin', password: 'hashed' });
    bcrypt.compare.mockResolvedValue(true);
    jwt.sign.mockReturnValue('mock-token');

    mockStoreData.login_lockouts = {
      admin: {
        failCount: 3,
        lastFailAt: Date.now(),
        lockedUntil: null,
      },
    };

    const result = await attemptLogin('correct-password');
    expect(result.success).toBe(true);
    expect(mockStoreData.login_lockouts.admin).toBeUndefined();
  });

  it('should reset the failure counter after the inactivity window', async () => {
    db.isDbOpen.mockReturnValue(true);
    db.getQuery.mockResolvedValue(null);

    mockStoreData.login_lockouts = {
      admin: {
        failCount: 4,
        lastFailAt: Date.now() - 6 * 60 * 1000,
        lockedUntil: null,
      },
    };

    const result = await attemptLogin();
    expect(result.success).toBe(false);
    expect(getLoginLockoutState('admin').failCount).toBe(1);
  });

  it('locks only the username that was guessed', async () => {
    db.isDbOpen.mockReturnValue(true);
    db.getQuery.mockResolvedValue(null);
    for (let i = 1; i <= 5; i++) await attemptLogin('wrong', 'admin');
    expect((await attemptLogin('wrong', 'Admin')).message).toContain('تم قفل تسجيل الدخول مؤقتاً');

    db.getQuery.mockResolvedValue({ id: 2, username: 'amal', password: 'hashed' });
    bcrypt.compare.mockResolvedValue(true);
    jwt.sign.mockReturnValue('mock-token');
    const other = await attemptLogin('right', 'amal');

    expect(other.success).toBe(true);
  });

  it('runs bcrypt for an unknown username too, so timing does not reveal which names exist', async () => {
    db.isDbOpen.mockReturnValue(true);
    db.getQuery.mockResolvedValue(null);
    bcrypt.compare.mockResolvedValue(false);

    const result = await attemptLogin('guess', 'nobody');

    expect(result.message).toBe('اسم المستخدم أو كلمة المرور غير صحيحة');
    expect(bcrypt.compare).toHaveBeenCalledWith('guess', expect.stringMatching(/^\$2a\$10\$/));
  });

  it('forgets the counters of other usernames once their window has passed', async () => {
    db.isDbOpen.mockReturnValue(true);
    db.getQuery.mockResolvedValue(null);
    mockStoreData.login_lockouts = {
      typo1: { failCount: 1, lastFailAt: Date.now() - 6 * 60 * 1000, lockedUntil: null },
      locked: { failCount: 5, lastFailAt: Date.now(), lockedUntil: Date.now() + 60 * 1000 },
    };

    await attemptLogin('wrong', 'admin');

    expect(Object.keys(mockStoreData.login_lockouts).sort()).toEqual(['admin', 'locked']);
  });
});
