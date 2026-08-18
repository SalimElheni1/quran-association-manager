const {
  ERRORS,
  PUBLIC_CHANNELS,
  CHANNEL_ROLES,
  ROLES,
  installIpcGuard,
  getPolicy,
  isAllowedSender,
} = require('../src/main/ipcSecurity');
const sessionManager = require('../src/main/sessionManager');

jest.mock('../src/main/logger', () => ({
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  initializeLogFile: jest.fn(),
  getLogFilePath: jest.fn(),
  clearLogFile: jest.fn(),
}));

const DEV_URL = 'http://localhost:3000';
const PROD_URL = 'file:///opt/quran-branch/dist/renderer/index.html';
const FOREIGN_URL = 'https://evil.example.com';

function createFakeIpcMain() {
  const handlers = new Map();
  const ons = new Map();
  const fake = {
    handle: (channel, fn) => handlers.set(channel, fn),
    on: (channel, fn) => ons.set(channel, fn),
    handlers,
    ons,
  };
  return fake;
}

function makeEvent(senderId, url = DEV_URL) {
  return { sender: { id: senderId, getURL: () => url } };
}

function makeGuard() {
  const ipcMain = createFakeIpcMain();
  installIpcGuard(ipcMain);
  return ipcMain;
}

describe('ipcSecurity', () => {
  beforeEach(() => {
    sessionManager.revokeAllSessions();
  });

  afterEach(() => {
    sessionManager.revokeAllSessions();
  });

  describe('isAllowedSender', () => {
    it('accepts the dev server URL and the packaged renderer file', () => {
      expect(isAllowedSender({ getURL: () => DEV_URL })).toBe(true);
      expect(isAllowedSender({ getURL: () => PROD_URL })).toBe(true);
    });

    it('rejects foreign URLs, empty URLs, and malformed senders', () => {
      expect(isAllowedSender({ getURL: () => FOREIGN_URL })).toBe(false);
      expect(isAllowedSender({ getURL: () => '' })).toBe(false);
      expect(isAllowedSender({ getURL: () => 'http://localhost:3001' })).toBe(false);
      expect(isAllowedSender({ getURL: () => 'http://localhost:3000.evil.com' })).toBe(false);
      expect(isAllowedSender({})).toBe(false);
      expect(isAllowedSender(null)).toBe(false);
    });
  });

  describe('getPolicy', () => {
    it('marks public channels as public', () => {
      for (const channel of PUBLIC_CHANNELS) {
        expect(getPolicy(channel)).toEqual({ public: true, roles: null, unknown: false });
      }
    });

    it('resolves roles for protected channels', () => {
      expect(getPolicy('students:get').roles).toEqual(ROLES.SESSION);
      expect(getPolicy('users:add').roles).toEqual(ROLES.SUPERADMIN);
      expect(getPolicy('users:get').roles).toEqual(ROLES.FINANCE);
    });

    it('flags unknown channels for warning', () => {
      expect(getPolicy('some:future-channel').unknown).toBe(true);
    });
  });

  describe('matrix sanity', () => {
    it('has no channel in both public and role sets', () => {
      for (const channel of PUBLIC_CHANNELS) {
        expect(CHANNEL_ROLES).not.toHaveProperty(channel);
      }
    });

    it('only references known role names', () => {
      const knownRoles = new Set([
        'Superadmin',
        'Administrator',
        'FinanceManager',
        'SessionSupervisor',
      ]);
      for (const roles of Object.values(CHANNEL_ROLES)) {
        for (const role of roles) {
          expect(knownRoles.has(role)).toBe(true);
        }
      }
    });
  });

  describe('handle guard', () => {
    it('allows public channels without a session', async () => {
      const ipcMain = makeGuard();
      const handler = jest.fn().mockResolvedValue({ ok: true });
      ipcMain.handle('settings:getLogo', handler);

      const result = await ipcMain.handlers.get('settings:getLogo')(makeEvent(1));

      expect(result).toEqual({ ok: true });
      expect(handler).toHaveBeenCalled();
    });

    it('rejects protected channels when there is no session', async () => {
      const ipcMain = makeGuard();
      const handler = jest.fn();
      ipcMain.handle('students:get', handler);

      await expect(ipcMain.handlers.get('students:get')(makeEvent(1))).rejects.toThrow(
        ERRORS.AUTH_REQUIRED,
      );
      expect(handler).not.toHaveBeenCalled();
    });

    it('rejects protected channels from foreign sender URLs', async () => {
      const ipcMain = makeGuard();
      const handler = jest.fn();
      ipcMain.handle('students:get', handler);

      await expect(ipcMain.handlers.get('students:get')(makeEvent(1, FOREIGN_URL))).rejects.toThrow(
        ERRORS.SENDER_REJECTED,
      );
      expect(handler).not.toHaveBeenCalled();
    });

    it('rejects protected channels after the session is revoked (logout)', async () => {
      const ipcMain = makeGuard();
      const handler = jest.fn();
      ipcMain.handle('students:get', handler);

      sessionManager.createSession(
        { id: 1 },
        { id: 10, username: 'admin', roles: ['Superadmin'] },
        null,
      );
      sessionManager.revokeSession(1);

      await expect(ipcMain.handlers.get('students:get')(makeEvent(1))).rejects.toThrow(
        ERRORS.AUTH_REQUIRED,
      );
      expect(handler).not.toHaveBeenCalled();
    });

    it('rejects protected channels when the session is expired', async () => {
      const ipcMain = makeGuard();
      const handler = jest.fn();
      ipcMain.handle('students:get', handler);

      sessionManager.createSession(
        { id: 1 },
        { id: 10, username: 'admin', roles: ['Superadmin'] },
        Date.now() - 1000,
      );

      await expect(ipcMain.handlers.get('students:get')(makeEvent(1))).rejects.toThrow(
        ERRORS.AUTH_REQUIRED,
      );
      expect(handler).not.toHaveBeenCalled();
    });

    it('denies access when the session role is not allowed', async () => {
      const ipcMain = makeGuard();
      const handler = jest.fn();
      ipcMain.handle('users:add', handler);

      sessionManager.createSession(
        { id: 1 },
        { id: 10, username: 'finance', roles: ['FinanceManager'] },
        null,
      );

      await expect(ipcMain.handlers.get('users:add')(makeEvent(1))).rejects.toThrow(
        ERRORS.FORBIDDEN,
      );
      expect(handler).not.toHaveBeenCalled();
    });

    it('allows access when the session role is allowed', async () => {
      const ipcMain = makeGuard();
      const handler = jest.fn().mockResolvedValue([1, 2, 3]);
      ipcMain.handle('students:get', handler);
      const event = makeEvent(1);

      sessionManager.createSession(
        { id: 1 },
        { id: 10, username: 'supervisor', roles: ['SessionSupervisor'] },
        null,
      );

      const result = await ipcMain.handlers.get('students:get')(event, { status: 'active' });

      expect(result).toEqual([1, 2, 3]);
      expect(handler).toHaveBeenCalledWith(event, { status: 'active' });
    });
  });

  describe('matrix enforcement (every classified channel)', () => {
    const allRoles = Object.values(ROLES).flat();
    const uniqueRoles = [...new Set(allRoles)];

    for (const [channel, allowedRoles] of Object.entries(CHANNEL_ROLES)) {
      it(`enforces ${allowedRoles.join('/')} for ${channel}`, async () => {
        const ipcMain = makeGuard();
        const handler = jest.fn().mockResolvedValue('ok');
        ipcMain.handle(channel, handler);
        const wrapped = ipcMain.handlers.get(channel);

        for (const role of allowedRoles) {
          sessionManager.revokeAllSessions();
          sessionManager.createSession({ id: 1 }, { id: 10, username: role, roles: [role] }, null);
          await expect(wrapped(makeEvent(1), 'a')).resolves.toBe('ok');
        }

        handler.mockClear();
        for (const role of uniqueRoles.filter((r) => !allowedRoles.includes(r))) {
          sessionManager.revokeAllSessions();
          sessionManager.createSession({ id: 1 }, { id: 10, username: role, roles: [role] }, null);
          await expect(wrapped(makeEvent(1), 'a')).rejects.toThrow(ERRORS.FORBIDDEN);
          expect(handler).not.toHaveBeenCalled();
          handler.mockClear();
        }

        sessionManager.revokeAllSessions();
        await expect(wrapped(makeEvent(1), 'a')).rejects.toThrow(ERRORS.AUTH_REQUIRED);
      });
    }
  });

  describe('on guard', () => {
    it('allows public event channels without a session', () => {
      const ipcMain = makeGuard();
      const handler = jest.fn();
      ipcMain.on('ui:show-error-toast', handler);
      const event = makeEvent(1);

      ipcMain.ons.get('ui:show-error-toast')(event, 'Hello');

      expect(handler).toHaveBeenCalledWith(event, 'Hello');
    });

    it('drops logout when there is no session', () => {
      const ipcMain = makeGuard();
      const handler = jest.fn();
      ipcMain.on('logout', handler);

      ipcMain.ons.get('logout')(makeEvent(1));

      expect(handler).not.toHaveBeenCalled();
    });

    it('forwards logout when a session exists', () => {
      const ipcMain = makeGuard();
      const handler = jest.fn();
      ipcMain.on('logout', handler);

      sessionManager.createSession(
        { id: 1 },
        { id: 10, username: 'admin', roles: ['Superadmin'] },
        null,
      );

      ipcMain.ons.get('logout')(makeEvent(1));

      expect(handler).toHaveBeenCalled();
    });

    it('drops logout from foreign senders', () => {
      const ipcMain = makeGuard();
      const handler = jest.fn();
      ipcMain.on('logout', handler);

      sessionManager.createSession(
        { id: 1 },
        { id: 10, username: 'admin', roles: ['Superadmin'] },
        null,
      );

      ipcMain.ons.get('logout')(makeEvent(1, FOREIGN_URL));

      expect(handler).not.toHaveBeenCalled();
    });
  });
});
