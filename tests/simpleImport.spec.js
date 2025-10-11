// tests/simpleImport.spec.js

// Mock dependencies
jest.mock('exceljs');
jest.mock('../src/main/logger');
jest.mock('../src/db/db');
jest.mock('../src/main/services/matriculeService');


const ExcelJS = require('exceljs');
const { runQuery, getQuery } = require('../src/db/db');
const { generateMatricule } = require('../src/main/services/matriculeService');
const { importExcelData } = require('../src/main/importManager');


describe('Simple Excel Import', () => {
  let mockWorkbook, mockWorksheet, mockHeaderRow, mockDataRow;

  beforeEach(() => {
    jest.clearAllMocks();

    mockHeaderRow = {
      hasValues: true,
      eachCell: jest.fn((callback) => {
        callback({ value: 'الاسم واللقب' }, 1);
        callback({ value: 'الجنس' }, 2);
      }),
    };
    const mockGenderCell = { value: 'ذكر' };
    mockDataRow = {
      hasValues: true,
      getCell: jest.fn(index => {
        if (index === 1) return { value: 'أحمد محمد' };
        if (index === 2) return mockGenderCell;
        return { value: null };
      }),
    };
    mockWorksheet = {
      getRow: jest.fn(rowNum => (rowNum === 2 ? mockHeaderRow : mockDataRow)),
      rowCount: 3,
    };
    mockWorkbook = {
      xlsx: { readFile: jest.fn().mockResolvedValue() },
      getWorksheet: jest.fn(() => mockWorksheet),
    };
    ExcelJS.Workbook.mockImplementation(() => mockWorkbook);
  });

  it('should import a single student', async () => {
    getQuery.mockResolvedValue(null);
    generateMatricule.mockResolvedValue('S-000001');

    await importExcelData('/path/to/data.xlsx', ['الطلاب']);

    expect(runQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO students'),
      expect.arrayContaining(['أحمد محمد', 'Male', 'S-000001'])
    );
  });
});
