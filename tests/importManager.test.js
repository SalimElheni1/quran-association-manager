const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const { analyzeImportFile } = require('../src/main/importManager');

// Mock the logger to prevent console output during tests
jest.mock('../src/main/logger', () => ({
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));

// Mock db functions since they are not relevant for this test
jest.mock('../src/db/db', () => ({
  getQuery: jest.fn(),
  runQuery: jest.fn(),
}));


describe('Import Manager: analyzeImportFile', () => {
  const tempExcelPath = path.join(__dirname, 'temp-import-test.xlsx');

  afterEach(() => {
    // Clean up the temporary file
    if (fs.existsSync(tempExcelPath)) {
      fs.unlinkSync(tempExcelPath);
    }
  });

  it('should not crash when a header row contains empty cells', async () => {
    // This test is expected to FAIL before the bug fix and PASS after.
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('الطلاب'); // "Students" sheet

    // Add a title row (row 1), which is ignored by the importer
    sheet.addRow(['Title']);

    // This is the header row (row 2). We set cells explicitly to ensure
    // correct column numbers, leaving A2 empty.
    sheet.getCell('B2').value = 'الاسم واللقب';
    sheet.getCell('C2').value = 'تاريخ الميلاد';

    // Add some data rows
    sheet.addRow(['', 'Student 1', '2000-01-01']);
    sheet.addRow(['', 'Student 2', '2001-02-02']);

    await workbook.xlsx.writeFile(tempExcelPath);

    // Call the function under test. Without the fix, this throws a TypeError.
    // With the fix, it should resolve without throwing.
    await expect(analyzeImportFile(tempExcelPath)).resolves.not.toThrow();
  });

  it('should correctly map headers even with empty cells present', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('الطلاب'); // "Students" sheet
    sheet.addRow(['Title']);
    // Set cells explicitly to ensure correct column numbers
    sheet.getCell('B2').value = 'الاسم واللقب';
    sheet.getCell('C2').value = 'تاريخ الميلاد';
    sheet.addRow(['', 'Student 1', '2000-01-01']);
    await workbook.xlsx.writeFile(tempExcelPath);

    const analysis = await analyzeImportFile(tempExcelPath);

    expect(analysis.sheets['الطلاب']).toBeDefined();
    expect(analysis.sheets['الطلاب'].warnings).toHaveLength(0);
    expect(analysis.sheets['الطلاب'].suggestedMapping).toEqual({
      name: 2, // 'الاسم واللقب' is at index 2
      date_of_birth: 3, // 'تاريخ الميلاد' is at index 3
    });
  });
});
