const { app } = require('electron');
const path = require('path');

/**
 * Gets the application's root path. This is different in development
 * (project root) versus a packaged application (inside the ASAR archive).
 * @returns {string} The absolute path to the application root.
 */
function getAppRoot() {
  if (app.isPackaged) {
    // In a packaged app, `__dirname` points inside the ASAR archive.
    // We need to get to the root of the app directory within `resources`.
    // `app.getAppPath()` correctly points to `.../resources/app.asar`
    return app.getAppPath();
  } else {
    // In development, we can use the project root.
    // `__dirname` is `.../project/src/main`, so we go up two levels.
    return path.join(__dirname, '..', '..');
  }
}

module.exports = { getAppRoot };
