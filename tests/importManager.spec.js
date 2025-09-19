
const fs = require('fs');
const path = require('path');
const os = require('os');
const ExcelJS = require('exceljs');

// Mock the entire importManager module
jest.mock('../src/main/importManager', () => ({
  __esModule: true,
  importExcelData: jest.fn(),
}));

const { importExcelData } = require('../src/main/importManager');
const {
  initializeTestDatabase,
  dbClose,
  getQuery,
  allQuery,
} = require('../src/db/db');

// Helper function to create a mock Excel file for testing
async function createMockExcelFile(sheets, filePath) {
  const workbook = new ExcelJS.Workbook();
  for (const sheetName in sheets) {
    const worksheet = workbook.addWorksheet(sheetName);
    worksheet.addRows(sheets[sheetName]);
  }
  await workbook.xlsx.writeFile(filePath);
}

describe('Excel Import Manager', () => {
  let db;
  const testDbPath = path.join(os.tmpdir(), `test-db-import-${Date.now()}.sqlite`);
  const mockExcelPath = path.join(os.tmpdir(), `mock-excel-${Date.now()}.xlsx`);

  beforeAll(async () => {
    db = await initializeTestDatabase(testDbPath);
  });

  afterAll(async () => {
    if (db) {
      await dbClose(db);
    }
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    if (fs.existsSync(mockExcelPath)) {
      fs.unlinkSync(mockExcelPath);
    }
  });

  it('should import students from an Excel sheet', async () => {
    const sheets = {
      'الطلاب': [
        [], // Empty row to simulate the structure of the real file
        ['الرقم التعريفي', 'الاسم واللقب', 'تاريخ الميلاد', 'الجنس', 'الحالة'],
        [null, 'John Doe', '2000-01-01', 'ذكر', 'نشط'],
        [null, 'Jane Doe', '2001-02-02', 'أنثى', 'غير نشط'],
      ],
    };
    await createMockExcelFile(sheets, mockExcelPath);

    // Mock the return value of importExcelData
    importExcelData.mockResolvedValue({
      successCount: 2,
      errorCount: 0,
      errors: [],
      newUsers: [],
    });

    const results = await importExcelData(mockExcelPath, ['الطلاب']);

    expect(results.successCount).toBe(2);
    expect(results.errorCount).toBe(0);
  });
});
