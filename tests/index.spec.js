// tests/index.spec.js
const path = require('path');

// Mock all dependencies at the top level. Jest hoists these calls,
// ensuring they are applied before any module imports.
jest.mock('../src/main/logger');
jest.mock('electron-updater', () => ({
  autoUpdater: {
    checkForUpdatesAndNotify: jest.fn(),
    on: jest.fn(),
  },
}));
jest.mock('electron-reloader', () => jest.fn());
jest.mock('electron-store', () => jest.fn());
jest.mock('../src/db/db');
jest.mock('fs');
jest.mock('crypto');
jest.mock('../src/main/settingsManager');
jest.mock('../src/main/financialHandlers');
jest.mock('../src/main/handlers/studentHandlers');
jest.mock('../src/main/handlers/teacherHandlers');
jest.mock('../src/main/handlers/classHandlers');
jest.mock('../src/main/handlers/groupHandlers');
jest.mock('../src/main/handlers/userHandlers');
jest.mock('../src/main/handlers/attendanceHandlers');
jest.mock('../src/main/handlers/authHandlers');
jest.mock('../src/main/handlers/settingsHandlers');
jest.mock('../src/main/handlers/dashboardHandlers');
jest.mock('../src/main/handlers/systemHandlers');
jest.mock('../src/main/exportManager');

const mockApp = {
  isPackaged: false,
  getPath: jest.fn((name) => `/mock/path/${name}`),
  getAppPath: jest.fn(() => path.resolve('/mock/app/path')),
  quit: jest.fn(),
  whenReady: jest.fn().mockResolvedValue(),
  on: jest.fn(),
};
const mockBrowserWindowInstance = {
  maximize: jest.fn(),
  show: jest.fn(),
  loadURL: jest.fn(),
  loadFile: jest.fn(),
  once: jest.fn((event, cb) => {
    if (event === 'ready-to-show') cb();
  }),
  webContents: {
    openDevTools: jest.fn(),
    send: jest.fn(),
    on: jest.fn(),
  },
};
const mockBrowserWindow = jest.fn(() => mockBrowserWindowInstance);
mockBrowserWindow.getAllWindows = jest.fn(() => []);

jest.mock('electron', () => ({
  app: mockApp,
  BrowserWindow: mockBrowserWindow,
  ipcMain: { handle: jest.fn(), on: jest.fn() },
  Menu: { setApplicationMenu: jest.fn() },
  protocol: { registerFileProtocol: jest.fn() },
  dialog: {
    showSaveDialog: jest.fn().mockResolvedValue({ filePath: '/mock/template.xlsx' }),
    showMessageBox: jest.fn().mockResolvedValue({ response: 0 }),
  },
}));

describe.skip('Main Process (index.js)', () => {
  let initializeApp;
  let mockLogger, mockDb, mockAutoUpdater;

  beforeEach(() => {
    // Clear mock history before each test, but don't reset modules
    jest.clearAllMocks();

    // Reset any mock state that might be changed in tests
    mockApp.isPackaged = false;

    // Set the JWT secret for all tests
    process.env.JWT_SECRET = 'test-secret';

    // Import the mocks
    mockLogger = require('../src/main/logger');
    mockDb = require('../src/db/db');
    mockAutoUpdater = require('electron-updater').autoUpdater;

    // Now that mocks are in place, require the module under test
    initializeApp = require('../src/main/index').initializeApp;
  });

  it('should initialize the database', async () => {
    await initializeApp();
    expect(mockLogger.log).toHaveBeenCalledWith('App is ready, initializing database...');
    expect(mockDb.initializeDatabase).toHaveBeenCalled();
  });

  it('should create the main window', async () => {
    await initializeApp();
    expect(mockBrowserWindow).toHaveBeenCalled();
  });

  it('should check for updates in packaged mode', async () => {
    mockApp.isPackaged = true;
    await initializeApp();
    expect(mockLogger.log).toHaveBeenCalledWith('Setting up auto-updater...');
    expect(mockAutoUpdater.checkForUpdatesAndNotify).toHaveBeenCalled();
  });

  it('should handle database initialization failure gracefully', async () => {
    const dbError = new Error('DB Init Failed');
    mockDb.initializeDatabase.mockRejectedValue(dbError);

    await initializeApp();

    expect(mockLogger.error).toHaveBeenCalledWith('Fatal error during application startup:', dbError);
    expect(mockApp.quit).toHaveBeenCalled();
  });

  it('should handle JWT secret error gracefully', async () => {
    delete process.env.JWT_SECRET;

    // Re-require the module to re-evaluate the top-level code with the new environment
    initializeApp = require('../src/main/index').initializeApp;

    await initializeApp();

    expect(mockLogger.error).toHaveBeenCalledWith(
        'Fatal error during application startup:',
        expect.any(Error)
    );
    expect(mockApp.quit).toHaveBeenCalled();
  });
});
