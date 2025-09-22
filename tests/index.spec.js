// tests/index.spec.js

describe('Main Process (index.js)', () => {
  let originalEnv;

  beforeAll(() => {
    originalEnv = { ...process.env };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  const setupMocks = (isPackaged = false) => {
    const mockAutoUpdater = {
      checkForUpdatesAndNotify: jest.fn(),
      on: jest.fn(),
      quitAndInstall: jest.fn(),
    };

    jest.mock('electron-updater', () => ({
      autoUpdater: mockAutoUpdater,
    }));

    jest.mock('electron-reloader', () => jest.fn());

    const mockWindow = {
      maximize: jest.fn(),
      show: jest.fn(),
      loadURL: jest.fn(),
      loadFile: jest.fn(),
      once: jest.fn((event, cb) => {
        if (event === 'ready-to-show') {
          cb();
        }
      }),
      webContents: {
        openDevTools: jest.fn(),
        send: jest.fn(),
        on: jest.fn(),
      },
    };

    const mockBrowserWindow = jest.fn(() => mockWindow);
    mockBrowserWindow.getAllWindows = jest.fn(() => []);

    const mockApp = {
      isPackaged,
      getPath: jest.fn((name) => `/mock/path/${name}`),
      getAppPath: jest.fn().mockReturnValue('/mock/app/path'),
      quit: jest.fn(),
      whenReady: jest.fn(),
      on: jest.fn(),
    };

    const mockIpcMain = {
      handle: jest.fn(),
      on: jest.fn(),
    };

    const mockMenu = {
      setApplicationMenu: jest.fn(),
    };

    const mockProtocol = {
      registerFileProtocol: jest.fn(),
    };

    const mockDialog = {
        showSaveDialog: jest.fn().mockResolvedValue({ filePath: '/mock/template.xlsx' }),
        showMessageBox: jest.fn().mockResolvedValue({ response: 0 }),
    };

    jest.mock('electron', () => ({
      app: mockApp,
      BrowserWindow: mockBrowserWindow,
      ipcMain: mockIpcMain,
      Menu: mockMenu,
      protocol: mockProtocol,
      dialog: mockDialog,
    }));

    const mockDb = {
      initializeDatabase: jest.fn().mockResolvedValue(null),
      closeDatabase: jest.fn().mockResolvedValue(),
    };
    jest.mock('../src/db/db', () => mockDb);

    const mockStoreInstance = {
        get: jest.fn(),
        set: jest.fn(),
        delete: jest.fn(),
    };
    jest.mock('electron-store', () => jest.fn(() => mockStoreInstance));

    jest.mock('../src/main/logger', () => ({
      log: jest.fn(),
      error: jest.fn(),
    }));

    const mockFs = {
        writeFileSync: jest.fn(),
        existsSync: jest.fn().mockReturnValue(true),
    };
    jest.mock('fs', () => mockFs);

    const mockPath = {
        join: (...args) => args.join('/'),
        dirname: (p) => p.substring(0, p.lastIndexOf('/')),
        isAbsolute: (p) => p.startsWith('/'),
        resolve: (...args) => args.join('/'),
    };
    jest.mock('path', () => mockPath);

    jest.mock('crypto', () => ({
        randomBytes: () => ({ toString: () => 'mock-secret' }),
    }));

    // Mock all handler registrations
    jest.mock('../src/main/handlers/authHandlers');
    jest.mock('../src/main/handlers/attendanceHandlers');
    jest.mock('../src/main/handlers/classHandlers');
    jest.mock('../src/main/handlers/dashboardHandlers');
    jest.mock('../src/main/handlers/groupHandlers');
    jest.mock('../src/main/handlers/studentHandlers');
    jest.mock('../src/main/handlers/teacherHandlers');
    jest.mock('../src/main/handlers/userHandlers');
    jest.mock('../src/main/handlers/settingsHandlers');
    jest.mock('../src/main/handlers/systemHandlers');
    jest.mock('../src/main/exportManager');
    jest.mock('../src/main/settingsManager');

    return {
      mockApp,
      mockBrowserWindow,
      mockWindow,
      mockIpcMain,
      mockMenu,
      mockProtocol,
      mockDialog,
      mockAutoUpdater,
      mockDb,
      mockStoreInstance,
      mockLog: require('../src/main/logger').log,
      mockLogError: require('../src/main/logger').error,
      mockFs
    };
  };

  it('should initialize the application when app is ready', async () => {
    const { mockApp, mockDb, mockLog } = setupMocks();

    process.env.JWT_SECRET = 'dev-secret';

    require('../src/main/index');

    const readyCallback = mockApp.whenReady.mock.calls[0][0];
    await readyCallback();

    expect(mockLog).toHaveBeenCalledWith('App is ready, initializing database...');
    expect(mockDb.initializeDatabase).toHaveBeenCalled();
  });

  it('should create a browser window on activation when no windows are open', async () => {
    const { mockApp, mockBrowserWindow } = setupMocks();
    process.env.JWT_SECRET = 'dev-secret';

    require('../src/main/index');

    const activateCallback = mockApp.on.mock.calls.find(call => call[0] === 'activate')[1];

    // Simulate app ready, which creates the first window
    const readyCallback = mockApp.whenReady.mock.calls[0][0];
    await readyCallback();
    expect(mockBrowserWindow).toHaveBeenCalledTimes(1);

    // Simulate activate event
    activateCallback();
    expect(mockBrowserWindow).toHaveBeenCalledTimes(2);
  });

  it('should not create a window on activation if a window is already open', async () => {
    const { mockApp, mockBrowserWindow } = setupMocks();
    mockBrowserWindow.getAllWindows.mockReturnValue([{}]); // A window exists
    process.env.JWT_SECRET = 'dev-secret';

    require('../src/main/index');

    const activateCallback = mockApp.on.mock.calls.find(call => call[0] === 'activate')[1];

    // Simulate app ready
    const readyCallback = mockApp.whenReady.mock.calls[0][0];
    await readyCallback();
    expect(mockBrowserWindow).toHaveBeenCalledTimes(1);

    activateCallback();
    expect(mockBrowserWindow).toHaveBeenCalledTimes(1); // No new window created
  });

  it('should quit the app when all windows are closed (non-macOS)', () => {
    const { mockApp } = setupMocks();
    process.env.JWT_SECRET = 'dev-secret';
    Object.defineProperty(process, 'platform', { value: 'win32' });

    require('../src/main/index');

    const allWindowsClosedCallback = mockApp.on.mock.calls.find(call => call[0] === 'window-all-closed')[1];
    allWindowsClosedCallback();

    expect(mockApp.quit).toHaveBeenCalled();
  });

  it('should not quit the app when all windows are closed (macOS)', () => {
    const { mockApp } = setupMocks();
    process.env.JWT_SECRET = 'dev-secret';
    Object.defineProperty(process, 'platform', { value: 'darwin' });

    require('../src/main/index');

    const allWindowsClosedCallback = mockApp.on.mock.calls.find(call => call[0] === 'window-all-closed')[1];
    allWindowsClosedCallback();

    expect(mockApp.quit).not.toHaveBeenCalled();
  });

  it('should check for updates in packaged mode', async () => {
    const { mockApp, mockAutoUpdater } = setupMocks(true);
    process.env.JWT_SECRET = 'some-secret';

    require('../src/main/index');

    const readyCallback = mockApp.whenReady.mock.calls[0][0];
    await readyCallback();

    expect(mockAutoUpdater.checkForUpdatesAndNotify).toHaveBeenCalled();
  });

  it('should handle database initialization failure gracefully', async () => {
    const { mockApp, mockDb, mockLogError } = setupMocks();
    const dbError = new Error('DB Init Failed');
    mockDb.initializeDatabase.mockRejectedValue(dbError);
    process.env.JWT_SECRET = 'dev-secret';

    require('../src/main/index');

    const readyCallback = mockApp.whenReady.mock.calls[0][0];
    await readyCallback();

    expect(mockLogError).toHaveBeenCalledWith('Fatal error during application startup:', dbError);
    expect(mockApp.quit).toHaveBeenCalled();
  });

  it('should set the application menu to null', async () => {
    const { mockApp, mockMenu } = setupMocks();
    process.env.JWT_SECRET = 'dev-secret';

    require('../src/main/index');

    const readyCallback = mockApp.whenReady.mock.calls[0][0];
    await readyCallback();

    expect(mockMenu.setApplicationMenu).toHaveBeenCalledWith(null);
  });
});
