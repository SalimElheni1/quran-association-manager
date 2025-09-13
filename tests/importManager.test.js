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


describe('Import Manager: analyzeImportFile with flexible detection', () => {
  const tempExcelPath = path.join(__dirname, 'temp-import-test.xlsx');

  afterEach(() => {
    if (fs.existsSync(tempExcelPath)) {
      fs.unlinkSync(tempExcelPath);
    }
  });

  it('should handle a mix of recognized, aliased, and unrecognized sheets', async () => {
    const workbook = new ExcelJS.Workbook();
    // 1. Recognized sheet
    const studentSheet = workbook.addWorksheet('الطلاب');
    studentSheet.addRow(['الاسم واللقب', 'تاريخ الميلاد']);
    studentSheet.addRow(['Student 1', '2000-01-01']);

    // 2. Aliased sheet with different case and whitespace
    const teacherSheet = workbook.addWorksheet('  Teachers  ');
    teacherSheet.addRow(['الاسم واللقب', 'رقم الهاتف']);
    teacherSheet.addRow(['Teacher 1', '12345']);

    // 3. Unrecognized sheet
    workbook.addWorksheet('ورقة غير معروفة');

    // 4. Sheet with not enough columns
    const emptySheet = workbook.addWorksheet('طلاب جدد');
    emptySheet.addRow(['Column1']);


    await workbook.xlsx.writeFile(tempExcelPath);
    const analysis = await analyzeImportFile(tempExcelPath);

    // Check recognized sheet
    expect(analysis.sheets['الطلاب'].status).toBe('recognized');
    expect(analysis.sheets['الطلاب'].detectedType).toBe('students');
    expect(analysis.sheets['الطلاب'].suggestedMapping).toEqual({ name: 1, date_of_birth: 2 });

    // Check aliased sheet
    expect(analysis.sheets['  Teachers  '].status).toBe('recognized');
    expect(analysis.sheets['  Teachers  '].detectedType).toBe('teachers');
    expect(analysis.sheets['  Teachers  '].suggestedMapping).toEqual({ name: 1, contact_info: 2 });

    // Check unrecognized sheet
    expect(analysis.sheets['ورقة غير معروفة'].status).toBe('unrecognized');
    expect(analysis.sheets['ورقة غير معروفة'].errorMessage).toContain('لم يتم التعرّف على نوع الورقة');

    // Check empty sheet
    expect(analysis.sheets['طلاب جدد'].status).toBe('unrecognized');
    expect(analysis.sheets['طلاب جدد'].errorMessage).toContain('أقل من عمودين');
  });

  it('should correctly map headers even with empty cells present in the header row', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('الطلاب');
    const headerRow = sheet.getRow(1);
    headerRow.getCell(2).value = 'الاسم واللقب'; // B1
    headerRow.getCell(3).value = 'تاريخ الميلاد'; // C1
    headerRow.commit();
    sheet.addRow(['', 'Student 1', '2000-01-01']);
    await workbook.xlsx.writeFile(tempExcelPath);

    const analysis = await analyzeImportFile(tempExcelPath);

    expect(analysis.sheets['الطلاب']).toBeDefined();
    expect(analysis.sheets['الطلاب'].status).toBe('recognized');
    expect(analysis.sheets['الطلاب'].warnings).toHaveLength(0);
    expect(analysis.sheets['الطلاب'].suggestedMapping).toEqual({
      name: 2, // 'الاسم واللقب' is at index 2 (Column B)
      date_of_birth: 3, // 'تاريخ الميلاد' is at index 3 (Column C)
    });
  });

  it('should generate warnings for missing required columns', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Students');
    sheet.addRow(['تاريخ الميلاد', 'Gender']); // Missing 'Name' which is required
    sheet.addRow(['2000-01-01', 'Male']);
    await workbook.xlsx.writeFile(tempExcelPath);

    const analysis = await analyzeImportFile(tempExcelPath);

    expect(analysis.sheets['Students'].status).toBe('recognized');
    expect(analysis.sheets['Students'].warnings).toHaveLength(1);
    expect(analysis.sheets['Students'].warnings[0]).toContain('لم يتم العثور على العمود المطلوب لـ "الاسم واللقب"');
  });
});
