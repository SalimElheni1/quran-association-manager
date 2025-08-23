const mockIpcMain = {
  handlers: new Map(),
  on: jest.fn(),
  handle: jest.fn((channel, listener) => {
    mockIpcMain.handlers.set(channel, listener);
  }),
  invoke: jest.fn(async (channel, ...args) => {
    const handler = mockIpcMain.handlers.get(channel);
    if (handler) {
      // The first argument to the handler is the event object, which we can mock as an empty object.
      return await handler({}, ...args);
    }
    throw new Error(`No handler registered for channel '${channel}'`);
  }),
  // Add a method to clear handlers between tests if needed
  clearHandlers: () => {
    mockIpcMain.handlers.clear();
    mockIpcMain.handle.mockClear();
  },
};

module.exports = {
  app: {
    getPath: jest.fn().mockReturnValue('/mock/path'),
    relaunch: jest.fn(),
    quit: jest.fn(),
  },
  BrowserWindow: jest.fn(() => ({
    loadFile: jest.fn().mockResolvedValue(),
    webContents: {
      printToPDF: jest.fn().mockResolvedValue(Buffer.from('pdf-data')),
      send: jest.fn(),
      on: jest.fn(),
    },
    close: jest.fn(),
  })),
  ipcMain: mockIpcMain,
  Menu: {
    setApplicationMenu: jest.fn(),
  },
  dialog: {
    showSaveDialog: jest.fn().mockResolvedValue({ filePath: '/mock/path/file.pdf' }),
    showOpenDialog: jest.fn().mockResolvedValue({ canceled: false, filePaths: ['/mock/path'] }),
  },
  protocol: {
    registerFileProtocol: jest.fn(),
  },
};
