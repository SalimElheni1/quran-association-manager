const jwt = require('jsonwebtoken');
const { getUserFromToken, requireRoles } = require('../src/main/authMiddleware');
const sessionManager = require('../src/main/sessionManager');
const db = require('../src/db/db');

jest.mock('jsonwebtoken');
jest.mock('../src/db/db');

describe('Auth Middleware', () => {
  const mockToken = 'valid.jwt.token';
  const mockSecret = 'test-secret';

  beforeAll(() => {
    process.env.JWT_SECRET = mockSecret;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getUserFromToken', () => {
    it('should return user with roles when token is valid', async () => {
      const mockDecoded = { id: 1 };
      const mockUser = { id: 1, username: 'testuser' };
      const mockRoles = [{ name: 'Administrator' }, { name: 'FinanceManager' }];

      jwt.verify.mockReturnValue(mockDecoded);
      db.getQuery.mockResolvedValue(mockUser);
      db.allQuery.mockResolvedValue(mockRoles);

      const result = await getUserFromToken(mockToken);

      expect(jwt.verify).toHaveBeenCalledWith(mockToken, mockSecret);
      expect(db.getQuery).toHaveBeenCalledWith('SELECT id, username FROM users WHERE id = ?', [1]);
      expect(db.allQuery).toHaveBeenCalledWith(
        'SELECT r.name FROM roles r JOIN user_roles ur ON r.id = ur.role_id WHERE ur.user_id = ?',
        [1],
      );
      expect(result).toEqual({
        id: 1,
        username: 'testuser',
        roles: ['Administrator', 'FinanceManager'],
      });
    });

    it('should throw error when token is not provided', async () => {
      await expect(getUserFromToken(null)).rejects.toThrow('Authentication token not provided.');
      await expect(getUserFromToken(undefined)).rejects.toThrow(
        'Authentication token not provided.',
      );
      await expect(getUserFromToken('')).rejects.toThrow('Authentication token not provided.');
    });

    it('should throw error when token is invalid', async () => {
      jwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(getUserFromToken('invalid.token')).rejects.toThrow(
        'Invalid or expired authentication token.',
      );
    });

    it('should throw error when user is not found', async () => {
      jwt.verify.mockReturnValue({ id: 999 });
      db.getQuery.mockResolvedValue(null);

      await expect(getUserFromToken(mockToken)).rejects.toThrow(
        'Invalid or expired authentication token.',
      );
    });

    it('should handle user with no roles', async () => {
      const mockDecoded = { id: 2 };
      const mockUser = { id: 2, username: 'noroles' };

      jwt.verify.mockReturnValue(mockDecoded);
      db.getQuery.mockResolvedValue(mockUser);
      db.allQuery.mockResolvedValue([]);

      const result = await getUserFromToken(mockToken);

      expect(result.roles).toEqual([]);
    });
  });

  describe('requireRoles', () => {
    const SENDER_ID = 42;
    const mockEvent = { sender: { id: SENDER_ID } };
    const mockHandler = jest.fn().mockResolvedValue({ success: true });

    beforeEach(() => {
      sessionManager.revokeAllSessions();
    });

    afterEach(() => {
      sessionManager.revokeAllSessions();
    });

    it('should allow access when user has required role', async () => {
      sessionManager.createSession(
        { id: SENDER_ID },
        { id: 1, username: 'admin', roles: ['Superadmin'] },
        null,
      );

      const wrappedHandler = requireRoles(['Superadmin', 'Administrator'])(mockHandler);
      const result = await wrappedHandler(mockEvent, 'arg1', 'arg2');

      expect(mockHandler).toHaveBeenCalledWith(mockEvent, 'arg1', 'arg2');
      expect(result).toEqual({ success: true });
    });

    it('should allow access when user has one of multiple required roles', async () => {
      sessionManager.createSession(
        { id: SENDER_ID },
        { id: 2, username: 'finance', roles: ['FinanceManager'] },
        null,
      );

      const wrappedHandler = requireRoles(['Superadmin', 'FinanceManager'])(mockHandler);
      await wrappedHandler(mockEvent);

      expect(mockHandler).toHaveBeenCalled();
    });

    it('should deny access when user does not have required role', async () => {
      sessionManager.createSession(
        { id: SENDER_ID },
        { id: 3, username: 'supervisor', roles: ['SessionSupervisor'] },
        null,
      );

      const wrappedHandler = requireRoles(['Superadmin', 'Administrator'])(mockHandler);

      await expect(wrappedHandler(mockEvent)).rejects.toThrow('غير مسموح به.');
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('should deny access when no session exists for the sender', async () => {
      const wrappedHandler = requireRoles(['Superadmin'])(mockHandler);

      await expect(wrappedHandler(mockEvent)).rejects.toThrow('مطلوب تسجيل الدخول.');
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('should deny access when the sender has no webContents id', async () => {
      sessionManager.createSession(
        { id: SENDER_ID },
        { id: 1, username: 'admin', roles: ['Superadmin'] },
        null,
      );

      const wrappedHandler = requireRoles(['Superadmin'])(mockHandler);

      await expect(wrappedHandler({ sender: {} })).rejects.toThrow('مطلوب تسجيل الدخول.');
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('should deny access when the session is expired', async () => {
      sessionManager.createSession(
        { id: SENDER_ID },
        { id: 1, username: 'admin', roles: ['Superadmin'] },
        Date.now() - 1000,
      );

      const wrappedHandler = requireRoles(['Superadmin'])(mockHandler);

      await expect(wrappedHandler(mockEvent)).rejects.toThrow('مطلوب تسجيل الدخول.');
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('should pass through handler errors', async () => {
      sessionManager.createSession(
        { id: SENDER_ID },
        { id: 1, username: 'admin', roles: ['Superadmin'] },
        null,
      );

      const errorHandler = jest.fn().mockRejectedValue(new Error('Handler error'));
      const wrappedHandler = requireRoles(['Superadmin'])(errorHandler);

      await expect(wrappedHandler(mockEvent)).rejects.toThrow('Handler error');
    });
  });
});
