const mockIpcMain = {
  handlers: new Map(),
  on: jest.fn(),
  handle: jest.fn((channel, listener) => {
    mockIpcMain.handlers.set(channel, listener);
  }),
  invoke: jest.fn(async (channel, ...args) => {
    const handler = mockIpcMain.handlers.get(channel);
    if (handler) {
      // Provide a session-backed event so session-based authorization passes
      const sessionManager = require('../../src/main/sessionManager');
      sessionManager.createSession(
        { id: 1 },
        {
          id: 1,
          username: 'mock-user',
          roles: ['Superadmin', 'Administrator', 'FinanceManager', 'SessionSupervisor'],
        },
        null,
      );
      const mockEvent = { sender: { id: 1 } };
      return await handler(mockEvent, ...args);
    }
    throw new Error(`No handler registered for channel '${channel}'`);
  }),
  // Add a method to clear handlers between tests if needed
  clearHandlers: () => {
    mockIpcMain.handlers.clear();
    mockIpcMain.handle.mockClear();
  },
};

const mockApp = {
  getPath: jest.fn().mockReturnValue('/mock/path'),
  relaunch: jest.fn(),
  quit: jest.fn(),
  on: jest.fn(),
  whenReady: jest.fn().mockResolvedValue(),
  isPackaged: true,
};

const mockBrowserWindow = jest.fn(() => ({
  loadFile: jest.fn().mockResolvedValue(),
  webContents: {
    printToPDF: jest.fn().mockResolvedValue(Buffer.from('pdf-data')),
    send: jest.fn(),
    on: jest.fn(),
  },
  close: jest.fn(),
}));

mockBrowserWindow.getAllWindows = jest.fn().mockReturnValue([]);

const mockAutoUpdater = {
  checkForUpdatesAndNotify: jest.fn(),
  on: jest.fn(),
};

const mockMenu = {
  setApplicationMenu: jest.fn(),
};

const mockProtocol = {
  registerFileProtocol: jest.fn(),
};

// Round-trip safeStorage mock (encryptString/decryptString must be reversible)
const mockSafeStorage = {
  isEncryptionAvailable: jest.fn().mockReturnValue(true),
  encryptString: jest.fn((value) => Buffer.from(`enc:${value}`).toString('base64')),
  decryptString: jest.fn((buffer) => Buffer.from(buffer, 'base64').toString('utf8').slice(4)),
};

module.exports = {
  app: mockApp,
  BrowserWindow: mockBrowserWindow,
  ipcMain: mockIpcMain,
  Menu: mockMenu,
  dialog: {
    showSaveDialog: jest.fn().mockResolvedValue({ filePath: '/mock/path/file.pdf' }),
    showOpenDialog: jest.fn().mockResolvedValue({ canceled: false, filePaths: ['/mock/path'] }),
  },
  protocol: mockProtocol,
  autoUpdater: mockAutoUpdater,
  safeStorage: mockSafeStorage,
};
