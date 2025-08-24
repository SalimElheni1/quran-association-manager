const { app, BrowserWindow, ipcMain, Menu, protocol, dialog } = require('electron');
const path = require('path');
const db = require('../db/db');
const { refreshSettings } = require('./settingsManager');
const Store = require('electron-store');
const { registerFinancialHandlers } = require('./financialHandlers');
const { registerStudentHandlers } = require('./handlers/studentHandlers');
const { registerTeacherHandlers } = require('./handlers/teacherHandlers');
const { registerClassHandlers } = require('./handlers/classHandlers');
const { registerUserHandlers } = require('./handlers/userHandlers');
const { registerAttendanceHandlers } = require('./handlers/attendanceHandlers');
const { registerAuthHandlers } = require('./handlers/authHandlers');
const { registerSettingsHandlers } = require('./handlers/settingsHandlers');
const { registerDashboardHandlers } = require('./handlers/dashboardHandlers');
const { registerSystemHandlers } = require('./handlers/systemHandlers');
const { generateDevExcelTemplate } = require('./exportManager');

require('dotenv').config();

if (require('electron-squirrel-startup')) {
  app.quit();
}

if (!app.isPackaged) {
  require('electron-reloader')(module);
}

if (!process.env.JWT_SECRET) {
  console.error(
    'FATAL ERROR: JWT_SECRET is not defined in the .env file. The application cannot start securely.',
  );
  app.quit();
}

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: path.join(app.getAppPath(), app.isPackaged ? '../g247.png' : 'public/g247.png'),
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
  // Register a custom protocol to safely serve images from the app's data directory.
  // This prevents exposing the entire filesystem to the renderer process.
  try {
    protocol.registerFileProtocol('safe-image', (request, callback) => {
      try {
        const url = request.url.replace('safe-image://', '');
        const decodedUrl = decodeURI(url);

        // Determine the base path based on environment
        const isDev = !app.isPackaged;
        const basePath = isDev ? process.cwd() : process.resourcesPath;

        // Construct the full path
        const fullPath = path.join(basePath, 'public', decodedUrl);

        if (fs.existsSync(fullPath)) {
          callback({ path: fullPath });
        } else {
          // Fallback for user-uploaded images in userData
          const userImagePath = path.join(app.getPath('userData'), decodedUrl);
          if (fs.existsSync(userImagePath)) {
            callback({ path: userImagePath });
          } else {
            console.error(`File not found: ${fullPath} and ${userImagePath}`);
            callback({ error: -6 }); // net::ERR_FILE_NOT_FOUND
          }
        }
      } catch (error) {
        console.error('Error in safe-image protocol handler:', error);
        callback({ error: -2 }); // net::FAILED
      }
    });

    Menu.setApplicationMenu(null);
    const mainWindow = createWindow();

    // Check if a re-login is required after an import/restore operation
    const forceRelogin = store.get('force-relogin-after-restart');
    if (forceRelogin) {
      console.log('Force re-login flag is set. Sending force-logout signal to renderer.');
      // Wait for the window to be ready to receive events before sending
      mainWindow.webContents.on('did-finish-load', () => {
        mainWindow.webContents.send('force-logout');
        store.delete('force-relogin-after-restart');
        console.log('Force re-login flag cleared.');
      });
    }

    // Register all IPC handlers
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
          console.error('Failed to generate dev excel template:', error);
          return { success: false, message: error.message };
        }
      }
      return { success: false, message: 'Save cancelled by user.' };
    });

    registerFinancialHandlers();
    registerStudentHandlers();
    registerTeacherHandlers();
    registerClassHandlers();
    registerUserHandlers();
    registerAttendanceHandlers();
    registerAuthHandlers();
    registerSettingsHandlers(refreshSettings);
    registerDashboardHandlers();
    registerSystemHandlers();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  } catch (error) {
    console.error('Fatal error during application startup:', error);
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
  console.log('User logging out, closing database connection.');
  await db.closeDatabase();
});

// Gracefully close the database when the app is about to quit
app.on('will-quit', async () => {
  console.log('App is quitting, ensuring database is closed.');
  await db.closeDatabase();
});

// --- Attendance IPC Handlers ---

// --- Backup IPC Handlers ---
const store = new Store();
