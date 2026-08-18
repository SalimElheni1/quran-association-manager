// tests/safeImage.spec.js
const path = require('path');

jest.mock('../src/main/logger');
jest.mock('electron-reloader', () => jest.fn());
jest.mock('electron-store', () => jest.fn());
jest.mock('../src/db/db');
jest.mock('fs');
jest.mock('crypto');
jest.mock('../src/main/settingsManager');
jest.mock('../src/main/handlers/financialHandlers');
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
  on: jest.fn(),
  webContents: {
    id: 1,
    openDevTools: jest.fn(),
    send: jest.fn(),
    on: jest.fn(),
  },
};
const mockBrowserWindow = jest.fn(() => mockBrowserWindowInstance);
mockBrowserWindow.getAllWindows = jest.fn(() => []);

let protocolHandler = null;
jest.mock('electron', () => ({
  app: mockApp,
  BrowserWindow: mockBrowserWindow,
  ipcMain: { handle: jest.fn(), on: jest.fn() },
  Menu: { setApplicationMenu: jest.fn() },
  protocol: {
    registerFileProtocol: jest.fn((scheme, handler) => {
      protocolHandler = handler;
    }),
  },
  dialog: { showSaveDialog: jest.fn().mockResolvedValue({ filePath: null }) },
}));

const fs = require('fs');

describe('safe-image protocol (SEC-009 hardening)', () => {
  let initializeApp;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockApp.isPackaged = false;
    process.env.JWT_SECRET = 'test-secret';
    protocolHandler = null;
    fs.existsSync.mockReturnValue(false);
    initializeApp = require('../src/main/index').initializeApp;
    await initializeApp();
    expect(protocolHandler).toBeDefined();
  });

  const invoke = (url) =>
    new Promise((resolve) => {
      protocolHandler({ url }, resolve);
    });

  it('blocks absolute paths (arbitrary file read)', async () => {
    const result = await invoke('safe-image:///etc/passwd.png');
    expect(result).toEqual({ error: -6 });
  });

  it('blocks absolute paths via the public fallback', async () => {
    const result = await invoke('safe-image:///home/user/private/photo.jpg');
    expect(result).toEqual({ error: -6 });
  });

  it('blocks traversal sequences', async () => {
    const result = await invoke('safe-image://..%2F..%2F..%2Fsecret.png');
    expect(result).toEqual({ error: -6 });
  });

  it('blocks null bytes', async () => {
    const result = await invoke('safe-image://file%00.png');
    expect(result).toEqual({ error: -6 });
  });

  it('rejects non-image file types', async () => {
    const result = await invoke('safe-image://assets/logos/logo.txt');
    expect(result).toEqual({ error: -6 });
  });

  it('serves relative files from userData', async () => {
    fs.existsSync.mockImplementation(
      (p) => p === path.resolve('/mock/path/userData', 'assets/logos/icon.png'),
    );
    const result = await invoke('safe-image://assets/logos/icon.png');
    expect(result).toEqual({
      path: path.resolve('/mock/path/userData', 'assets/logos/icon.png'),
    });
  });

  it('falls back to the public assets folder for relative paths', async () => {
    const publicPath = path.resolve(__dirname, '..', 'public', 'g247.png');
    fs.existsSync.mockImplementation((p) => p === publicPath);
    const result = await invoke('safe-image://g247.png');
    expect(result).toEqual({ path: publicPath });
  });

  it('returns file-not-found when nothing matches', async () => {
    const result = await invoke('safe-image://assets/logos/missing.png');
    expect(result).toEqual({ error: -6 });
  });
});
