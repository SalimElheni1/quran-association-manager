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

jest.mock('../src/main/matriculeService', () => ({
  generateMatricule: jest.fn(),
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

    // Check sheet with not enough columns to be a header
    expect(analysis.sheets['طلاب جدد'].status).toBe('unrecognized');
    expect(analysis.sheets['طلاب جدد'].errorMessage).toContain('تعذر العثور على صف الرأس');
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

describe('Import Manager: Header Detection', () => {
  const tempExcelPath = path.join(__dirname, 'temp-header-test.xlsx');

  afterEach(() => {
    if (fs.existsSync(tempExcelPath)) {
      fs.unlinkSync(tempExcelPath);
    }
  });

  it('should find the header in row 1 if no title is present', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('الطلاب');
    sheet.addRow(['الاسم واللقب', 'الجنس']); // Header on row 1
    sheet.addRow(['Student A', 'Male']);
    await workbook.xlsx.writeFile(tempExcelPath);

    const analysis = await analyzeImportFile(tempExcelPath);
    expect(analysis.sheets['الطلاب'].status).toBe('recognized');
    expect(analysis.sheets['الطلاب'].headerRowIndex).toBe(1);
    expect(analysis.sheets['الطلاب'].dataStartRowIndex).toBe(2);
  });

  it('should find the header in row 2 if a title is present', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Students');
    sheet.addRow(['Student Records']); // Title on row 1
    sheet.addRow(['Full Name', 'Gender']); // Header on row 2
    sheet.addRow(['Student B', 'Female']);
    await workbook.xlsx.writeFile(tempExcelPath);

    const analysis = await analyzeImportFile(tempExcelPath);
    expect(analysis.sheets['Students'].status).toBe('recognized');
    expect(analysis.sheets['Students'].headerRowIndex).toBe(2);
    expect(analysis.sheets['Students'].dataStartRowIndex).toBe(3);
  });

  it('should fail if no suitable header row is found in the first 5 rows', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Teachers');
    sheet.addRow(['Row 1']);
    sheet.addRow(['Row 2']);
    sheet.addRow(['Row 3']);
    sheet.addRow(['Row 4']);
    sheet.addRow(['Row 5']);
    sheet.addRow(['Row 6']);
    sheet.addRow(['Name', 'Contact Info']); // Header is on row 7, too late
    await workbook.xlsx.writeFile(tempExcelPath);

    const analysis = await analyzeImportFile(tempExcelPath);
    expect(analysis.sheets['Teachers'].status).toBe('unrecognized');
    expect(analysis.sheets['Teachers'].errorMessage).toContain('تعذر العثور على صف الرأس');
  });
});

const { processImport } = require('../src/main/importManager');
const db = require('../src/db/db');
const { generateMatricule } = require('../src/main/matriculeService');

describe('Import Manager: processImport', () => {
  const tempExcelPath = path.join(__dirname, 'temp-process-import-test.xlsx');

  beforeEach(() => {
    db.getQuery.mockReset();
    db.runQuery.mockReset();
    generateMatricule.mockReset();
  });

  afterEach(() => {
    if (fs.existsSync(tempExcelPath)) {
      fs.unlinkSync(tempExcelPath);
    }
  });

  it('should not throw an error when processing a file with trailing empty rows', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('الطلاب');
    sheet.addRow(['الاسم واللقب', 'الجنس']);
    sheet.addRow(['Student 1', 'Male']);
    sheet.addRow(['Student 2', 'Female']);
    // Add some empty rows that might cause issues
    sheet.addRow([]);
    sheet.addRow([]);
    sheet.addRow(['', '', '']); // A row with empty cells

    await workbook.xlsx.writeFile(tempExcelPath);

    db.getQuery.mockResolvedValue(null); // No existing students
    db.runQuery.mockResolvedValue({ changes: 1 }); // Successful insert/update
    generateMatricule.mockResolvedValue('MOCK-MATRICULE');

    const confirmedMappings = {
      'الطلاب': {
        type: 'students',
        mapping: {
          name: 1,
          gender: 2,
        },
        dataStartRowIndex: 2,
      },
    };

    const results = await processImport(tempExcelPath, confirmedMappings);

    // Expect that only the valid rows were processed and no errors were thrown
    expect(results.successCount).toBe(2);
    expect(results.errorCount).toBe(0);
    expect(results.errors).toHaveLength(0);
  });
});
