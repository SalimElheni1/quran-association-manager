const { requireRoles } = require('../src/main/authMiddleware');
const sessionManager = require('../src/main/sessionManager');

describe('Auth Middleware', () => {
  afterEach(() => {
    jest.clearAllMocks();
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
