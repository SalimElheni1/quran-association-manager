// tests/importManager.comprehensive.spec.js

// Mock dependencies first
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
const PizZip = require('pizzip');
const ExcelJS = require('exceljs');
const { runQuery, getQuery } = require('../src/db/db');

const { generateMatricule } = require('../src/main/services/matriculeService');

describe('importManager - Comprehensive Tests', () => {
  let validateDatabaseFile, importExcelData;

  beforeEach(() => {
    jest.clearAllMocks();
    const manager = require('../src/main/importManager');
    validateDatabaseFile = manager.validateDatabaseFile;
    importExcelData = manager.importExcelData;
  });

  describe('validateDatabaseFile - Edge Cases', () => {
    it('should handle legacy config.json file', async () => {
      const mockZipContent = Buffer.from('mock zip content');
      const mockSqlFile = { asText: () => 'SELECT * FROM students;' };
      const mockConfigFile = { asNodeBuffer: () => Buffer.from('{"db-salt": "test-salt"}') };
      const mockZip = {
        file: jest.fn((filename) => {
          if (filename === 'backup.sql') return mockSqlFile;
          if (filename === 'salt.json') return null;
          if (filename === 'config.json') return mockConfigFile;
          return null;
        }),
      };

      fs.readFile.mockResolvedValue(mockZipContent);
      PizZip.mockImplementation(() => mockZip);

      const result = await validateDatabaseFile('/path/to/backup.zip');
      expect(result.isValid).toBe(true);
    });
  });

  describe.skip('replaceDatabase - Advanced Scenarios', () => {
    it('is skipped', () => {});
  });

  describe('importExcelData - Complex Scenarios', () => {
    it('should handle student with Arabic gender and status localization', async () => {
      const mockGenderCell = { value: 'أنثى' };
      const mockStatusCell = { value: 'نشط' };
      const mockHeaderRow = {
        hasValues: true,
        eachCell: jest.fn((cb) => {
          cb({ value: 'الاسم واللقب' }, 2);
          cb({ value: 'الجنس' }, 3);
          cb({ value: 'الحالة' }, 4);
        }),
      };
      const mockDataRow = {
        hasValues: true,
        getCell: jest.fn((index) => {
          if (index === 2) return { value: 'فاطمة أحمد' };
          if (index === 3) return mockGenderCell;
          if (index === 4) return mockStatusCell;
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
      generateMatricule.mockResolvedValue('S-000002');

      const result = await importExcelData('/path/to/data.xlsx', ['الطلاب']);

      expect(runQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO students'),
        expect.arrayContaining(['فاطمة أحمد', 'Female', 'active', 'S-000002']),
      );
      expect(result.successCount).toBe(1);
    });
  });
});
