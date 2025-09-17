let isPackaged = true; // Default to not logging, i.e., production mode

// Asynchronously get the isPackaged flag from the main process.
window.electronAPI.isPackaged().then((val) => {
  isPackaged = val;
});

/**
 * A logger that only prints to the console in development mode.
 * Behaves like console.log.
 * @param {...any} args
 */
const log = (...args) => {
  if (!isPackaged) {
    console.log(...args);
  }
};

const warn = (...args) => {
  if (!isPackaged) {
    console.warn(...args);
  }
};

const error = (...args) => {
  // We always log errors, even in production, to aid debugging from the console.
  console.error(...args);
};

export { log, warn, error };
