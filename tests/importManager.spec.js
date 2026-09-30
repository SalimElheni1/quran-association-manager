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

// replaceDatabase is covered in importManager.extended.spec.js.
const fs = require('fs').promises;
const PizZip = require('pizzip');
const ExcelJS = require('exceljs');
const { runQuery, getQuery } = require('../src/db/db');
const { generateMatricule } = require('../src/main/services/matriculeService');
const { validateDatabaseFile, importExcelData } = require('../src/main/importManager');

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
