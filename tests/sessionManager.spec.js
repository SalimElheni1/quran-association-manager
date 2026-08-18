const sessionManager = require('../src/main/sessionManager');

describe('sessionManager', () => {
  afterEach(() => {
    sessionManager.revokeAllSessions();
  });

  describe('createSession', () => {
    it('creates a session bound to the sender id', () => {
      const session = sessionManager.createSession(
        { id: 7 },
        { id: 1, username: 'admin', roles: ['Superadmin'] },
        null,
      );

      expect(session).toMatchObject({
        userId: 1,
        username: 'admin',
        roles: ['Superadmin'],
        expiresAt: null,
      });
      expect(session.createdAt).toBeGreaterThan(0);
      expect(sessionManager.getSession(7)).toBe(session);
    });

    it('defaults missing roles to an empty array', () => {
      const session = sessionManager.createSession({ id: 1 }, { id: 5, username: 'u' }, null);
      expect(session.roles).toEqual([]);
      expect(session.username).toBe('u');
    });

    it('returns null and stores nothing without a numeric sender id', () => {
      expect(sessionManager.createSession(null, { id: 1 }, null)).toBeNull();
      expect(sessionManager.createSession({}, { id: 1 }, null)).toBeNull();
      expect(sessionManager.createSession({ id: 'x' }, { id: 1 }, null)).toBeNull();
      expect(sessionManager.getSession(undefined)).toBeNull();
    });

    it('returns null without a user id', () => {
      expect(sessionManager.createSession({ id: 1 }, { username: 'u' }, null)).toBeNull();
      expect(sessionManager.getSession(1)).toBeNull();
    });
  });

  describe('getSession', () => {
    it('returns null for unknown senders', () => {
      expect(sessionManager.getSession(999)).toBeNull();
    });

    it('evicts expired sessions', () => {
      sessionManager.createSession({ id: 3 }, { id: 1, username: 'u', roles: [] }, Date.now() - 1);

      expect(sessionManager.getSession(3)).toBeNull();
      expect(sessionManager.hasSession(3)).toBe(false);
    });

    it('keeps sessions that have not expired yet', () => {
      sessionManager.createSession(
        { id: 3 },
        { id: 1, username: 'u', roles: [] },
        Date.now() + 60_000,
      );

      expect(sessionManager.getSession(3)).not.toBeNull();
      expect(sessionManager.hasSession(3)).toBe(true);
    });
  });

  describe('revokeSession / revokeAllSessions', () => {
    it('revokes a single session', () => {
      sessionManager.createSession({ id: 1 }, { id: 1, username: 'a' }, null);
      sessionManager.createSession({ id: 2 }, { id: 2, username: 'b' }, null);

      sessionManager.revokeSession(1);

      expect(sessionManager.getSession(1)).toBeNull();
      expect(sessionManager.getSession(2)).not.toBeNull();
    });

    it('revokes every session', () => {
      sessionManager.createSession({ id: 1 }, { id: 1, username: 'a' }, null);
      sessionManager.createSession({ id: 2 }, { id: 2, username: 'b' }, null);

      sessionManager.revokeAllSessions();

      expect(sessionManager.getSession(1)).toBeNull();
      expect(sessionManager.getSession(2)).toBeNull();
    });
  });
});
