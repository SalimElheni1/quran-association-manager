jest.mock('electron', () => ({
  ipcMain: { handle: jest.fn() },
  app: { isPackaged: true, getVersion: jest.fn(() => '1.4.2') },
}));
jest.mock('../src/main/logger', () => ({ log: jest.fn(), error: jest.fn() }));
jest.mock('electron-updater', () => ({
  autoUpdater: {
    on: jest.fn(),
    checkForUpdates: jest.fn(),
    downloadUpdate: jest.fn(),
    quitAndInstall: jest.fn(),
  },
}));

describe('updateHandlers', () => {
  let electron;
  let autoUpdater;
  let handlers;
  const event = { sender: { isDestroyed: () => false, send: jest.fn() } };

  beforeEach(() => {
    jest.resetModules();
    electron = require('electron');
    electron.app.isPackaged = true;
    ({ autoUpdater } = require('electron-updater'));
    jest.clearAllMocks();
    handlers = require('../src/main/handlers/updateHandlers');
  });

  it('registers the three update channels', () => {
    handlers.registerUpdateHandlers();
    const channels = electron.ipcMain.handle.mock.calls.map((c) => c[0]);
    expect(channels).toEqual(['update:check', 'update:download', 'update:install']);
  });

  it('refuses to check outside the installed app', async () => {
    electron.app.isPackaged = false;
    const result = await handlers.handleCheck();
    expect(result.success).toBe(false);
    expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();
  });

  it('reports a newer version and does not download it automatically', async () => {
    autoUpdater.checkForUpdates.mockResolvedValue({
      isUpdateAvailable: true,
      updateInfo: { version: '1.5.0' },
    });
    const result = await handlers.handleCheck();
    expect(result).toMatchObject({ success: true, available: true, version: '1.5.0' });
    expect(autoUpdater.autoDownload).toBe(false);
  });

  it('reports up to date', async () => {
    autoUpdater.checkForUpdates.mockResolvedValue({
      isUpdateAvailable: false,
      updateInfo: { version: '1.4.2' },
    });
    expect(await handlers.handleCheck()).toMatchObject({ success: true, available: false });
  });

  it('returns a message when the check fails', async () => {
    autoUpdater.checkForUpdates.mockRejectedValue(new Error('offline'));
    const result = await handlers.handleCheck();
    expect(result.success).toBe(false);
    expect(result.message).toBeTruthy();
  });

  it('installs only after a download', async () => {
    expect(handlers.handleInstall().success).toBe(false);
    autoUpdater.checkForUpdates.mockResolvedValue({ isUpdateAvailable: true, updateInfo: {} });
    await handlers.handleCheck();
    autoUpdater.downloadUpdate.mockResolvedValue(['file.exe']);
    expect((await handlers.handleDownload(event)).success).toBe(true);
    expect(handlers.handleInstall().success).toBe(true);
    await new Promise((resolve) => setImmediate(resolve));
    expect(autoUpdater.quitAndInstall).toHaveBeenCalledWith(false, true);
  });

  it('returns a message when the download fails', async () => {
    autoUpdater.checkForUpdates.mockResolvedValue({ isUpdateAvailable: true, updateInfo: {} });
    await handlers.handleCheck();
    autoUpdater.downloadUpdate.mockRejectedValue(new Error('offline'));
    const result = await handlers.handleDownload(event);
    expect(result.success).toBe(false);
    expect(handlers.handleInstall().success).toBe(false);
  });
});
