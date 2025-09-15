const { app } = require('electron');

const log = (...args) => {
  // In a plain Node.js script (like our verification script), `app` will be undefined.
  // In Electron, we check if the app is packaged.
  // This ensures console logs appear during development and in our script, but not in production.
  if (!app || (app && !app.isPackaged)) {
    console.log(...args);
  }
};

const warn = (...args) => {
  if (!app || (app && !app.isPackaged)) {
    console.warn(...args);
  }
};

const error = (...args) => {
  // Errors are important, so we always log them.
  // The production crash logger will handle uncaught exceptions,
  // but this is useful for handled errors.
  console.error(...args);
};

module.exports = {
  log,
  warn,
  error,
};
