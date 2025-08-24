// Electron Modules
const { app, BrowserWindow, ipcMain, Menu, protocol, dialog, net } = require('electron');

// Node.js Modules
const path = require('path');
const url = require('url');
const crypto = require('crypto');

// Third-party Modules
const Store = require('electron-store');

// Local Application Modules
const db = require('../db/db');
const { refreshSettings } = require('./settingsManager');
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

const store = new Store();

// Register custom protocols as privileged.
// This is a critical step that allows modern web features like `fetch` and ES6 modules
// to work correctly with our custom `app://` and `safe-image://` schemes.
// This must be done before the app's 'ready' event.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
  { scheme: 'safe-image', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

if (require('electron-squirrel-startup')) {
  app.quit();
}

// Load environment variables from .env file only in development mode
if (!app.isPackaged) {
  require('dotenv').config();
  require('electron-reloader')(module);
}

// This is a critical check for the JWT secret.
// In development, it must be in the .env file.
// In production, we provide a default fallback to ensure the app can start.
if (!process.env.JWT_SECRET) {
  // For a packaged app, we generate and store a unique secret per installation.
  if (app.isPackaged) {
    let secret = store.get('jwtSecret');
    if (!secret) {
      console.log('JWT secret not found for this installation, generating a new one.');
      secret = crypto.randomBytes(32).toString('hex');
      store.set('jwtSecret', secret);
    }
    process.env.JWT_SECRET = secret;
  } else {
    // In development, we rely on the .env file.
    console.error(
      'FATAL ERROR: JWT_SECRET is not defined in the .env file. The application cannot start securely.',
    );
    app.quit();
  }
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
    icon: path.join(app.getAppPath(), app.isPackaged ? 'g247.png' : 'public/g247.png'),
  });

  // In development, load from the Vite dev server for hot-reloading.
  // In production, load the local index.html file using our custom 'app://' protocol.
  if (!app.isPackaged) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadURL('app://index.html');
    // Keep DevTools open to confirm the fix or see any new errors.
    // This should be removed for the final release.
    mainWindow.webContents.openDevTools();
  }
  return mainWindow;
};

app.whenReady().then(async () => {
  // Register a custom protocol to safely serve images from the app's data directory.
  // This prevents exposing the entire filesystem to the renderer process.
  try {
    // Use the modern `protocol.handle` API to serve files from the packaged app.
    protocol.handle('app', (request) => {
      const url = new URL(request.url);
      // The pathname will be like `/index.html`, so we remove the leading slash.
      const relativePath = url.pathname.slice(1);
      // Correctly point to the 'dist/renderer' directory where Vite builds the assets.
      // Use app.getAppPath() for a robust path to the application's root.
      const absolutePath = path.join(app.getAppPath(), 'dist/renderer', relativePath);
      // Use net.fetch with a file:// URL, which is the recommended modern approach.
      return net.fetch(url.pathToFileURL(absolutePath).toString());
    });

    // Use `protocol.handle` for the safe-image protocol as well for consistency.
    protocol.handle('safe-image', (request) => {
      const url = new URL(request.url);
      const relativePath = decodeURI(url.pathname.slice(1));
      const absolutePath = path.join(app.getPath('userData'), relativePath);

      // Security check to prevent path traversal attacks.
      const safeDir = path.join(app.getPath('userData'), 'assets');
      if (!absolutePath.startsWith(safeDir)) {
        console.error('Blocked unsafe path request:', absolutePath);
        return new Response('Forbidden', { status: 403 });
      }

      return net.fetch(url.pathToFileURL(absolutePath).toString());
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
