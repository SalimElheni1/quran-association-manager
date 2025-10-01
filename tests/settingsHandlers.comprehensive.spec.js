// tests/settingsHandlers.comprehensive.spec.js

const {
  registerSettingsHandlers,
} = require('../src/main/handlers/settingsHandlers');

// Mock dependencies
jest.mock('electron');
jest.mock('../src/db/db');
jest.mock('fs');
jest.mock('../src/main/backupManager');
jest.mock('../src/main/logger');

const { ipcMain, app, dialog } = require('electron');
const db = require('../src/db/db');
const fs = require('fs');
const path = require('path'); // Use real path module
const { log, error: logError } = require('../src/main/logger');

describe('settingsHandlers - Comprehensive Tests', () => {
  let handlers = {};
  let mockRefreshSettings;

  beforeEach(() => {
    jest.clearAllMocks();
    
    handlers = {};
    ipcMain.handle.mockImplementation((channel, handler) => {
      handlers[channel] = handler;
    });

    mockRefreshSettings = jest.fn();
    registerSettingsHandlers(mockRefreshSettings);

    // Default mock implementations
    app.getPath.mockReturnValue('/mock/userData');
    db.runQuery.mockResolvedValue({ changes: 1 });
  });

  describe('IPC Handler - settings:uploadLogo - Comprehensive Cases', () => {
    it('should create directory and upload logo when directory does not exist', async () => {
      const mockFilePath = '/temp/new-logo.jpg';
      const expectedDir = path.join('/mock/userData', 'assets', 'logos');
      
      dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [mockFilePath] });
      
      fs.existsSync.mockImplementation(p => {
        if (p === mockFilePath) return true;
        if (p === expectedDir) return false;
        return false;
      });
      
      const result = await handlers['settings:uploadLogo']();

      expect(fs.mkdirSync).toHaveBeenCalledWith(expectedDir, { recursive: true });
      expect(fs.copyFileSync).toHaveBeenCalledWith(mockFilePath, path.join(expectedDir, 'new-logo.jpg'));
      expect(result.path).toBe('assets/logos/new-logo.jpg');
    });

    it('should handle directory creation failure', async () => {
        const mockFilePath = '/temp/logo.png';
        const expectedDir = path.join('/mock/userData', 'assets', 'logos');
        const dirError = new Error('Permission denied');

        dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [mockFilePath] });
        
        fs.existsSync.mockImplementation(p => {
            if (p === mockFilePath) return true;
            if (p === expectedDir) return false;
            return false;
        });

        fs.mkdirSync.mockImplementation(() => { throw dirError; });

        const result = await handlers['settings:uploadLogo']();

        expect(logError).toHaveBeenCalledWith('Failed to upload logo:', dirError);
        expect(result).toEqual({ success: false, message: `Error uploading logo: ${dirError.message}` });
      });
  });
});