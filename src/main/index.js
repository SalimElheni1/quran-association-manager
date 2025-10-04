/**
 * @fileoverview Main Electron process entry point for Quran Branch Manager.
 * Handles application lifecycle, window management, auto-updates, database initialization,
 * and IPC handler registration.
 * 
 * This file serves as the central coordinator for the desktop application, managing:
 * - Application startup and shutdown
 * - Main window creation and management
 * - Database initialization and encryption
 * - Auto-update functionality
 * - IPC handler registration
 * - Security protocols and crash handling
 * 
 * @author Quran Branch Manager Team
 * @version 1.0.2-beta
 * @requires electron - Desktop application framework
 * @requires electron-updater - Auto-update functionality
 * @requires electron-store - Persistent settings storage
 */

const { app, BrowserWindow, ipcMain, Menu, protocol, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// =================================================================================
// PRODUCTION CRASH LOGGER
// =================================================================================
if (app.isPackaged) {
  process.on('uncaughtException', (error) => {
    const logMessage = `[${new Date().toISOString()}] Uncaught Exception:\n${error.stack || error}\n`;
    // Place the log in the directory next to the executable
    const logPath = path.join(path.dirname(app.getPath('exe')), 'error-log.txt');
    try {
      fs.writeFileSync(logPath, logMessage, { encoding: 'utf-8' });
    } catch (e) {
      console.error('Failed to write crash log:', e);
    }
    // Ensure the app exits
    process.exit(1);
  });
}
// =================================================================================
const Store = require('electron-store');
const { log, error: logError } = require('./logger');
const db = require('../db/db');
const { refreshSettings } = require('./settingsManager');
const { registerFinancialHandlers } = require('./financialHandlers');
const { registerStudentHandlers } = require('./handlers/studentHandlers');
const { registerTeacherHandlers } = require('./handlers/teacherHandlers');
const { registerClassHandlers } = require('./handlers/classHandlers');
const { registerGroupHandlers } = require('./handlers/groupHandlers');
const { registerUserHandlers } = require('./handlers/userHandlers');
const { registerAttendanceHandlers } = require('./handlers/attendanceHandlers');
const { registerAuthHandlers } = require('./handlers/authHandlers');
const { registerSettingsHandlers } = require('./handlers/settingsHandlers');
const { registerDashboardHandlers } = require('./handlers/dashboardHandlers');
const { registerSystemHandlers } = require('./handlers/systemHandlers');
const { registerImportHandlers } = require('./handlers/importHandlers');
const { registerReceiptHandlers } = require('./handlers/receiptHandlers');
const { generateDevExcelTemplate } = require('./exportManager');

const store = new Store();
let initialCredentials = null;

// In development, load environment variables and enable auto-reloading
if (!app.isPackaged) {
  require('dotenv').config();
  require('electron-reloader')(module);
}

// =================================================================================

/**
 * Creates and configures the main application window.
 * Implements security best practices including context isolation and disabled node integration.
 *
 * Security features:
 * - nodeIntegration: false - Prevents renderer from accessing Node.js APIs
 * - contextIsolation: true - Isolates preload scripts from renderer context
 * - Preload script for secure IPC communication
 *
 * @returns {BrowserWindow} The configured main window instance
 */
const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1200, // Default window width
    height: 800, // Default window height
    minWidth: 800, // Minimum usable width
    minHeight: 600, // Minimum usable height
    show: false, // Hide until ready to prevent flash
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), // Secure IPC bridge
      nodeIntegration: false, // CRITICAL: Security - no Node.js in renderer
      contextIsolation: true, // CRITICAL: Security - isolate contexts
    },
    icon: path.join(app.getAppPath(), app.isPackaged ? '../g247.png' : 'public/g247.png'),
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show(); // Show the window after maximizing
  });
  if (!app.isPackaged) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/renderer/index.html'));
  }
  return mainWindow;
};

/**
 * Main application initialization logic.
 * This function is exported for testing purposes.
 */
const initializeApp = async () => {
  try {
    // =================================================================================
    // JWT SECRET MANAGEMENT
    // =================================================================================
    let jwtSecret;
    if (app.isPackaged) {
      jwtSecret = store.get('jwt_secret');
      if (!jwtSecret) {
        log('JWT secret not found in store, generating a new one...');
        jwtSecret = crypto.randomBytes(32).toString('hex');
        store.set('jwt_secret', jwtSecret);
        log('New JWT secret generated and stored.');
      }
    } else {
      jwtSecret = process.env.JWT_SECRET;
    }

    if (!jwtSecret) {
      throw new Error('FATAL ERROR: JWT_SECRET is not defined. The application cannot start securely.');
    }
    process.env.JWT_SECRET = jwtSecret;
    // =================================================================================

    // =============================================================================
    // INITIALIZE DATABASE
    // =============================================================================
    // This is the new standard: initialize the DB as soon as the app is ready.
    // The key is managed internally, so no password is needed here.
    log('App is ready, initializing database...');
    const tempCredentials = await db.initializeDatabase();
    if (tempCredentials) {
      initialCredentials = tempCredentials;
    }
    log('Database initialized successfully.');
    // =============================================================================

    Menu.setApplicationMenu(null);

    // =============================================================================
    // AUTO-UPDATE SETUP
    // =============================================================================
    if (app.isPackaged) {
      log('Setting up auto-updater...');
      autoUpdater.checkForUpdatesAndNotify();

      autoUpdater.on('update-available', () => {
        log('Update available.');
      });

      autoUpdater.on('update-not-available', () => {
        log('Update not available.');
      });

      autoUpdater.on('error', (err) => {
        logError('Error in auto-updater. ' + err);
      });

      autoUpdater.on('download-progress', (progressObj) => {
        let log_message = 'Download speed: ' + progressObj.bytesPerSecond;
        log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
        log_message = log_message + ' (' + progressObj.transferred + '/' + progressObj.total + ')';
        log(log_message);
      });

      autoUpdater.on('update-downloaded', (info) => {
        log('Update downloaded. Prompting user to restart.');
        const dialogOpts = {
          type: 'info',
          buttons: ['Restart', 'Later'],
          title: 'Application Update',
          message: process.platform === 'win32' ? info.releaseName : info.releaseNotes,
          detail:
            'A new version has been downloaded. Restart the application to apply the updates.',
        };

        dialog.showMessageBox(dialogOpts).then((returnValue) => {
          if (returnValue.response === 0) autoUpdater.quitAndInstall();
        });
      });
    }
    // =============================================================================

    const mainWindow = createWindow();

    // Register a custom protocol to safely serve images from the app's data directory.
    // This prevents exposing the entire filesystem to the renderer process.
    protocol.registerFileProtocol('safe-image', (request, callback) => {
      try {
        const url = request.url.replace('safe-image://', '');
        const decodedUrl = decodeURI(url);

        // If it's an absolute path, try it directly
        if (path.isAbsolute(decodedUrl)) {
          if (fs.existsSync(decodedUrl)) return callback({ path: decodedUrl });
          return callback({ error: -6 });
        }

        // First check userData assets folder (where uploaded logos are copied)
        const userDataPath = app.getPath('userData');
        const userAssetPath = path.join(userDataPath, decodedUrl);
        if (fs.existsSync(userAssetPath)) {
          return callback({ path: userAssetPath });
        }

        // Next check the app's public assets. When packaged, resourcesPath points
        // to the folder containing the app.asar; public assets may either be
        // in the unpacked resources or inside app.asar — attempt resourcesPath/public first.
        let publicPath;
        if (app.isPackaged) {
          publicPath = path.join(process.resourcesPath, 'public', decodedUrl);
        } else {
          publicPath = path.join(__dirname, '..', '..', 'public', decodedUrl);
        }
        if (fs.existsSync(publicPath)) {
          return callback({ path: publicPath });
        }

        // As a last resort, check for the resource inside an unpacked assets folder
        const alternative = path.join(process.resourcesPath || app.getAppPath(), decodedUrl);
        if (fs.existsSync(alternative)) {
          return callback({ path: alternative });
        }

        logError(
          `[safe-image] File not found (checked userData, public, resources): ${decodedUrl}`,
        );
        return callback({ error: -6 }); // net::ERR_FILE_NOT_FOUND
      } catch (error) {
        logError('[safe-image] protocol handler error:', error);
        callback({ error: -2 }); // net::FAILED
      }
    });

    // Check if a re-login is required after an import/restore operation
    const forceRelogin = store.get('force-relogin-after-restart');
    if (forceRelogin) {
      log('Force re-login flag is set. Sending force-logout signal to renderer.');
      // Wait for the window to be ready to receive events before sending
      mainWindow.webContents.on('did-finish-load', () => {
        mainWindow.webContents.send('force-logout');
        store.delete('force-relogin-after-restart');
        log('Force re-login flag cleared.');
      });
    }

    // Register all IPC handlers
    ipcMain.handle('get-is-packaged', () => app.isPackaged);
    ipcMain.handle('get-initial-credentials', () => initialCredentials);
    ipcMain.handle('clear-initial-credentials', () => {
      initialCredentials = null;
    });
    ipcMain.handle('export:generate-dev-template', async () => {
      const { filePath } = await dialog.showSaveDialog({
        title: 'Save Dev Excel Template',
        defaultPath: `quran-assoc-dev-template-${Date.now()}.xlsx`,
        filters: [{ name: 'Excel Files', extensions: ['xlsx'] }],
      });

      if (filePath) {
        try {
          await generateDevExcelTemplate(filePath);
          return { success: true, path: filePath };
        } catch (error) {
          logError('Failed to generate dev excel template:', error);
          return { success: false, message: error.message };
        }
      }
      return { success: false, message: 'Save cancelled by user.' };
    });

    ipcMain.handle('dialog:openFile', async (_event, options) => {
      return await dialog.showOpenDialog(options);
    });

    registerFinancialHandlers();
    registerStudentHandlers();
    registerTeacherHandlers();
    registerClassHandlers();
    registerGroupHandlers();
    registerUserHandlers();
    registerAttendanceHandlers();
    registerAuthHandlers();
    registerSettingsHandlers(refreshSettings);
    registerDashboardHandlers();
    registerSystemHandlers();
    registerImportHandlers();
    registerReceiptHandlers();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  } catch (error) {
    logError('Fatal error during application startup:', error);
    app.quit();
  }
};

// This is the main entry point for the application
app.whenReady().then(initializeApp);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle user logout to close the database connection
ipcMain.on('logout', async () => {
  log('User logging out, closing database connection.');
  await db.closeDatabase();
});

// Gracefully close the database when the app is about to quit
app.on('will-quit', async () => {
  log('App is quitting, ensuring database is closed.');
  await db.closeDatabase();
});

// --- Attendance IPC Handlers ---

// --- Backup IPC Handlers ---

module.exports = {
  initializeApp,
  createWindow,
};
