// The parts of Electron the shared main-process code uses, for the web server.
// - ipcMain collects the handlers; rpc/registry.js calls them for HTTP requests.
// - dialog.showSaveDialog gives a file in the request's download folder; the browser then
//   downloads it. dialog.showOpenDialog returns the file the browser uploaded with the call.
// - app.getPath('userData') is the current branch's own folder.
// - BrowserWindow.webContents.send queues the event for the browser that made the request.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const context = require('../context');
const { config } = require('../config');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const VERSION = require(path.join(ROOT, 'package.json')).version;

const handlers = new Map();
const listeners = new Map();

const ipcMain = {
  handle(channel, handler) {
    handlers.set(String(channel), handler);
  },
  handleOnce(channel, handler) {
    handlers.set(String(channel), handler);
  },
  removeHandler(channel) {
    handlers.delete(String(channel));
  },
  on(channel, handler) {
    listeners.set(String(channel), handler);
    return ipcMain;
  },
  once(channel, handler) {
    return ipcMain.on(channel, handler);
  },
  removeListener(channel) {
    listeners.delete(String(channel));
    return ipcMain;
  },
  removeAllListeners(channel) {
    if (channel) listeners.delete(String(channel));
    else listeners.clear();
    return ipcMain;
  },
  // Web only.
  _handlers: handlers,
  _listeners: listeners,
};

/** The folder of the branch of the current request (logos, assets), or the system folder. */
function branchDataDir() {
  const ctx = context.current();
  const dir =
    ctx && ctx.branch
      ? path.join(config.dataDir, 'branches', String(ctx.branch.id))
      : path.join(config.dataDir, 'system');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const app = {
  isPackaged: false, // images bundled with the app are read from public/, see imagePaths.js
  getVersion: () => VERSION,
  getName: () => 'Quran Association Manager',
  getAppPath: () => ROOT,
  getPath(name) {
    if (name === 'temp') return os.tmpdir();
    return branchDataDir();
  },
  getLocale: () => 'ar',
  whenReady: () => new Promise(() => {}),
  on: () => app,
  once: () => app,
  quit: () => {},
  exit: () => {},
  relaunch: () => {},
  setAppUserModelId: () => {},
};

/** A safe file name (no folders, no control characters). */
function safeFileName(name, fallback = 'file') {
  const base = path.basename(String(name || '')).replace(/[\u0000-\u001f<>:"/\\|?*]+/g, '_');
  return base && base !== '.' && base !== '..' ? base.slice(0, 180) : fallback;
}

const dialog = {
  async showSaveDialog(...args) {
    const options = (typeof args[0] === 'object' && !args[0]?.webContents ? args[0] : args[1]) || {};
    const ctx = context.current();
    if (!ctx) return { canceled: true, filePath: undefined };
    const id = crypto.randomUUID();
    const dir = path.join(config.dataDir, 'downloads', id);
    fs.mkdirSync(dir, { recursive: true });
    const name = safeFileName(options.defaultPath, 'export');
    const filePath = path.join(dir, name);
    ctx.downloads.push({ id, path: filePath, name });
    return { canceled: false, filePath };
  },
  async showOpenDialog(...args) {
    const options = (typeof args[0] === 'object' && !args[0]?.webContents ? args[0] : args[1]) || {};
    const ctx = context.current();
    if (!ctx || ctx.pendingUploads.length === 0) return { canceled: true, filePaths: [] };
    const multiple = Array.isArray(options.properties) && options.properties.includes('multiSelections');
    const filePaths = multiple ? ctx.pendingUploads.splice(0) : ctx.pendingUploads.splice(0, 1);
    return { canceled: false, filePaths };
  },
  async showMessageBox() {
    return { response: 0, checkboxChecked: false };
  },
  showMessageBoxSync: () => 0,
  showErrorBox: () => {},
};

/** The renderer events of the current request (replayed in the browser after the call). */
const webContents = {
  id: -1,
  send(channel, ...args) {
    const ctx = context.current();
    if (ctx) ctx.events.push({ channel: String(channel), args });
  },
  getURL: () => '',
  isDestroyed: () => false,
  on: () => {},
  once: () => {},
};

const fakeWindow = {
  webContents,
  isDestroyed: () => false,
  show: () => {},
  focus: () => {},
};

const BrowserWindow = {
  getAllWindows: () => [fakeWindow],
  getFocusedWindow: () => fakeWindow,
  fromWebContents: () => fakeWindow,
};

const noop = () => {};

module.exports = {
  app,
  ipcMain,
  dialog,
  BrowserWindow,
  webContents: { getAllWebContents: () => [webContents] },
  shell: { openExternal: async () => {}, openPath: async () => '', showItemInFolder: noop },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: () => {
      throw new Error('safeStorage is not available on the web server.');
    },
    decryptString: () => {
      throw new Error('safeStorage is not available on the web server.');
    },
  },
  protocol: { registerFileProtocol: noop, registerSchemesAsPrivileged: noop, handle: noop },
  Menu: { setApplicationMenu: noop, buildFromTemplate: () => ({}) },
  nativeImage: { createFromPath: () => ({}) },
  contextBridge: { exposeInMainWorld: noop },
  ipcRenderer: { invoke: async () => undefined, send: noop, on: noop, removeListener: noop },
  // Web only.
  _fakeWindow: fakeWindow,
  _safeFileName: safeFileName,
};
