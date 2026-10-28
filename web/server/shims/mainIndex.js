// Stands in for src/main/index.js (the Electron entry point), which some handlers require
// lazily to reach the main window. On the web, the "window" is the browser of the current
// request.

const { _fakeWindow } = require('./electron');

module.exports = {
  mainWindow: _fakeWindow,
  initializeApp: async () => {},
  createWindow: () => _fakeWindow,
};
