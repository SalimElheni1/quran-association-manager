const isElectron = () => {
    // Renderer process
    if (typeof window !== 'undefined' && typeof window.process === 'object' && window.process.type === 'renderer') {
        return true;
    }

    // Main process
    if (typeof process !== 'undefined' && typeof process.versions === 'object' && !!process.versions.electron) {
        return true;
    }

    // Detect the user agent when running in a web browser
    if (typeof navigator === 'object' && typeof navigator.userAgent === 'string' && navigator.userAgent.indexOf('Electron') >= 0) {
        return true;
    }

    return false;
};

const isPackaged = () => {
    if (isElectron()) {
        const { app } = require('electron');
        return app.isPackaged;
    }
    // Assume not packaged if not in Electron context
    return false;
}

const log = (...args) => {
  if (!isPackaged()) {
    console.log(...args);
  }
};

const warn = (...args) => {
    if (!isPackaged()) {
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
