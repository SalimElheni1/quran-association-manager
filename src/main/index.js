const { app, BrowserWindow, ipcMain, Menu, protocol, dialog, clipboard } = require('electron');
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
const { generateDevExcelTemplate } = require('./exportManager');

const store = new Store();

// In development, load environment variables and enable auto-reloading
if (!app.isPackaged) {
  require('dotenv').config();
  require('electron-reloader')(module);
}

// =================================================================================
// JWT SECRET MANAGEMENT
// =================================================================================
// In production, we manage the JWT secret using electron-store for persistence.
// In development, we use the .env file.
let jwtSecret;
if (app.isPackaged) {
  // Production: get from store or generate a new one
  jwtSecret = store.get('jwt_secret');
  if (!jwtSecret) {
    log('JWT secret not found in store, generating a new one...');
    jwtSecret = crypto.randomBytes(32).toString('hex');
    store.set('jwt_secret', jwtSecret);
    log('New JWT secret generated and stored.');
  }
} else {
  // Development: get from .env file
  jwtSecret = process.env.JWT_SECRET;
}

if (!jwtSecret) {
  logError('FATAL ERROR: JWT_SECRET is not defined. The application cannot start securely.');
  app.quit();
}
// Make the secret available to the rest of the app via process.env
process.env.JWT_SECRET = jwtSecret;
// =================================================================================

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
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
app.whenReady().then(async () => {
  try {
    // =============================================================================
    // INITIALIZE DATABASE
    // =============================================================================
    // This is the new standard: initialize the DB as soon as the app is ready.
    // The key is managed internally, so no password is needed here.
    log('App is ready, initializing database...');
    const tempCredentials = await db.initializeDatabase();
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

    // If a new superadmin was created, send the credentials to the renderer process
    // to be displayed in a custom modal.
    if (tempCredentials) {
      mainWindow.webContents.on('did-finish-load', () => {
        mainWindow.webContents.send('show-initial-credentials', tempCredentials);
      });
    }

    // Register a custom protocol to safely serve images from the app's data directory.
    // This prevents exposing the entire filesystem to the renderer process.
    protocol.registerFileProtocol('safe-image', (request, callback) => {
      try {
        const url = request.url.replace('safe-image://', '');
        const decodedUrl = decodeURI(url);
        let fullPath;

        // Check for absolute paths first (for user-uploaded content)
        if (path.isAbsolute(decodedUrl) && fs.existsSync(decodedUrl)) {
          fullPath = decodedUrl;
        } else {
          // Otherwise, resolve relative to app assets
          if (app.isPackaged) {
            fullPath = path.join(process.resourcesPath, 'app.asar', 'public', decodedUrl);
          } else {
            fullPath = path.join(__dirname, '..', '..', 'public', decodedUrl);
          }
        }

        if (fs.existsSync(fullPath)) {
          callback({ path: fullPath });
        } else {
          logError(`[safe-image] File not found: ${fullPath}`);
          callback({ error: -6 }); // net::ERR_FILE_NOT_FOUND
        }
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

    const { registerTemplateHandlers } = require('./handlers/templateHandlers');
    registerTemplateHandlers();
    const { registerHistoryHandlers } = require('./handlers/historyHandlers');
    registerHistoryHandlers();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  } catch (error) {
    logError('Fatal error during application startup:', error);
    app.quit();
  }
});

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
