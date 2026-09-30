// tests/index.spec.js
const path = require('path');

// The main process wires everything together; its collaborators are replaced so the tests can
// check the startup sequence itself.
jest.mock('../src/main/logger');
jest.mock('electron-reloader', () => jest.fn());
jest.mock('dotenv', () => ({ config: jest.fn() }));
jest.mock('electron-store', () => {
  const store = { get: jest.fn(), set: jest.fn(), delete: jest.fn() };
  const Store = jest.fn(() => store);
  Store.store = store;
  return Store;
});
jest.mock('../src/main/ipcSecurity', () => ({ installIpcGuard: jest.fn() }));
jest.mock('../src/main/authMiddleware', () => ({
  requireRoles: jest.fn(() => (handler) => handler),
}));
jest.mock('../src/main/settingsManager', () => ({ refreshSettings: jest.fn() }));
jest.mock('../src/main/handlers/settingsHandlers', () => ({
  registerSettingsHandlers: jest.fn(),
  internalGetSettingsHandler: jest.fn(),
}));
jest.mock('../src/main/handlers/financialHandlers', () => ({
  registerFinancialHandlers: jest.fn(),
  recomputeAccountBalances: jest.fn(),
}));
jest.mock('../src/main/backupManager', () => ({
  startScheduler: jest.fn(),
  stopScheduler: jest.fn(),
}));
jest.mock('../src/main/feeChargeScheduler', () => ({
  startScheduler: jest.fn(),
  stopScheduler: jest.fn(),
  onAppStartup: jest.fn(),
}));
jest.mock('../src/main/exportManager', () => ({ generateDevExcelTemplate: jest.fn() }));
jest.mock('../src/main/services/financialWordExportService', () => ({
  registerFinancialWordExportHandlers: jest.fn(),
}));
jest.mock('../src/main/services/financialExportService', () => ({
  registerFinancialExportHandlers: jest.fn(),
}));
jest.mock('../src/main/services/cashLedgerExport', () => ({
  generateCashLedgerReport: jest.fn(),
}));
jest.mock('../src/main/services/inventoryLedgerExport', () => ({
  generateInventoryLedger: jest.fn(),
}));
jest.mock('../src/main/handlers/studentFeeHandlers', () => ({
  registerStudentFeeHandlers: jest.fn(),
}));
jest.mock('../src/main/handlers/studentHandlers', () => ({ registerStudentHandlers: jest.fn() }));
jest.mock('../src/main/handlers/teacherHandlers', () => ({ registerTeacherHandlers: jest.fn() }));
jest.mock('../src/main/handlers/classHandlers', () => ({ registerClassHandlers: jest.fn() }));
jest.mock('../src/main/handlers/groupHandlers', () => ({ registerGroupHandlers: jest.fn() }));
jest.mock('../src/main/handlers/userHandlers', () => ({ registerUserHandlers: jest.fn() }));
jest.mock('../src/main/handlers/attendanceHandlers', () => ({
  registerAttendanceHandlers: jest.fn(),
}));
jest.mock('../src/main/handlers/authHandlers', () => ({ registerAuthHandlers: jest.fn() }));
jest.mock('../src/main/handlers/dashboardHandlers', () => ({
  registerDashboardHandlers: jest.fn(),
}));
jest.mock('../src/main/handlers/systemHandlers', () => ({ registerSystemHandlers: jest.fn() }));
jest.mock('../src/main/handlers/importHandlers', () => ({ registerImportHandlers: jest.fn() }));
jest.mock('../src/main/handlers/receiptHandlers', () => ({ registerReceiptHandlers: jest.fn() }));
jest.mock('../src/main/handlers/inventoryHandlers', () => ({
  registerInventoryHandlers: jest.fn(),
}));

const mockApp = {
  isPackaged: false,
  getPath: jest.fn((name) => `/mock/path/${name}`),
  getAppPath: jest.fn(() => path.resolve('/mock/app/path')),
  quit: jest.fn(),
  // Never resolves: the tests call initializeApp themselves.
  whenReady: jest.fn(() => new Promise(() => {})),
  on: jest.fn(),
};
const mockWindow = {
  maximize: jest.fn(),
  show: jest.fn(),
  loadURL: jest.fn(),
  loadFile: jest.fn(),
  on: jest.fn(),
  once: jest.fn(),
  webContents: { id: 11, openDevTools: jest.fn(), send: jest.fn(), on: jest.fn() },
};
const mockBrowserWindow = jest.fn(() => mockWindow);
mockBrowserWindow.getAllWindows = jest.fn(() => []);

jest.mock('electron', () => ({
  app: mockApp,
  BrowserWindow: mockBrowserWindow,
  ipcMain: { handle: jest.fn(), on: jest.fn() },
  Menu: { setApplicationMenu: jest.fn() },
  protocol: { registerFileProtocol: jest.fn() },
  dialog: {
    showSaveDialog: jest.fn(),
    showOpenDialog: jest.fn(),
    showErrorBox: jest.fn(),
  },
}));

const { ipcMain, dialog } = require('electron');
const Store = require('electron-store');
const db = require('../src/db/db');
const logger = require('../src/main/logger');
const { installIpcGuard } = require('../src/main/ipcSecurity');
const { recomputeAccountBalances } = require('../src/main/handlers/financialHandlers');
const { internalGetSettingsHandler } = require('../src/main/handlers/settingsHandlers');
const backupManager = require('../src/main/backupManager');
const feeChargeScheduler = require('../src/main/feeChargeScheduler');
const sessionManager = require('../src/main/sessionManager');

describe('Main Process (index.js)', () => {
  let initializeApp;
  // Registered once, when the module loads.
  let installGuardOrder;
  let installGuardTarget;
  let firstListenerOrder;
  let logoutListener;
  let willQuitListener;

  beforeAll(() => {
    ({ initializeApp } = require('../src/main/index'));
    installGuardOrder = installIpcGuard.mock.invocationCallOrder[0];
    [installGuardTarget] = installIpcGuard.mock.calls[0];
    firstListenerOrder = ipcMain.on.mock.invocationCallOrder[0];
    logoutListener = ipcMain.on.mock.calls.find(([channel]) => channel === 'logout');
    willQuitListener = mockApp.on.mock.calls.find(([event]) => event === 'will-quit')[1];
  });

  const handler = (channel) => ipcMain.handle.mock.calls.find(([name]) => name === channel)?.[1];

  beforeEach(() => {
    jest.clearAllMocks();
    db.resetMocks();
    db.initializeDatabase.mockResolvedValue();
    db.hasSuperadmin.mockResolvedValue(false);
    db.getQuery.mockResolvedValue({ count: 4 }); // age groups already exist
    mockApp.isPackaged = false;
    process.env.JWT_SECRET = 'test-secret';
    Store.store.get.mockReturnValue(undefined);
    recomputeAccountBalances.mockResolvedValue({ accounts: [] });
    internalGetSettingsHandler.mockResolvedValue({ settings: null });
  });

  afterAll(() => {
    delete process.env.JWT_SECRET;
  });

  describe('when the module loads', () => {
    it('installs the IPC guard on ipcMain before registering any listener', () => {
      expect(installGuardTarget).toBe(ipcMain);
      expect(firstListenerOrder).toBeDefined();
      expect(installGuardOrder).toBeLessThan(firstListenerOrder);
    });

    it('revokes the sender session and closes the database on logout', async () => {
      sessionManager.createSession({ id: 5 }, { id: 3, username: 'admin', roles: [] }, null);

      await logoutListener[1]({ sender: { id: 5 } });

      expect(sessionManager.getSession(5)).toBeNull();
      expect(db.closeDatabase).toHaveBeenCalled();
    });

    it('stops the schedulers, revokes every session and closes the database on quit', async () => {
      sessionManager.createSession({ id: 6 }, { id: 3, username: 'admin', roles: [] }, null);

      await willQuitListener();

      expect(backupManager.stopScheduler).toHaveBeenCalled();
      expect(feeChargeScheduler.stopScheduler).toHaveBeenCalled();
      expect(sessionManager.getSession(6)).toBeNull();
      expect(db.closeDatabase).toHaveBeenCalled();
    });
  });

  describe('initializeApp', () => {
    it('opens the database, then a hardened window on the dev server', async () => {
      await initializeApp();

      expect(db.initializeDatabase).toHaveBeenCalledTimes(1);
      expect(recomputeAccountBalances).toHaveBeenCalledTimes(1);
      expect(mockBrowserWindow).toHaveBeenCalledWith(
        expect.objectContaining({
          show: false,
          webPreferences: expect.objectContaining({
            nodeIntegration: false,
            contextIsolation: true,
          }),
        }),
      );
      expect(mockWindow.loadURL).toHaveBeenCalledWith('http://localhost:3000');
      expect(handler('get-is-packaged')).toBeDefined();
      expect(mockApp.quit).not.toHaveBeenCalled();
    });

    it('refuses to start without a JWT secret in development', async () => {
      delete process.env.JWT_SECRET;

      await initializeApp();

      expect(db.initializeDatabase).not.toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith(
        'Fatal error during application startup:',
        expect.objectContaining({ message: expect.stringContaining('JWT_SECRET is not defined') }),
      );
      expect(dialog.showErrorBox).toHaveBeenCalledWith(
        'تعذّر تشغيل التطبيق',
        expect.stringContaining('JWT_SECRET is not defined'),
      );
      expect(mockApp.quit).toHaveBeenCalled();
    });

    it('generates and stores a JWT secret on the first packaged launch', async () => {
      mockApp.isPackaged = true;
      delete process.env.JWT_SECRET;

      await initializeApp();

      const [key, secret] = Store.store.set.mock.calls.find(([k]) => k === 'jwt_secret');
      expect(key).toBe('jwt_secret');
      expect(secret).toMatch(/^[0-9a-f]{64}$/);
      expect(process.env.JWT_SECRET).toBe(secret);
      expect(mockWindow.loadFile).toHaveBeenCalledWith(
        expect.stringContaining(path.join('dist', 'renderer', 'index.html')),
      );
    });

    it('reuses the stored JWT secret on later packaged launches', async () => {
      mockApp.isPackaged = true;
      Store.store.get.mockImplementation((key) =>
        key === 'jwt_secret' ? 'stored-secret' : undefined,
      );

      await initializeApp();

      expect(Store.store.set).not.toHaveBeenCalledWith('jwt_secret', expect.anything());
      expect(process.env.JWT_SECRET).toBe('stored-secret');
    });

    it('shows the error and quits when the database cannot be opened', async () => {
      const dbError = new Error('DB Init Failed');
      db.initializeDatabase.mockRejectedValue(dbError);

      await initializeApp();

      expect(logger.error).toHaveBeenCalledWith('Fatal error during application startup:', dbError);
      expect(dialog.showErrorBox).toHaveBeenCalledWith(
        'تعذّر تشغيل التطبيق',
        expect.stringContaining('DB Init Failed'),
      );
      expect(mockApp.quit).toHaveBeenCalled();
      expect(mockBrowserWindow).not.toHaveBeenCalled();
    });

    it('still starts when the balance reconciliation fails', async () => {
      recomputeAccountBalances.mockRejectedValue(new Error('reconcile failed'));

      await initializeApp();

      expect(mockBrowserWindow).toHaveBeenCalled();
      expect(mockApp.quit).not.toHaveBeenCalled();
    });

    it('starts both schedulers and bills missed charges with the saved settings', async () => {
      const settings = { backup_enabled: true, auto_charge_generation_enabled: true };
      internalGetSettingsHandler.mockResolvedValue({ settings });

      await initializeApp();

      expect(backupManager.startScheduler).toHaveBeenCalledWith(settings);
      expect(feeChargeScheduler.startScheduler).toHaveBeenCalledWith(settings);
      expect(feeChargeScheduler.onAppStartup).toHaveBeenCalledWith(settings);
    });

    it('still opens the window when the schedulers fail to start', async () => {
      internalGetSettingsHandler.mockRejectedValue(new Error('settings unreadable'));

      await initializeApp();

      expect(backupManager.startScheduler).not.toHaveBeenCalled();
      expect(mockBrowserWindow).toHaveBeenCalled();
      expect(mockApp.quit).not.toHaveBeenCalled();
    });

    it('asks the renderer to log out again after a database import', async () => {
      Store.store.get.mockImplementation((key) => key === 'force-relogin-after-restart');

      await initializeApp();

      const [event, onLoad] = mockWindow.webContents.on.mock.calls.find(
        ([name]) => name === 'did-finish-load',
      );
      expect(event).toBe('did-finish-load');
      onLoad();
      expect(mockWindow.webContents.send).toHaveBeenCalledWith('force-logout');
      expect(Store.store.delete).toHaveBeenCalledWith('force-relogin-after-restart');
    });
  });

  describe('get-initial-credentials', () => {
    it('asks for the superadmin setup while no superadmin exists', async () => {
      await initializeApp();
      db.hasSuperadmin.mockResolvedValue(false);

      await expect(handler('get-initial-credentials')()).resolves.toEqual({ needsSetup: true });
    });

    it('returns nothing once a superadmin exists, checked on every call', async () => {
      await initializeApp();
      db.hasSuperadmin.mockResolvedValue(true);

      await expect(handler('get-initial-credentials')()).resolves.toBeNull();
    });

    it('returns nothing when the check fails', async () => {
      await initializeApp();
      db.hasSuperadmin.mockRejectedValue(new Error('db closed'));

      await expect(handler('get-initial-credentials')()).resolves.toBeNull();
    });
  });
});
