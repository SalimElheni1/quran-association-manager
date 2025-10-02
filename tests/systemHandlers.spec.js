const { registerSystemHandlers, handleGetBackupReminderStatus } = require('../src/main/handlers/systemHandlers');

// Mock dependencies
jest.mock('electron', () => ({
  ipcMain: {
    handle: jest.fn(),
  },
  app: {
    getVersion: jest.fn(),
  },
  dialog: {
    showSaveDialog: jest.fn(),
    showOpenDialog: jest.fn(),
  },
}));
jest.mock('../../db/db');
jest.mock('../src/main/logger', () => ({
  error: jest.fn(),
}));
jest.mock('../src/main/exportManager');
jest.mock('../src/main/importManager');
jest.mock('../src/main/backupManager');
jest.mock('../src/main/handlers/settingsHandlers');
jest.mock('electron-store');
jest.mock('bcryptjs');

const { ipcMain, app, dialog } = require('electron');
const db = require('../../db/db');
const { error: logError } = require('../src/main/logger');
const exportManager = require('../src/main/exportManager');
const importManager = require('../src/main/importManager');
const backupManager = require('../src/main/backupManager');
const { internalGetSettingsHandler } = require('../src/main/handlers/settingsHandlers');
const Store = require('electron-store');
const bcrypt = require('bcryptjs');

describe('systemHandlers', () => {
  let handlers = {};
  let mockStore;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Capture registered handlers
    ipcMain.handle.mockImplementation((channel, handler) => {
      handlers[channel] = handler;
    });

    mockStore = {
      get: jest.fn(),
    };
    Store.mockImplementation(() => mockStore);
    
    registerSystemHandlers();
  });

  describe('get-app-version', () => {
    it('should return app version', async () => {
      app.getVersion.mockReturnValue('1.0.0');

      const result = await handlers['get-app-version']();

      expect(app.getVersion).toHaveBeenCalled();
      expect(result).toBe('1.0.0');
    });
  });

  describe('export:generate', () => {
    it('should generate PDF export successfully', async () => {
      const exportParams = {
        exportType: 'students',
        format: 'pdf',
        columns: [{ key: 'name', header: 'Name' }],
        options: {}
      };
      const mockHeaderData = { nationalAssociationName: 'Test Org' };
      const mockData = [{ name: 'John Doe' }];

      dialog.showSaveDialog.mockResolvedValue({ filePath: '/path/to/export.pdf' });
      exportManager.getExportHeaderData.mockResolvedValue(mockHeaderData);
      exportManager.fetchExportData.mockResolvedValue(mockData);
      exportManager.generatePdf.mockResolvedValue();

      const result = await handlers['export:generate'](null, exportParams);

      expect(dialog.showSaveDialog).toHaveBeenCalledWith({
        title: 'Save students Export',
        defaultPath: expect.stringContaining('students-export-'),
        filters: [{ name: 'PDF Documents', extensions: ['pdf'] }]
      });
      expect(exportManager.fetchExportData).toHaveBeenCalledWith({
        type: 'students',
        fields: ['name'],
        options: {}
      });
      expect(exportManager.generatePdf).toHaveBeenCalledWith(
        'Students Report',
        exportParams.columns,
        mockData,
        '/path/to/export.pdf',
        mockHeaderData
      );
      expect(result).toEqual({
        success: true,
        message: 'Export saved to /path/to/export.pdf'
      });
    });

    it('should generate XLSX export successfully', async () => {
      const exportParams = {
        exportType: 'teachers',
        format: 'xlsx',
        columns: [{ key: 'name', header: 'Name' }],
        options: {}
      };
      const mockData = [{ name: 'Jane Smith' }];

      dialog.showSaveDialog.mockResolvedValue({ filePath: '/path/to/export.xlsx' });
      exportManager.getExportHeaderData.mockResolvedValue({});
      exportManager.fetchExportData.mockResolvedValue(mockData);
      exportManager.generateXlsx.mockResolvedValue();

      const result = await handlers['export:generate'](null, exportParams);

      expect(dialog.showSaveDialog).toHaveBeenCalledWith({
        title: 'Save teachers Export',
        defaultPath: expect.stringContaining('teachers-export-'),
        filters: [{ name: 'Excel Spreadsheets', extensions: ['xlsx'] }]
      });
      expect(exportManager.generateXlsx).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should generate DOCX export successfully', async () => {
      const exportParams = {
        exportType: 'admins',
        format: 'docx',
        columns: [{ key: 'username', header: 'Username' }],
        options: {}
      };
      const mockData = [{ username: 'admin' }];

      dialog.showSaveDialog.mockResolvedValue({ filePath: '/path/to/export.docx' });
      exportManager.getExportHeaderData.mockResolvedValue({});
      exportManager.fetchExportData.mockResolvedValue(mockData);
      exportManager.generateDocx.mockResolvedValue();

      const result = await handlers['export:generate'](null, exportParams);

      expect(dialog.showSaveDialog).toHaveBeenCalledWith({
        title: 'Save admins Export',
        defaultPath: expect.stringContaining('admins-export-'),
        filters: [{ name: 'Word Documents', extensions: ['docx'] }]
      });
      expect(exportManager.generateDocx).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should generate financial report export', async () => {
      const exportParams = {
        exportType: 'financial-report',
        format: 'xlsx',
        columns: [],
        options: { period: { startDate: '2024-01-01', endDate: '2024-12-31' } }
      };
      const mockData = { summary: {}, payments: [] };

      dialog.showSaveDialog.mockResolvedValue({ filePath: '/path/to/financial.xlsx' });
      exportManager.getExportHeaderData.mockResolvedValue({});
      exportManager.fetchFinancialData.mockResolvedValue(mockData);
      exportManager.generateFinancialXlsx.mockResolvedValue();

      const result = await handlers['export:generate'](null, exportParams);

      expect(exportManager.fetchFinancialData).toHaveBeenCalledWith(exportParams.options.period);
      expect(exportManager.generateFinancialXlsx).toHaveBeenCalledWith(mockData, '/path/to/financial.xlsx');
      expect(result.success).toBe(true);
    });

    it('should handle user cancellation', async () => {
      const exportParams = {
        exportType: 'students',
        format: 'pdf',
        columns: [{ key: 'name', header: 'Name' }],
        options: {}
      };

      dialog.showSaveDialog.mockResolvedValue({ filePath: undefined });

      const result = await handlers['export:generate'](null, exportParams);

      expect(result).toEqual({
        success: false,
        message: 'Export canceled by user.'
      });
    });

    it('should handle no data available', async () => {
      const exportParams = {
        exportType: 'students',
        format: 'pdf',
        columns: [{ key: 'name', header: 'Name' }],
        options: {}
      };

      dialog.showSaveDialog.mockResolvedValue({ filePath: '/path/to/export.pdf' });
      exportManager.getExportHeaderData.mockResolvedValue({});
      exportManager.fetchExportData.mockResolvedValue([]);

      const result = await handlers['export:generate'](null, exportParams);

      expect(result).toEqual({
        success: false,
        message: 'No data available for the selected criteria.'
      });
    });

    it('should handle unsupported format', async () => {
      const exportParams = {
        exportType: 'students',
        format: 'unsupported',
        columns: [{ key: 'name', header: 'Name' }],
        options: {}
      };
      const mockData = [{ name: 'John' }];

      dialog.showSaveDialog.mockResolvedValue({ filePath: '/path/to/export.unsupported' });
      exportManager.getExportHeaderData.mockResolvedValue({});
      exportManager.fetchExportData.mockResolvedValue(mockData);

      const result = await handlers['export:generate'](null, exportParams);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Unsupported export format: unsupported');
    });

    it('should handle export errors', async () => {
      const exportParams = {
        exportType: 'students',
        format: 'pdf',
        columns: [{ key: 'name', header: 'Name' }],
        options: {}
      };
      const error = new Error('Export failed');

      dialog.showSaveDialog.mockResolvedValue({ filePath: '/path/to/export.pdf' });
      exportManager.getExportHeaderData.mockRejectedValue(error);

      const result = await handlers['export:generate'](null, exportParams);

      expect(logError).toHaveBeenCalledWith('Error during export (students, pdf):', error);
      expect(result).toEqual({
        success: false,
        message: 'Export failed: Export failed'
      });
    });
  });

  describe('import:generate-template', () => {
    it('should generate import template successfully', async () => {
      dialog.showSaveDialog.mockResolvedValue({ filePath: '/path/to/template.xlsx' });
      exportManager.generateExcelTemplate.mockResolvedValue();

      const result = await handlers['import:generate-template']();

      expect(dialog.showSaveDialog).toHaveBeenCalledWith({
        title: 'Save Import Template',
        defaultPath: expect.stringContaining('import-template-'),
        filters: [{ name: 'Excel Spreadsheets', extensions: ['xlsx'] }]
      });
      expect(exportManager.generateExcelTemplate).toHaveBeenCalledWith('/path/to/template.xlsx');
      expect(result).toEqual({
        success: true,
        message: 'Template saved to /path/to/template.xlsx'
      });
    });

    it('should handle user cancellation', async () => {
      dialog.showSaveDialog.mockResolvedValue({ filePath: undefined });

      const result = await handlers['import:generate-template']();

      expect(result).toEqual({
        success: false,
        message: 'Template generation canceled by user.'
      });
    });

    it('should handle template generation errors', async () => {
      const error = new Error('Template generation failed');
      dialog.showSaveDialog.mockResolvedValue({ filePath: '/path/to/template.xlsx' });
      exportManager.generateExcelTemplate.mockRejectedValue(error);

      const result = await handlers['import:generate-template']();

      expect(logError).toHaveBeenCalledWith('Error during template generation:', error);
      expect(result).toEqual({
        success: false,
        message: 'Template generation failed: Template generation failed'
      });
    });
  });

  describe('import:execute', () => {
    it('should execute import successfully', async () => {
      const selectedSheets = ['الطلاب', 'المعلمون'];
      const mockResults = { successCount: 5, errorCount: 0, errors: [] };

      dialog.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/path/to/import.xlsx']
      });
      importManager.importExcelData.mockResolvedValue(mockResults);

      const result = await handlers['import:execute'](null, { selectedSheets });

      expect(dialog.showOpenDialog).toHaveBeenCalledWith({
        title: 'Select Excel File to Import',
        properties: ['openFile'],
        filters: [{ name: 'Excel Spreadsheets', extensions: ['xlsx'] }]
      });
      expect(importManager.importExcelData).toHaveBeenCalledWith('/path/to/import.xlsx', selectedSheets);
      expect(result).toEqual({
        success: true,
        ...mockResults
      });
    });

    it('should handle user cancellation', async () => {
      dialog.showOpenDialog.mockResolvedValue({ canceled: true });

      const result = await handlers['import:execute'](null, { selectedSheets: [] });

      expect(result).toEqual({
        success: false,
        message: 'Import canceled by user.'
      });
    });

    it('should handle no file selected', async () => {
      dialog.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: []
      });

      const result = await handlers['import:execute'](null, { selectedSheets: [] });

      expect(result).toEqual({
        success: false,
        message: 'Import canceled by user.'
      });
    });

    it('should handle import errors', async () => {
      const error = new Error('Import failed');
      dialog.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/path/to/import.xlsx']
      });
      importManager.importExcelData.mockRejectedValue(error);

      const result = await handlers['import:execute'](null, { selectedSheets: [] });

      expect(logError).toHaveBeenCalledWith('Error during import execution:', error);
      expect(result).toEqual({
        success: false,
        message: 'Import failed: Import failed'
      });
    });
  });

  describe('dialog:openDirectory', () => {
    it('should open directory dialog successfully', async () => {
      dialog.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/path/to/directory']
      });

      const result = await handlers['dialog:openDirectory']();

      expect(dialog.showOpenDialog).toHaveBeenCalledWith({
        properties: ['openDirectory']
      });
      expect(result).toEqual({
        success: true,
        path: '/path/to/directory'
      });
    });

    it('should handle user cancellation', async () => {
      dialog.showOpenDialog.mockResolvedValue({ canceled: true });

      const result = await handlers['dialog:openDirectory']();

      expect(result).toEqual({ success: false });
    });
  });

  describe('backup:run', () => {
    it('should run backup successfully', async () => {
      const settings = { backup_path: '/mock/backup/path' };
      const mockResult = { success: true, message: 'Backup completed' };

      dialog.showSaveDialog.mockResolvedValue({
        canceled: false,
        filePath: '/path/to/backup.qdb'
      });
      backupManager.runBackup.mockResolvedValue(mockResult);

      const result = await handlers['backup:run'](null, settings);

      expect(dialog.showSaveDialog).toHaveBeenCalledWith({
        title: 'Save Database Backup',
        defaultPath: expect.stringContaining('backup-'),
        filters: [{ name: 'Quran DB Backups', extensions: ['qdb'] }]
      });
      expect(backupManager.runBackup).toHaveBeenCalledWith(settings, '/path/to/backup.qdb');
      expect(result).toBe(mockResult);
    });

    it('should handle user cancellation', async () => {
      const settings = { backup_path: '/mock/backup/path' };
      dialog.showSaveDialog.mockResolvedValue({ canceled: true });

      const result = await handlers['backup:run'](null, settings);

      expect(result).toEqual({
        success: false,
        message: 'Backup canceled by user.'
      });
    });

    it('should handle missing settings', async () => {
      const result = await handlers['backup:run'](null, null);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Backup path is required.');
    });

    it('should handle backup errors', async () => {
      const settings = { backup_path: '/mock/backup/path' };
      const error = new Error('Backup failed');

      dialog.showSaveDialog.mockResolvedValue({
        canceled: false,
        filePath: '/path/to/backup.qdb'
      });
      backupManager.runBackup.mockRejectedValue(error);

      const result = await handlers['backup:run'](null, settings);

      expect(logError).toHaveBeenCalledWith('Error in backup:run IPC wrapper:', error);
      expect(result).toEqual({
        success: false,
        message: 'Backup failed'
      });
    });
  });

  describe('backup:getStatus', () => {
    it('should get backup status successfully', async () => {
      const mockStatus = {
        success: true,
        timestamp: '2024-01-01T00:00:00.000Z',
        message: 'Backup completed'
      };
      mockStore.get.mockReturnValue(mockStatus);

      const result = await handlers['backup:getStatus']();

      expect(mockStore.get).toHaveBeenCalledWith('last_backup_status');
      expect(result).toEqual({
        success: true,
        status: mockStatus
      });
    });

    it('should handle errors when getting backup status', async () => {
      const error = new Error('Store error');
      mockStore.get.mockImplementation(() => {
        throw error;
      });

      const result = await handlers['backup:getStatus']();

      expect(logError).toHaveBeenCalledWith('Error in backup:getStatus IPC wrapper:', error);
      expect(result).toEqual({
        success: false,
        message: 'Could not retrieve backup status.'
      });
    });
  });

  describe('db:import', () => {
    it('should import database successfully', async () => {
      const password = 'correct-password';
      const userId = 1;
      const mockUser = { password: 'hashed-password' };
      const mockValidationResult = { isValid: true };
      const mockImportResult = { success: true, message: 'Import completed' };

      db.getQuery.mockResolvedValue(mockUser);
      bcrypt.compare.mockResolvedValue(true);
      dialog.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/path/to/backup.qdb']
      });
      importManager.validateDatabaseFile.mockResolvedValue(mockValidationResult);
      importManager.replaceDatabase.mockResolvedValue(mockImportResult);

      const result = await handlers['db:import'](null, { password, userId });

      expect(db.getQuery).toHaveBeenCalledWith('SELECT password FROM users WHERE id = ?', [userId]);
      expect(bcrypt.compare).toHaveBeenCalledWith(password, 'hashed-password');
      expect(importManager.validateDatabaseFile).toHaveBeenCalledWith('/path/to/backup.qdb');
      expect(importManager.replaceDatabase).toHaveBeenCalledWith('/path/to/backup.qdb', password);
      expect(result).toBe(mockImportResult);
    });

    it('should handle missing authentication data', async () => {
      const result = await handlers['db:import'](null, { password: null, userId: 1 });

      expect(result).toEqual({
        success: false,
        message: 'بيانات المصادقة غير كاملة.'
      });
    });

    it('should handle user not found', async () => {
      db.getQuery.mockResolvedValue(null);

      const result = await handlers['db:import'](null, { password: 'password', userId: 1 });

      expect(result).toEqual({
        success: false,
        message: 'المستخدم الحالي غير موجود.'
      });
    });

    it('should handle incorrect password', async () => {
      const mockUser = { password: 'hashed-password' };
      db.getQuery.mockResolvedValue(mockUser);
      bcrypt.compare.mockResolvedValue(false);

      const result = await handlers['db:import'](null, { password: 'wrong-password', userId: 1 });

      expect(result).toEqual({
        success: false,
        message: 'كلمة المرور الحالية التي أدخلتها غير صحيحة.'
      });
    });

    it('should handle user cancellation', async () => {
      const mockUser = { password: 'hashed-password' };
      db.getQuery.mockResolvedValue(mockUser);
      bcrypt.compare.mockResolvedValue(true);
      dialog.showOpenDialog.mockResolvedValue({ canceled: true });

      const result = await handlers['db:import'](null, { password: 'password', userId: 1 });

      expect(result).toEqual({
        success: false,
        message: 'لم يتم تحديد أي ملف.'
      });
    });

    it('should handle invalid database file', async () => {
      const mockUser = { password: 'hashed-password' };
      const mockValidationResult = { isValid: false, message: 'Invalid file' };

      db.getQuery.mockResolvedValue(mockUser);
      bcrypt.compare.mockResolvedValue(true);
      dialog.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/path/to/invalid.qdb']
      });
      importManager.validateDatabaseFile.mockResolvedValue(mockValidationResult);

      const result = await handlers['db:import'](null, { password: 'password', userId: 1 });

      expect(result).toEqual({
        success: false,
        message: 'Invalid file'
      });
    });

    it('should handle import errors', async () => {
      const mockUser = { password: 'hashed-password' };
      const error = new Error('Import failed');

      db.getQuery.mockResolvedValue(mockUser);
      bcrypt.compare.mockResolvedValue(true);
      dialog.showOpenDialog.mockResolvedValue({
        canceled: false,
        filePaths: ['/path/to/backup.qdb']
      });
      importManager.validateDatabaseFile.mockRejectedValue(error);

      const result = await handlers['db:import'](null, { password: 'password', userId: 1 });

      expect(logError).toHaveBeenCalledWith('Error during database import process:', error);
      expect(result.success).toBe(false);
      expect(result.message).toContain('حدث خطأ فادح أثناء الاستيراد');
    });
  });

  describe('handleGetBackupReminderStatus', () => {
    it('should return no reminder when disabled', async () => {
      const mockSettings = { backup_reminder_enabled: false };
      internalGetSettingsHandler.mockResolvedValue({ settings: mockSettings });

      const result = await handleGetBackupReminderStatus();

      expect(result).toEqual({ showReminder: false });
    });

    it('should return reminder when no backup exists', async () => {
      const mockSettings = { backup_reminder_enabled: true };
      internalGetSettingsHandler.mockResolvedValue({ settings: mockSettings });
      mockStore.get.mockReturnValue(null);

      const result = await handleGetBackupReminderStatus();

      expect(result).toEqual({
        showReminder: true,
        daysSinceLastBackup: Infinity
      });
    });

    it('should return reminder when backup is overdue', async () => {
      const mockSettings = {
        backup_reminder_enabled: true,
        backup_reminder_frequency_days: 7
      };
      const oldBackup = {
        timestamp: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString() // 10 days ago
      };

      internalGetSettingsHandler.mockResolvedValue({ settings: mockSettings });
      mockStore.get.mockReturnValue(oldBackup);

      const result = await handleGetBackupReminderStatus();

      expect(result.showReminder).toBe(true);
      expect(result.daysSinceLastBackup).toBe(10);
    });

    it('should return no reminder when backup is recent', async () => {
      const mockSettings = {
        backup_reminder_enabled: true,
        backup_reminder_frequency_days: 7
      };
      const recentBackup = {
        timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString() // 3 days ago
      };

      internalGetSettingsHandler.mockResolvedValue({ settings: mockSettings });
      mockStore.get.mockReturnValue(recentBackup);

      const result = await handleGetBackupReminderStatus();

      expect(result).toEqual({ showReminder: false });
    });

    it('should handle errors gracefully', async () => {
      const error = new Error('Settings error');
      internalGetSettingsHandler.mockRejectedValue(error);

      const result = await handleGetBackupReminderStatus();

      expect(logError).toHaveBeenCalledWith('Error checking backup reminder status:', error);
      expect(result).toEqual({
        showReminder: false,
        error: 'Could not check backup status.'
      });
    });
  });
});