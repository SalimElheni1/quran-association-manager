const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  // We will add our database functions here later
  // e.g., dbQuery: (query, params) => ipcRenderer.invoke('db-query', { query, params }),
});
