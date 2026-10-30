// tests/auth.spec.js

// Mock the dependencies
jest.mock('../src/db/db');
jest.mock('bcryptjs');
jest.mock('../src/main/logger');

// This mock is complex because the module under test builds a schema at the top level.
// We need to provide a mock that can be chained.
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
const sessionManager = require('../src/main/sessionManager');
const { registerAuthHandlers } = require('../src/main/handlers/authHandlers');

describe('Authentication Handlers', () => {
  let handlers = {};

  beforeEach(() => {
    jest.clearAllMocks();
    handlers = {};
    sessionManager.revokeAllSessions();
    ipcMain.handle.mockImplementation((channel, handler) => {
      handlers[channel] = handler;
    });
    registerAuthHandlers();
  });

  afterAll(() => {
    sessionManager.revokeAllSessions();
  });

  describe('auth:login', () => {
    it('should login successfully with correct credentials', async () => {
      const mockUser = { id: 1, username: 'testuser', password: 'hashedPassword', role: 'Admin' };
      db.isDbOpen.mockReturnValue(true);
      db.getQuery.mockResolvedValue(mockUser);
      bcrypt.compare.mockResolvedValue(true);

      const result = await handlers['auth:login'](null, {
        username: 'testuser',
        password: 'password123',
      });

      expect(result.success).toBe(true);
    });

    it('should create a main-process session for the sender on success', async () => {
      const mockUser = { id: 1, username: 'testuser', password: 'hashedPassword', role: 'Admin' };
      db.isDbOpen.mockReturnValue(true);
      db.getQuery.mockResolvedValue(mockUser);
      bcrypt.compare.mockResolvedValue(true);

      const result = await handlers['auth:login'](
        { sender: { id: 5 } },
        {
          username: 'testuser',
          password: 'password123',
        },
      );

      expect(result.success).toBe(true);
      expect(sessionManager.getSession(5)).toMatchObject({
        userId: 1,
        username: 'testuser',
      });
    });
  });

  describe('auth:updateProfile', () => {
    const mockUserId = 1;
    const mockProfileData = { username: 'testuser' };

    beforeEach(() => {
      sessionManager.createSession(
        { id: 5 },
        { id: mockUserId, username: 'testuser', roles: [] },
        null,
      );
      mockSchema.validateAsync.mockImplementation((data) => Promise.resolve(data));
    });

    it('should update profile successfully', async () => {
      db.runQuery.mockResolvedValue({ changes: 1 });
      db.getQuery.mockResolvedValue(null);

      const result = await handlers['auth:updateProfile'](
        { sender: { id: 5 } },
        { profileData: mockProfileData },
      );

      expect(result.success).toBe(true);
    });
  });
});
