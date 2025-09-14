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
    const logPath = path.join(path.dirname(app.getPath('exe')), 'error-log.txt');
    try {
      fs.writeFileSync(logPath, logMessage, { encoding: 'utf-8' });
    } catch (e) {
      console.error('Failed to write crash log:', e);
    }
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
const { registerTemplateHandlers } = require('./handlers/templateHandlers');
const { registerHistoryHandlers } = require('./handlers/historyHandlers');
const { generateDevExcelTemplate } = require('./exportManager');

const store = new Store();

if (!app.isPackaged) {
  require('dotenv').config();
  require('electron-reloader')(module);
}

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
  logError('FATAL ERROR: JWT_SECRET is not defined. The application cannot start securely.');
  app.quit();
}
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
    mainWindow.show();
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
    log('App is ready, initializing database...');
    const tempCredentials = await db.initializeDatabase();
    log('Database initialized successfully.');

    Menu.setApplicationMenu(null);

    if (app.isPackaged) {
      log('Setting up auto-updater...');
      autoUpdater.checkForUpdatesAndNotify();
    }

    const mainWindow = createWindow();

    if (tempCredentials) {
      mainWindow.webContents.on('did-finish-load', () => {
        mainWindow.webContents.send('show-initial-credentials', tempCredentials);
      });
    }

    protocol.registerFileProtocol('safe-image', (request, callback) => {
      try {
        const url = request.url.replace('safe-image://', '');
        const decodedUrl = decodeURI(url);
        let fullPath;
        if (path.isAbsolute(decodedUrl) && fs.existsSync(decodedUrl)) {
          fullPath = decodedUrl;
        } else {
          fullPath = path.join(app.isPackaged ? process.resourcesPath : path.join(__dirname, '..', '..', 'public'), decodedUrl);
        }
        if (fs.existsSync(fullPath)) {
          callback({ path: fullPath });
        } else {
          logError(`[safe-image] File not found: ${fullPath}`);
          callback({ error: -6 });
        }
      } catch (error) {
        logError('[safe-image] protocol handler error:', error);
        callback({ error: -2 });
      }
    });

    const forceRelogin = store.get('force-relogin-after-restart');
    if (forceRelogin) {
      mainWindow.webContents.on('did-finish-load', () => {
        mainWindow.webContents.send('force-logout');
        store.delete('force-relogin-after-restart');
      });
    }

    // Register all IPC handlers
    ipcMain.handle('get-is-packaged', () => app.isPackaged);
    ipcMain.handle('export:generate-dev-template', async () => {
      const { filePath } = await dialog.showSaveDialog({ title: 'Save Dev Excel Template', defaultPath: `quran-assoc-dev-template-${Date.now()}.xlsx`, filters: [{ name: 'Excel Files', extensions: ['xlsx'] }] });
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
    registerTemplateHandlers();
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

ipcMain.on('logout', async () => {
  log('User logging out, closing database connection.');
  await db.closeDatabase();
});

app.on('will-quit', async () => {
  log('App is quitting, ensuring database is closed.');
  await db.closeDatabase();
});
