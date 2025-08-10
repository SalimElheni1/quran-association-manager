const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
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
  createWindow();

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

// We will add database handlers here later.
