const { app } = require('electron');

const log = (...args) => {
  if (!app.isPackaged) {
    console.log(...args);
  }
};

const warn = (...args) => {
  if (!app.isPackaged) {
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
