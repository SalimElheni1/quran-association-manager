const fs = require('fs');
const path = require('path');
const os = require('os');
const ExcelJS = require('exceljs');
const {
  importExcelData,
} = require('../src/main/importManager');
const {
  initializeTestDatabase,
  dbClose,
  allQuery,
  dbExec,
} = require('../src/db/db');
const { generateMatricule } = require('../src/main/matriculeService');

// Helper function to create a mock Excel file for testing
async function createMockExcelFile(sheets, filePath) {
  const workbook = new ExcelJS.Workbook();
  for (const sheetName in sheets) {
    const worksheet = workbook.addWorksheet(sheetName);
    worksheet.addRows(sheets[sheetName]);
  }
  await workbook.xlsx.writeFile(filePath);
}

jest.mock('../src/main/matriculeService');

describe('Simple Excel Import', () => {
  let db;
  const testDbPath = path.join(os.tmpdir(), `test-db-simple-import-${Date.now()}.sqlite`);
  const mockExcelPath = path.join(os.tmpdir(), `mock-excel-simple-${Date.now()}.xlsx`);

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

  beforeEach(async () => {
    // Clear all tables before each test
    await dbExec(db, 'DELETE FROM students;');
    generateMatricule.mockClear();
  });

  it('should import a single student', async () => {
    const sheets = {
      'الطلاب': [
        [],
        ['الاسم واللقب'],
        ['John Doe'],
      ],
    };
    await createMockExcelFile(sheets, mockExcelPath);

    generateMatricule.mockResolvedValue('S001');

    const results = await importExcelData(mockExcelPath, ['الطلاب']);

    expect(results.successCount).toBe(1);
    expect(results.errorCount).toBe(0);

    const students = await allQuery('SELECT * FROM students');
    expect(students).toHaveLength(1);
    expect(students[0].name).toBe('John Doe');
    expect(students[0].matricule).toBe('S001');
  });
});