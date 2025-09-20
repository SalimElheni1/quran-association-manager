// Mock all dependencies before requiring the main module
jest.mock('electron', () => ({}));
jest.mock('electron-updater', () => ({
  autoUpdater: {
    checkForUpdatesAndNotify: jest.fn(),
    on: jest.fn(),
    quitAndInstall: jest.fn()
  }
}));
jest.mock('fs');
jest.mock('path');
jest.mock('crypto');
jest.mock('electron-store');
jest.mock('../src/main/logger');
jest.mock('../src/db/db');
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
jest.mock('dotenv', () => ({ config: jest.fn() }));
jest.mock('electron-reloader', () => jest.fn());

describe('Main Process (index.js)', () => {
  let mockApp, mockBrowserWindow, mockIpcMain, mockMenu, mockProtocol, mockDialog;
  let mockAutoUpdater, mockFs, mockPath, mockCrypto, mockStore;
  let mockLog, mockLogError, mockDb;
  let originalProcessEnv, originalProcessExit, originalProcessOn;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock process methods
    originalProcessEnv = process.env;
    originalProcessExit = process.exit;
    originalProcessOn = process.on;
    
    process.env = { ...originalProcessEnv };
    process.exit = jest.fn();
    process.on = jest.fn();
    
    // Setup all mocks
    mockApp = {
      isPackaged: false,
      getPath: jest.fn().mockReturnValue('/mock/path'),
      getAppPath: jest.fn().mockReturnValue('/mock/app/path'),
      quit: jest.fn(),
      whenReady: jest.fn().mockResolvedValue(),
      on: jest.fn()
    };
    
    const mockWindow = {
      maximize: jest.fn(),
      show: jest.fn(),
      loadURL: jest.fn(),
      loadFile: jest.fn(),
      once: jest.fn(),
      webContents: {
        openDevTools: jest.fn(),
        send: jest.fn(),
        on: jest.fn()
      }
    };
    
    mockBrowserWindow = jest.fn(() => mockWindow);
    mockBrowserWindow.getAllWindows = jest.fn();
    
    mockIpcMain = {
      handle: jest.fn(),
      on: jest.fn()
    };
    
    mockMenu = {
      setApplicationMenu: jest.fn()
    };
    
    mockProtocol = {
      registerFileProtocol: jest.fn()
    };
    
    mockDialog = {
      showSaveDialog: jest.fn().mockResolvedValue({ filePath: '/mock/template.xlsx' }),
      showMessageBox: jest.fn().mockResolvedValue({ response: 0 })
    };
    
    mockAutoUpdater = require('electron-updater').autoUpdater;
    mockFs = require('fs');
    mockPath = require('path');
    mockCrypto = require('crypto');
    mockStore = jest.fn(() => ({
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn()
    }));
    
    mockLog = require('../src/main/logger').log;
    mockLogError = require('../src/main/logger').error;
    mockDb = require('../src/db/db');
    
    // Setup default mock implementations
    mockCrypto.randomBytes = jest.fn().mockReturnValue({ toString: () => 'mock-jwt-secret' });
    mockPath.join = jest.fn().mockImplementation((...args) => args.join('/'));
    mockPath.dirname = jest.fn().mockReturnValue('/mock/dir');
    mockPath.isAbsolute = jest.fn().mockReturnValue(false);
    mockFs.existsSync = jest.fn().mockReturnValue(true);
    mockFs.writeFileSync = jest.fn();
    mockDb.initializeDatabase = jest.fn().mockResolvedValue(null);
    mockDb.closeDatabase = jest.fn().mockResolvedValue();
    
    // Mock electron module
    require('electron').app = mockApp;
    require('electron').BrowserWindow = mockBrowserWindow;
    require('electron').ipcMain = mockIpcMain;
    require('electron').Menu = mockMenu;
    require('electron').protocol = mockProtocol;
    require('electron').dialog = mockDialog;
    
    // Mock electron-store
    require('electron-store').mockImplementation(() => mockStore());
  });

  afterEach(() => {
    process.env = originalProcessEnv;
    process.exit = originalProcessExit;
    process.on = originalProcessOn;
    jest.resetModules();
  });

  describe('Production Crash Logger', () => {
    it('should set up crash logger in packaged mode', () => {
      mockApp.isPackaged = true;
      
      require('../src/main/index');
      
      expect(process.on).toHaveBeenCalledWith('uncaughtException', expect.any(Function));
    });

    it('should handle uncaught exceptions in packaged mode', () => {
      mockApp.isPackaged = true;
      const mockError = new Error('Test error');
      mockError.stack = 'Error stack trace';
      
      require('../src/main/index');
      
      const crashHandler = process.on.mock.calls.find(call => call[0] === 'uncaughtException')[1];
      crashHandler(mockError);
      
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        '/mock/dir/error-log.txt',
        expect.stringContaining('Uncaught Exception'),
        { encoding: 'utf-8' }
      );
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should handle crash log write failure', () => {
      mockApp.isPackaged = true;
      const mockError = new Error('Test error');
      mockFs.writeFileSync.mockImplementation(() => {
        throw new Error('Write failed');
      });
      
      require('../src/main/index');
      
      const crashHandler = process.on.mock.calls.find(call => call[0] === 'uncaughtException')[1];
      crashHandler(mockError);
      
      expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('should not set up crash logger in development mode', () => {
      mockApp.isPackaged = false;
      
      require('../src/main/index');
      
      expect(process.on).not.toHaveBeenCalledWith('uncaughtException', expect.any(Function));
    });
  });

  describe('JWT Secret Management', () => {
    it('should generate new JWT secret in packaged mode when not exists', () => {
      mockApp.isPackaged = true;
      const mockStoreInstance = { get: jest.fn().mockReturnValue(null), set: jest.fn() };
      mockStore.mockReturnValue(mockStoreInstance);
      
      require('../src/main/index');
      
      expect(mockStoreInstance.get).toHaveBeenCalledWith('jwt_secret');
      expect(mockCrypto.randomBytes).toHaveBeenCalledWith(32);
      expect(mockStoreInstance.set).toHaveBeenCalledWith('jwt_secret', 'mock-jwt-secret');
      expect(process.env.JWT_SECRET).toBe('mock-jwt-secret');
    });

    it('should use existing JWT secret in packaged mode', () => {
      mockApp.isPackaged = true;
      const mockStoreInstance = { get: jest.fn().mockReturnValue('existing-secret'), set: jest.fn() };
      mockStore.mockReturnValue(mockStoreInstance);
      
      require('../src/main/index');
      
      expect(mockStoreInstance.get).toHaveBeenCalledWith('jwt_secret');
      expect(mockCrypto.randomBytes).not.toHaveBeenCalled();
      expect(mockStoreInstance.set).not.toHaveBeenCalled();
      expect(process.env.JWT_SECRET).toBe('existing-secret');
    });

    it('should use environment JWT secret in development mode', () => {
      mockApp.isPackaged = false;
      process.env.JWT_SECRET = 'dev-secret';
      
      require('../src/main/index');
      
      expect(process.env.JWT_SECRET).toBe('dev-secret');
    });

    it('should quit app when JWT secret is missing', () => {
      mockApp.isPackaged = false;
      delete process.env.JWT_SECRET;
      
      require('../src/main/index');
      
      expect(mockLogError).toHaveBeenCalledWith('FATAL ERROR: JWT_SECRET is not defined. The application cannot start securely.');
      expect(mockApp.quit).toHaveBeenCalled();
    });
  });

  describe('Window Creation', () => {
    it('should create window with correct configuration', async () => {
      require('../src/main/index');
      
      const readyHandler = mockApp.whenReady.mock.results[0].value;
      await readyHandler;
      
      expect(mockBrowserWindow).toHaveBeenCalledWith({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        show: false,
        webPreferences: {
          preload: expect.stringContaining('preload.js'),
          nodeIntegration: false,
          contextIsolation: true,
        },
        icon: expect.any(String),
      });
    });

    it('should load development URL in development mode', async () => {
      mockApp.isPackaged = false;
      const mockWindow = mockBrowserWindow();
      
      require('../src/main/index');
      
      const readyHandler = mockApp.whenReady.mock.results[0].value;
      await readyHandler;
      
      expect(mockWindow.loadURL).toHaveBeenCalledWith('http://localhost:3000');
      expect(mockWindow.webContents.openDevTools).toHaveBeenCalled();
    });

    it('should load production file in packaged mode', async () => {
      mockApp.isPackaged = true;
      const mockStoreInstance = { get: jest.fn().mockReturnValue('existing-secret') };
      mockStore.mockReturnValue(mockStoreInstance);
      const mockWindow = mockBrowserWindow();
      
      require('../src/main/index');
      
      const readyHandler = mockApp.whenReady.mock.results[0].value;
      await readyHandler;
      
      expect(mockWindow.loadFile).toHaveBeenCalledWith(expect.stringContaining('index.html'));
      expect(mockWindow.webContents.openDevTools).not.toHaveBeenCalled();
    });

    it('should maximize and show window when ready', async () => {
      const mockWindow = mockBrowserWindow();
      
      require('../src/main/index');
      
      const readyHandler = mockApp.whenReady.mock.results[0].value;
      await readyHandler;
      
      const readyToShowHandler = mockWindow.once.mock.calls.find(call => call[0] === 'ready-to-show')[1];
      readyToShowHandler();
      
      expect(mockWindow.maximize).toHaveBeenCalled();
      expect(mockWindow.show).toHaveBeenCalled();
    });
  });

  describe('Database Initialization', () => {
    it('should initialize database on app ready', async () => {
      require('../src/main/index');
      
      const readyHandler = mockApp.whenReady.mock.results[0].value;
      await readyHandler;
      
      expect(mockDb.initializeDatabase).toHaveBeenCalled();
      expect(mockLog).toHaveBeenCalledWith('App is ready, initializing database...');
      expect(mockLog).toHaveBeenCalledWith('Database initialized successfully.');
    });

    it('should handle database initialization with temp credentials', async () => {
      const tempCredentials = { username: 'admin', password: 'temp123' };
      mockDb.initializeDatabase.mockResolvedValue(tempCredentials);
      const mockWindow = mockBrowserWindow();
      
      require('../src/main/index');
      
      const readyHandler = mockApp.whenReady.mock.results[0].value;
      await readyHandler;
      
      const finishLoadHandler = mockWindow.webContents.on.mock.calls.find(call => call[0] === 'did-finish-load')[1];
      finishLoadHandler();
      
      expect(mockWindow.webContents.send).toHaveBeenCalledWith('show-initial-credentials', tempCredentials);
    });

    it('should handle database initialization failure', async () => {
      const dbError = new Error('Database failed');
      mockDb.initializeDatabase.mockRejectedValue(dbError);
      
      require('../src/main/index');
      
      const readyHandler = mockApp.whenReady.mock.results[0].value;
      await expect(readyHandler).rejects.toThrow();
      
      expect(mockLogError).toHaveBeenCalledWith('Fatal error during application startup:', dbError);
      expect(mockApp.quit).toHaveBeenCalled();
    });
  });

  describe('Auto-Updater', () => {
    it('should setup auto-updater in packaged mode', async () => {
      mockApp.isPackaged = true;
      const mockStoreInstance = { get: jest.fn().mockReturnValue('existing-secret') };
      mockStore.mockReturnValue(mockStoreInstance);
      
      require('../src/main/index');
      
      const readyHandler = mockApp.whenReady.mock.results[0].value;
      await readyHandler;
      
      expect(mockAutoUpdater.checkForUpdatesAndNotify).toHaveBeenCalled();
      expect(mockLog).toHaveBeenCalledWith('Setting up auto-updater...');
    });

    it('should handle update events', async () => {
      mockApp.isPackaged = true;
      const mockStoreInstance = { get: jest.fn().mockReturnValue('existing-secret') };
      mockStore.mockReturnValue(mockStoreInstance);
      
      require('../src/main/index');
      
      const readyHandler = mockApp.whenReady.mock.results[0].value;
      await readyHandler;
      
      // Test update-available
      const updateAvailableHandler = mockAutoUpdater.on.mock.calls.find(call => call[0] === 'update-available')[1];
      updateAvailableHandler();
      expect(mockLog).toHaveBeenCalledWith('Update available.');
      
      // Test update-not-available
      const updateNotAvailableHandler = mockAutoUpdater.on.mock.calls.find(call => call[0] === 'update-not-available')[1];
      updateNotAvailableHandler();
      expect(mockLog).toHaveBeenCalledWith('Update not available.');
      
      // Test error
      const errorHandler = mockAutoUpdater.on.mock.calls.find(call => call[0] === 'error')[1];
      const updateError = new Error('Update failed');
      errorHandler(updateError);
      expect(mockLogError).toHaveBeenCalledWith('Error in auto-updater. ' + updateError);
      
      // Test download-progress
      const progressHandler = mockAutoUpdater.on.mock.calls.find(call => call[0] === 'download-progress')[1];
      const progressObj = { bytesPerSecond: 1000, percent: 50, transferred: 500, total: 1000 };
      progressHandler(progressObj);
      expect(mockLog).toHaveBeenCalledWith(expect.stringContaining('Download speed: 1000'));
    });

    it('should handle update-downloaded with restart', async () => {
      mockApp.isPackaged = true;
      const mockStoreInstance = { get: jest.fn().mockReturnValue('existing-secret') };
      mockStore.mockReturnValue(mockStoreInstance);
      mockDialog.showMessageBox.mockResolvedValue({ response: 0 });
      
      require('../src/main/index');
      
      const readyHandler = mockApp.whenReady.mock.results[0].value;
      await readyHandler;
      
      const downloadedHandler = mockAutoUpdater.on.mock.calls.find(call => call[0] === 'update-downloaded')[1];
      const info = { releaseName: 'v1.0.0', releaseNotes: 'Bug fixes' };
      await downloadedHandler(info);
      
      expect(mockDialog.showMessageBox).toHaveBeenCalledWith(expect.objectContaining({
        type: 'info',
        buttons: ['Restart', 'Later'],
        title: 'Application Update'
      }));
      expect(mockAutoUpdater.quitAndInstall).toHaveBeenCalled();
    });

    it('should not setup auto-updater in development mode', async () => {
      mockApp.isPackaged = false;
      
      require('../src/main/index');
      
      const readyHandler = mockApp.whenReady.mock.results[0].value;
      await readyHandler;
      
      expect(mockAutoUpdater.checkForUpdatesAndNotify).not.toHaveBeenCalled();
    });
  });

  describe('Protocol Registration', () => {
    it('should register safe-image protocol', async () => {
      require('../src/main/index');
      
      const readyHandler = mockApp.whenReady.mock.results[0].value;
      await readyHandler;
      
      expect(mockProtocol.registerFileProtocol).toHaveBeenCalledWith('safe-image', expect.any(Function));
    });

    it('should handle safe-image protocol paths', async () => {
      require('../src/main/index');
      
      const readyHandler = mockApp.whenReady.mock.results[0].value;
      await readyHandler;
      
      const protocolHandler = mockProtocol.registerFileProtocol.mock.calls[0][1];
      const mockCallback = jest.fn();
      
      // Test absolute path
      mockPath.isAbsolute.mockReturnValue(true);
      mockFs.existsSync.mockReturnValue(true);
      const request1 = { url: 'safe-image:///absolute/path/image.png' };
      protocolHandler(request1, mockCallback);
      expect(mockCallback).toHaveBeenCalledWith({ path: '/absolute/path/image.png' });
      
      // Test userData path
      mockPath.isAbsolute.mockReturnValue(false);
      mockFs.existsSync.mockImplementation(path => path.includes('userData'));
      const request2 = { url: 'safe-image://relative/path/image.png' };
      protocolHandler(request2, mockCallback);
      expect(mockCallback).toHaveBeenCalledWith({ path: expect.stringContaining('userData') });
      
      // Test file not found
      mockFs.existsSync.mockReturnValue(false);
      const request3 = { url: 'safe-image://nonexistent.png' };
      protocolHandler(request3, mockCallback);
      expect(mockLogError).toHaveBeenCalledWith(expect.stringContaining('File not found'));
      expect(mockCallback).toHaveBeenCalledWith({ error: -6 });
    });

    it('should handle safe-image protocol errors', async () => {
      require('../src/main/index');
      
      const readyHandler = mockApp.whenReady.mock.results[0].value;
      await readyHandler;
      
      const protocolHandler = mockProtocol.registerFileProtocol.mock.calls[0][1];
      const mockCallback = jest.fn();
      const request = { url: 'safe-image://invalid%url' };
      
      const originalDecodeURI = global.decodeURI;
      global.decodeURI = jest.fn(() => { throw new Error('Invalid URL'); });
      
      protocolHandler(request, mockCallback);
      
      expect(mockLogError).toHaveBeenCalledWith('[safe-image] protocol handler error:', expect.any(Error));
      expect(mockCallback).toHaveBeenCalledWith({ error: -2 });
      
      global.decodeURI = originalDecodeURI;
    });
  });

  describe('Force Relogin Handling', () => {
    it('should handle force relogin flag', async () => {
      const mockStoreInstance = { get: jest.fn().mockReturnValue(true), delete: jest.fn() };
      mockStore.mockReturnValue(mockStoreInstance);
      const mockWindow = mockBrowserWindow();
      
      require('../src/main/index');
      
      const readyHandler = mockApp.whenReady.mock.results[0].value;
      await readyHandler;
      
      const finishLoadHandler = mockWindow.webContents.on.mock.calls.find(call => call[0] === 'did-finish-load')[1];
      finishLoadHandler();
      
      expect(mockWindow.webContents.send).toHaveBeenCalledWith('force-logout');
      expect(mockStoreInstance.delete).toHaveBeenCalledWith('force-relogin-after-restart');
      expect(mockLog).toHaveBeenCalledWith('Force re-login flag cleared.');
    });
  });

  describe('IPC Handlers Registration', () => {
    it('should register get-is-packaged handler', async () => {
      mockApp.isPackaged = true;
      
      require('../src/main/index');
      
      const readyHandler = mockApp.whenReady.mock.results[0].value;
      await readyHandler;
      
      expect(mockIpcMain.handle).toHaveBeenCalledWith('get-is-packaged', expect.any(Function));
      
      const handler = mockIpcMain.handle.mock.calls.find(call => call[0] === 'get-is-packaged')[1];
      expect(handler()).toBe(true);
    });

    it('should register export:generate-dev-template handler', async () => {
      const { generateDevExcelTemplate } = require('../src/main/exportManager');
      generateDevExcelTemplate.mockResolvedValue();
      
      require('../src/main/index');
      
      const readyHandler = mockApp.whenReady.mock.results[0].value;
      await readyHandler;
      
      expect(mockIpcMain.handle).toHaveBeenCalledWith('export:generate-dev-template', expect.any(Function));
      
      const handler = mockIpcMain.handle.mock.calls.find(call => call[0] === 'export:generate-dev-template')[1];
      const result = await handler();
      
      expect(generateDevExcelTemplate).toHaveBeenCalledWith('/mock/template.xlsx');
      expect(result).toEqual({ success: true, path: '/mock/template.xlsx' });
    });

    it('should handle export template error', async () => {
      const { generateDevExcelTemplate } = require('../src/main/exportManager');
      generateDevExcelTemplate.mockRejectedValue(new Error('Export failed'));
      
      require('../src/main/index');
      
      const readyHandler = mockApp.whenReady.mock.results[0].value;
      await readyHandler;
      
      const handler = mockIpcMain.handle.mock.calls.find(call => call[0] === 'export:generate-dev-template')[1];
      const result = await handler();
      
      expect(mockLogError).toHaveBeenCalledWith('Failed to generate dev excel template:', expect.any(Error));
      expect(result).toEqual({ success: false, message: 'Export failed' });
    });

    it('should register all handler modules', async () => {
      const { registerFinancialHandlers } = require('../src/main/financialHandlers');
      const { registerStudentHandlers } = require('../src/main/handlers/studentHandlers');
      const { registerSettingsHandlers } = require('../src/main/handlers/settingsHandlers');
      const { refreshSettings } = require('../src/main/settingsManager');
      
      require('../src/main/index');
      
      const readyHandler = mockApp.whenReady.mock.results[0].value;
      await readyHandler;
      
      expect(registerFinancialHandlers).toHaveBeenCalled();
      expect(registerStudentHandlers).toHaveBeenCalled();
      expect(registerSettingsHandlers).toHaveBeenCalledWith(refreshSettings);
    });
  });

  describe('App Event Handlers', () => {
    it('should handle activate event', async () => {
      mockBrowserWindow.getAllWindows.mockReturnValue([]);
      
      require('../src/main/index');
      
      const readyHandler = mockApp.whenReady.mock.results[0].value;
      await readyHandler;
      
      const activateHandler = mockApp.on.mock.calls.find(call => call[0] === 'activate')[1];
      activateHandler();
      
      expect(mockBrowserWindow.getAllWindows).toHaveBeenCalled();
      expect(mockBrowserWindow).toHaveBeenCalledTimes(2);
    });

    it('should handle window-all-closed event', async () => {
      const originalPlatform = process.platform;
      Object.defineProperty(process, 'platform', { value: 'win32' });
      
      require('../src/main/index');
      
      const windowsClosedHandler = mockApp.on.mock.calls.find(call => call[0] === 'window-all-closed')[1];
      windowsClosedHandler();
      
      expect(mockApp.quit).toHaveBeenCalled();
      
      Object.defineProperty(process, 'platform', { value: originalPlatform });
    });

    it('should handle logout and will-quit events', async () => {
      require('../src/main/index');
      
      // Test logout
      const logoutHandler = mockIpcMain.on.mock.calls.find(call => call[0] === 'logout')[1];
      await logoutHandler();
      
      expect(mockLog).toHaveBeenCalledWith('User logging out, closing database connection.');
      expect(mockDb.closeDatabase).toHaveBeenCalled();
      
      // Test will-quit
      const willQuitHandler = mockApp.on.mock.calls.find(call => call[0] === 'will-quit')[1];
      await willQuitHandler();
      
      expect(mockLog).toHaveBeenCalledWith('App is quitting, ensuring database is closed.');
      expect(mockDb.closeDatabase).toHaveBeenCalled();
    });
  });

  describe('Menu and Application Setup', () => {
    it('should set application menu to null', async () => {
      require('../src/main/index');
      
      const readyHandler = mockApp.whenReady.mock.results[0].value;
      await readyHandler;
      
      expect(mockMenu.setApplicationMenu).toHaveBeenCalledWith(null);
    });
  });

  describe('Development Environment Setup', () => {
    it('should load dotenv and electron-reloader in development', () => {
      mockApp.isPackaged = false;
      const dotenv = require('dotenv');
      const electronReloader = require('electron-reloader');
      
      require('../src/main/index');
      
      expect(dotenv.config).toHaveBeenCalled();
      expect(electronReloader).toHaveBeenCalledWith(expect.any(Object));
    });

    it('should not load development dependencies in production', () => {
      mockApp.isPackaged = true;
      const dotenv = require('dotenv');
      const electronReloader = require('electron-reloader');
      
      require('../src/main/index');
      
      expect(dotenv.config).not.toHaveBeenCalled();
      expect(electronReloader).not.toHaveBeenCalled();
    });
  });
});