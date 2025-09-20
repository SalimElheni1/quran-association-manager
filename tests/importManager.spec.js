const fs = require('fs').promises;
const fsSync = require('fs');

// Mock dependencies
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    unlink: jest.fn(),
  },
}));
jest.mock('fs', () => ({
  existsSync: jest.fn(),
}), { virtual: true });
jest.mock('pizzip');
jest.mock('electron');
jest.mock('electron-store');
jest.mock('exceljs');
jest.mock('../src/main/logger');
jest.mock('../src/db/db');
jest.mock('bcryptjs');
jest.mock('../src/main/matriculeService');
jest.mock('../src/main/keyManager');

const PizZip = require('pizzip');
const { app } = require('electron');
const Store = require('electron-store');
const ExcelJS = require('exceljs');
const { log, error: logError, warn: logWarn } = require('../src/main/logger');
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
const bcrypt = require('bcryptjs');
const { generateMatricule } = require('../src/main/matriculeService');
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
        file: jest.fn()
          .mockReturnValueOnce(mockSqlFile)
          .mockReturnValueOnce(mockConfigFile),
      };

      fs.readFile.mockResolvedValue(mockZipContent);
      PizZip.mockImplementation(() => mockZip);

      const result = await validateDatabaseFile('/path/to/backup.zip');

      expect(fs.readFile).toHaveBeenCalledWith('/path/to/backup.zip');
      expect(PizZip).toHaveBeenCalledWith(mockZipContent);
      expect(mockZip.file).toHaveBeenCalledWith('backup.sql');
      expect(mockZip.file).toHaveBeenCalledWith('salt.json');
      expect(result).toEqual({
        isValid: true,
        message: 'تم التحقق من ملف النسخ الاحتياطي بنجاح.',
      });
    });

    it('should reject backup file missing required files', async () => {
      const mockZipContent = Buffer.from('mock zip content');
      const mockZip = {
        file: jest.fn().mockReturnValue(null), // Missing files
      };

      fs.readFile.mockResolvedValue(mockZipContent);
      PizZip.mockImplementation(() => mockZip);

      const result = await validateDatabaseFile('/path/to/invalid.zip');

      expect(result).toEqual({
        isValid: false,
        message: 'ملف النسخ الاحتياطي غير صالح أو تالف.',
      });
    });

    it('should handle file read errors', async () => {
      const error = new Error('File not found');
      fs.readFile.mockRejectedValue(error);

      const result = await validateDatabaseFile('/path/to/nonexistent.zip');

      expect(logError).toHaveBeenCalledWith('Error during backup validation:', error);
      expect(result).toEqual({
        isValid: false,
        message: 'خطأ في قراءة ملف النسخ الاحتياطي: File not found',
      });
    });
  });

  describe('replaceDatabase', () => {
    it('should successfully replace database', async () => {
      const mockZipContent = Buffer.from('mock zip content');
      const mockSqlFile = { asText: () => 'CREATE TABLE students (id INTEGER);' };
      const mockConfigFile = { 
        asNodeBuffer: () => Buffer.from('{"db-salt": "new-test-salt"}') 
      };
      const mockZip = {
        file: jest.fn()
          .mockReturnValueOnce(mockSqlFile)
          .mockReturnValueOnce(mockConfigFile),
      };

      fs.readFile.mockResolvedValue(mockZipContent);
      PizZip.mockImplementation(() => mockZip);
      getDatabasePath.mockReturnValue('/path/to/current.db');
      isDbOpen.mockReturnValue(true);
      closeDatabase.mockResolvedValue();
      fsSync.existsSync.mockReturnValue(true);
      fs.unlink.mockResolvedValue();
      initializeDatabase.mockResolvedValue();
      getDb.mockReturnValue({});
      dbExec.mockResolvedValue();
      app.relaunch = jest.fn();
      app.quit = jest.fn();

      const result = await replaceDatabase('/path/to/backup.zip', 'password123');

      expect(closeDatabase).toHaveBeenCalled();
      expect(setDbSalt).toHaveBeenCalledWith('new-test-salt');
      expect(fs.unlink).toHaveBeenCalledWith('/path/to/current.db');
      expect(initializeDatabase).toHaveBeenCalledWith('password123');
      expect(dbExec).toHaveBeenCalledWith({}, 'CREATE TABLE students (id INTEGER);');
      expect(app.relaunch).toHaveBeenCalled();
      expect(app.quit).toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        message: 'تم استيراد قاعدة البيانات بنجاح. سيتم إعادة تشغيل التطبيق الآن.',
      });
    });

    it('should handle missing salt in backup', async () => {
      const mockZipContent = Buffer.from('mock zip content');
      const mockSqlFile = { asText: () => 'CREATE TABLE students (id INTEGER);' };
      const mockConfigFile = { 
        asNodeBuffer: () => Buffer.from('{}') // Missing salt
      };
      const mockZip = {
        file: jest.fn()
          .mockReturnValueOnce(mockSqlFile)
          .mockReturnValueOnce(mockConfigFile),
      };

      fs.readFile.mockResolvedValue(mockZipContent);
      PizZip.mockImplementation(() => mockZip);
      getDatabasePath.mockReturnValue('/path/to/current.db');
      isDbOpen.mockReturnValue(false);

      const result = await replaceDatabase('/path/to/backup.zip', 'password123');

      expect(logError).toHaveBeenCalledWith(
        'Failed to replace database from package:',
        expect.any(Error)
      );
      expect(result).toEqual({
        success: false,
        message: expect.stringContaining('فشل استيراد قاعدة البيانات:'),
      });
    });
  });

  describe('importExcelData', () => {
    let mockWorkbook, mockWorksheet, mockHeaderRow, mockDataRow;

    beforeEach(() => {
      mockHeaderRow = {
        hasValues: true,
        eachCell: jest.fn((callback) => {
          callback({ value: 'الاسم واللقب' }, 1);
          callback({ value: 'الجنس' }, 2);
        }),
      };

      mockDataRow = {
        hasValues: true,
        getCell: jest.fn((index) => {
          const cells = {
            1: { value: 'أحمد محمد' },
            2: { value: 'ذكر' },
          };
          return cells[index] || { value: null };
        }),
      };

      mockWorksheet = {
        getRow: jest.fn((rowNum) => {
          if (rowNum === 2) return mockHeaderRow;
          if (rowNum >= 3) return mockDataRow;
          return { hasValues: false };
        }),
        rowCount: 3,
      };

      mockWorkbook = {
        xlsx: {
          readFile: jest.fn(),
        },
        getWorksheet: jest.fn(() => mockWorksheet),
      };

      ExcelJS.Workbook.mockImplementation(() => mockWorkbook);
    });

    it('should successfully import student data', async () => {
      getQuery.mockResolvedValue(null); // No existing student
      generateMatricule.mockResolvedValue('S-000001');
      runQuery.mockResolvedValue();

      const result = await importExcelData('/path/to/data.xlsx', ['الطلاب']);

      expect(mockWorkbook.xlsx.readFile).toHaveBeenCalledWith('/path/to/data.xlsx');
      expect(mockWorkbook.getWorksheet).toHaveBeenCalledWith('الطلاب');
      expect(generateMatricule).toHaveBeenCalledWith('student');
      expect(runQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO students'),
        expect.arrayContaining(['أحمد محمد', 'Male', 'S-000001'])
      );
      expect(result.successCount).toBe(1);
      expect(result.errorCount).toBe(0);
    });

    it('should handle missing required columns', async () => {
      mockHeaderRow.eachCell = jest.fn((callback) => {
        callback({ value: 'غير مطلوب' }, 1); // Missing required column
      });

      const result = await importExcelData('/path/to/data.xlsx', ['الطلاب']);

      expect(result.errorCount).toBeGreaterThan(0);
      expect(result.errors).toContain(
        expect.stringContaining('ينقصها الأعمدة المطلوبة')
      );
    });

    it('should handle worksheet not found', async () => {
      mockWorkbook.getWorksheet.mockReturnValue(null);

      const result = await importExcelData('/path/to/data.xlsx', ['غير موجود']);

      expect(logWarn).toHaveBeenCalledWith(
        expect.stringContaining('Sheet "غير موجود" selected for import but not found')
      );
      expect(result.successCount).toBe(0);
    });

    it('should handle duplicate student', async () => {
      getQuery.mockResolvedValue({ id: 1 }); // Existing student

      const result = await importExcelData('/path/to/data.xlsx', ['الطلاب']);

      expect(result.errorCount).toBe(1);
      expect(result.errors[0]).toContain('موجود بالفعل');
    });

    it('should update existing student with matricule', async () => {
      mockDataRow.getCell = jest.fn((index) => {
        const cells = {
          1: { value: 'S-000001' }, // Matricule
          2: { value: 'أحمد محمد المحدث' }, // Updated name
        };
        return cells[index] || { value: null };
      });

      mockHeaderRow.eachCell = jest.fn((callback) => {
        callback({ value: 'الرقم التعريفي' }, 1);
        callback({ value: 'الاسم واللقب' }, 2);
      });

      getQuery.mockResolvedValue({ id: 1 }); // Existing student

      const result = await importExcelData('/path/to/data.xlsx', ['الطلاب']);

      expect(runQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE students SET'),
        expect.arrayContaining(['أحمد محمد المحدث', 'S-000001'])
      );
      expect(result.successCount).toBe(1);
    });

    it('should handle processing errors gracefully', async () => {
      runQuery.mockRejectedValue(new Error('Database error'));

      const result = await importExcelData('/path/to/data.xlsx', ['الطلاب']);

      expect(result.errorCount).toBe(1);
      expect(result.errors[0]).toContain('An unexpected error occurred');
    });

    it('should process multiple sheets', async () => {
      getQuery.mockResolvedValue(null);
      generateMatricule.mockResolvedValue('T-000001');
      runQuery.mockResolvedValue();

      // Mock teacher data
      mockHeaderRow.eachCell = jest.fn((callback) => {
        callback({ value: 'الاسم واللقب' }, 1);
      });
      mockDataRow.getCell = jest.fn(() => ({ value: 'فاطمة أحمد' }));

      const result = await importExcelData('/path/to/data.xlsx', ['الطلاب', 'المعلمون']);

      expect(mockWorkbook.getWorksheet).toHaveBeenCalledWith('الطلاب');
      expect(mockWorkbook.getWorksheet).toHaveBeenCalledWith('المعلمون');
      expect(result.successCount).toBe(2); // One from each sheet
    });
  });
});