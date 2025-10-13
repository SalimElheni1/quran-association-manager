// tests/importManager.spec.js

// Mock all dependencies at the top level
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    unlink: jest.fn(),
  },
  existsSync: jest.fn(),
}));
jest.mock('pizzip');
jest.mock('electron');
jest.mock('electron-store');
jest.mock('exceljs');
jest.mock('../src/main/logger');
jest.mock('../src/db/db');
jest.mock('bcryptjs');
jest.mock('../src/main/services/matriculeService');
jest.mock('../src/main/keyManager');

const fs = require('fs').promises;
const fsSync = require('fs');
const PizZip = require('pizzip');
const { app } = require('electron');
const ExcelJS = require('exceljs');
const { error: logError } = require('../src/main/logger');
const {
  getDatabasePath,
  isDbOpen,
  closeDatabase,
  initializeDatabase,
  getDb,
  dbExec,
  runQuery,
  getQuery,
} = require('../src/db/db');
const { generateMatricule } = require('../src/main/services/matriculeService');
const { setDbSalt } = require('../src/main/keyManager');
const {
  validateDatabaseFile,
  replaceDatabase,
  importExcelData,
} = require('../src/main/importManager');

describe('importManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateDatabaseFile', () => {
    it('should validate a correct backup file', async () => {
      const mockZipContent = Buffer.from('mock zip content');
      const mockSqlFile = { asText: () => 'SELECT * FROM students;' };
      const mockConfigFile = { asNodeBuffer: () => Buffer.from('{"db-salt": "test-salt"}') };
      const mockZip = {
        file: jest.fn().mockReturnValueOnce(mockSqlFile).mockReturnValueOnce(mockConfigFile),
      };

      fs.readFile.mockResolvedValue(mockZipContent);
      PizZip.mockImplementation(() => mockZip);

      const result = await validateDatabaseFile('/path/to/backup.zip');

      expect(result.isValid).toBe(true);
    });
  });

  describe.skip('replaceDatabase', () => {
    it('should successfully replace database', async () => {
      const mockZipContent = Buffer.from('mock zip content');
      const mockSqlFile = { asText: () => 'CREATE TABLE students (id INTEGER);' };
      const mockConfigFile = { asNodeBuffer: () => Buffer.from('{"db-salt": "new-test-salt"}') };
      const mockZip = {
        file: jest.fn().mockReturnValueOnce(mockSqlFile).mockReturnValueOnce(mockConfigFile),
      };
      fs.readFile.mockResolvedValue(mockZipContent);
      PizZip.mockImplementation(() => mockZip);
      getDatabasePath.mockReturnValue('/path/to/current.db');
      isDbOpen.mockReturnValue(true);
      fsSync.existsSync.mockReturnValue(true);
      app.relaunch = jest.fn();
      app.quit = jest.fn();
      // Ensure getDb returns a simple object, as dbExec is mocked anyway
      getDb.mockReturnValue({});

      const result = await replaceDatabase('/path/to/backup.zip', 'password123');

      expect(closeDatabase).toHaveBeenCalled();
      expect(setDbSalt).toHaveBeenCalledWith('new-test-salt');
      expect(fs.unlink).toHaveBeenCalledWith('/path/to/current.db');
      expect(initializeDatabase).toHaveBeenCalledWith('password123');
      expect(dbExec).toHaveBeenCalledWith(
        expect.any(Object),
        'CREATE TABLE students (id INTEGER);',
      );
      expect(app.relaunch).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(logError).not.toHaveBeenCalled();
    });
  });

  describe('importExcelData', () => {
    it('should successfully import student data with translation', async () => {
      const mockGenderCell = { value: 'ذكر' };
      const mockHeaderRow = {
        hasValues: true,
        eachCell: jest.fn((cb) => {
          cb({ value: 'الاسم واللقب' }, 1);
          cb({ value: 'الجنس' }, 2);
        }),
      };
      const mockDataRow = {
        hasValues: true,
        getCell: jest.fn((index) => {
          if (index === 1) return { value: 'أحمد محمد' };
          if (index === 2) return mockGenderCell;
          return { value: null };
        }),
      };
      const mockWorksheet = {
        getRow: jest.fn((num) => (num === 2 ? mockHeaderRow : mockDataRow)),
        rowCount: 3,
      };
      const mockWorkbook = {
        xlsx: { readFile: jest.fn().mockResolvedValue() },
        getWorksheet: jest.fn(() => mockWorksheet),
      };
      ExcelJS.Workbook.mockImplementation(() => mockWorkbook);

      getQuery.mockResolvedValue(null);
      generateMatricule.mockResolvedValue('S-000001');

      const result = await importExcelData('/path/to/data.xlsx', ['الطلاب']);

      expect(runQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO students'),
        expect.arrayContaining(['أحمد محمد', 'Male', 'S-000001']),
      );
      expect(result.successCount).toBe(1);
    });
  });
});
