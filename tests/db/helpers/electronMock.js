// tests/db/helpers/electronMock.js
// Stands in for 'electron' in the db-integration project (see jest.config.js).
//
// Under ELECTRON_RUN_AS_NODE, require('electron') does not return the app object, and
// src/db/db.js getDatabasePath() would then fall back to <repo>/.db — the developer's real
// database. This mock gives the app a userData directory that the realDb helper creates under
// os.tmpdir() for each test file. Until the helper sets it, getPath throws, so nothing can
// quietly fall back to another location.

const handlers = new Map();
let userDataDir = null;

function requireUserDataDir() {
  if (!userDataDir) {
    throw new Error(
      'electron mock: userData is not set. Use tests/db/helpers/realDb.js before touching the database.',
    );
  }
  return userDataDir;
}

const app = {
  // Packaged: the logger keeps log()/warn() out of the test output (errors still print).
  isPackaged: true,
  getPath: () => requireUserDataDir(),
  getVersion: () => '0.0.0-test',
  on: () => {},
  whenReady: () => Promise.resolve(),
  relaunch: () => {},
  quit: () => {},
};

// Records handlers so tests can call them the way ipcMain would.
const ipcMain = {
  handle: (channel, listener) => {
    handlers.set(channel, listener);
  },
  removeHandler: (channel) => {
    handlers.delete(channel);
  },
  on: () => {},
};

const dialog = {
  showSaveDialog: async () => ({ canceled: true, filePath: undefined }),
  showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
  showMessageBox: async () => ({ response: 0 }),
  showErrorBox: () => {},
};

const BrowserWindow = function BrowserWindow() {
  throw new Error('electron mock: BrowserWindow cannot be created in db-integration tests.');
};
BrowserWindow.getAllWindows = () => [];

// Reversible, in-memory stand-in for the OS keychain used by src/main/keyManager.js.
const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(`test:${value}`, 'utf8'),
  decryptString: (buffer) => Buffer.from(buffer).toString('utf8').slice('test:'.length),
};

module.exports = {
  app,
  ipcMain,
  dialog,
  BrowserWindow,
  safeStorage,
  shell: { openPath: async () => '' },
  __handlers: handlers,
  __setUserDataDir: (dir) => {
    userDataDir = dir;
  },
  __getUserDataDir: () => userDataDir,
};
