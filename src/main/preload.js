const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // General
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  // Auth
  login: (credentials) => ipcRenderer.invoke('auth:login', credentials),
  // Database
  db: {
    run: (sql, params) => ipcRenderer.invoke('db:run', { sql, params }),
    get: (sql, params) => ipcRenderer.invoke('db:get', { sql, params }),
    all: (sql, params) => ipcRenderer.invoke('db:all', { sql, params }),
  },
});
