module.exports = {
  app: {
    getPath: jest.fn().mockReturnValue('/mock/path'),
  },
  BrowserWindow: jest.fn(() => ({
    loadFile: jest.fn().mockResolvedValue(),
    webContents: {
      printToPDF: jest.fn().mockResolvedValue(Buffer.from('pdf-data')),
    },
    close: jest.fn(),
  })),
  ipcMain: {
    on: jest.fn(),
    handle: jest.fn(),
  },
  Menu: {
    setApplicationMenu: jest.fn(),
  },
  dialog: {
    showSaveDialog: jest.fn().mockResolvedValue({ filePath: '/mock/path/file.pdf' }),
  },
  protocol: {
    registerFileProtocol: jest.fn(),
  },
};
