const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const db = require('../db/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Load environment variables
require('dotenv').config();

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

// Security Best Practice: Ensure JWT_SECRET is set.
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
    minWidth: 800, // Minimum width to ensure usability
    minHeight: 600, // Minimum height to ensure usability
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false, // Keep false for security
      contextIsolation: true, // Keep true for security
    },
  });

  // In development, load from the Vite dev server.
  // In production, load the built HTML file.
  // Use `app.isPackaged` to determine whether to load from Vite or a local file.
  // This is the recommended approach for distinguishing between dev and prod.
  if (!app.isPackaged) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools(); // Open DevTools automatically
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/renderer/index.html'));
  }
};

app.whenReady().then(() => {
  // Remove the application menu. This is the idiomatic way to have no menu bar.
  Menu.setApplicationMenu(null);
  createWindow();
  db.initializeDatabase();

  app.on('activate', () => {
    // On macOS, re-create a window when the dock icon is clicked and no other windows are open.
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Quit when all windows are closed, except on macOS.
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// --- IPC Handlers ---
// This is where we'll handle calls from the renderer process.

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

// Database IPC Handlers
ipcMain.handle('db:run', async (event, { sql, params }) => {
  return await db.runQuery(sql, params);
});

ipcMain.handle('db:get', async (event, { sql, params }) => {
  return await db.getQuery(sql, params);
});

ipcMain.handle('db:all', async (event, { sql, params }) => {
  return await db.allQuery(sql, params);
});

// Auth IPC Handler
ipcMain.handle('auth:login', async (event, { username, password }) => {
  try {
    const user = await db.getQuery('SELECT * FROM users WHERE username = ?', [username]);
    if (!user) {
      return { success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
    }

    const passwordIsValid = bcrypt.compareSync(password, user.password);

    if (!passwordIsValid) {
      return { success: false, message: 'اسم المستخدم أو كلمة المرور غير صحيحة' };
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      {
        expiresIn: '8h',
      },
    );

    return {
      success: true,
      token,
      user: { id: user.id, username: user.username, role: user.role },
    };
  } catch (error) {
    console.error('Login error:', error);
    return { success: false, message: 'حدث خطأ أثناء تسجيل الدخول' };
  }
});
