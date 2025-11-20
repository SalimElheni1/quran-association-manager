// tests/importManager.extended.spec.js

// Mock all dependencies at the top level
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    unlink: jest.fn().mockResolvedValue(),
  },
  existsSync: jest.fn(),
}));
jest.mock('pizzip');
jest.mock('electron', () => ({
  app: {
    relaunch: jest.fn(),
    quit: jest.fn(),
  },
}));
jest.mock('electron-store');
jest.mock('exceljs');
jest.mock('../src/main/logger', () => ({
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
}));
jest.mock('../src/db/db');
jest.mock('bcryptjs');
jest.mock('../src/main/services/matriculeService');
jest.mock('../src/main/keyManager');
jest.mock(
  '../src/main/services/voucherService',
  () => ({
    generateVoucherNumber: jest.fn().mockResolvedValue('V-2024-001'),
  }),
  { virtual: true },
);

const fs = require('fs').promises;
const fsSync = require('fs');
const PizZip = require('pizzip');
const { app } = require('electron');
const ExcelJS = require('exceljs');
const bcrypt = require('bcryptjs');

const {
  getDatabasePath,
  isDbOpen,
  initializeDatabase,
  getDb,
  dbExec,
  runQuery,
  getQuery,
  allQuery,
} = require('../src/db/db');

const { generateMatricule } = require('../src/main/services/matriculeService');
const {
  validateDatabaseFile,
  replaceDatabase,
  importExcelData,
} = require('../src/main/importManager');

describe('importManager - Extended Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateDatabaseFile', () => {
    it('should return invalid if backup.sql is missing', async () => {
      const mockConfigFile = { asNodeBuffer: () => Buffer.from('{"db-salt": "test-salt"}') };
      const mockZip = {
        file: jest.fn((name) => (name === 'salt.json' ? mockConfigFile : null)),
      };
      fs.readFile.mockResolvedValue(Buffer.from('zip content'));
      PizZip.mockImplementation(() => mockZip);

      const result = await validateDatabaseFile('bad.zip');
      expect(result.isValid).toBe(false);
      expect(result.message).toContain('غير صالح أو تالف');
    });

    it('should return invalid if salt.json/config.json is missing', async () => {
      const mockSqlFile = { asText: () => 'SELECT 1;' };
      const mockZip = {
        file: jest.fn((name) => (name === 'backup.sql' ? mockSqlFile : null)),
      };
      fs.readFile.mockResolvedValue(Buffer.from('zip content'));
      PizZip.mockImplementation(() => mockZip);

      const result = await validateDatabaseFile('bad.zip');
      expect(result.isValid).toBe(false);
      expect(result.message).toContain('غير صالح أو تالف');
    });

    it('should handle read errors gracefully', async () => {
      fs.readFile.mockRejectedValue(new Error('File not found'));
      const result = await validateDatabaseFile('nonexistent.zip');
      expect(result.isValid).toBe(false);
      expect(result.message).toContain('File not found');
    });

    it('should return valid for a correct legacy backup file (config.json)', async () => {
      const mockSqlFile = { asText: () => 'SELECT 1;' };
      const mockConfigFile = { asNodeBuffer: () => Buffer.from('{"db-salt": "test-salt"}') };
      const mockZip = {
        file: jest.fn((name) => {
          if (name === 'backup.sql') return mockSqlFile;
          if (name === 'config.json') return mockConfigFile;
          return null; // salt.json is not found
        }),
      };
      fs.readFile.mockResolvedValue(Buffer.from('zip content'));
      PizZip.mockImplementation(() => mockZip);

      const result = await validateDatabaseFile('legacy.zip');
      expect(result.isValid).toBe(true);
    });
  });

  describe('replaceDatabase', () => {
    beforeEach(() => {
      getDatabasePath.mockReturnValue('/fake/db/path.sqlite');
      isDbOpen.mockReturnValue(true);
      fsSync.existsSync.mockReturnValue(true);
      app.relaunch.mockClear();
      app.quit.mockClear();
      // Explicitly reset fs.unlink before each test in this describe block
      fs.unlink.mockResolvedValue();
    });

    it('should fail if backup file is invalid', async () => {
      const mockZip = { file: () => null }; // Missing files
      fs.readFile.mockResolvedValue(Buffer.from('zip content'));
      PizZip.mockImplementation(() => mockZip);

      const result = await replaceDatabase('bad.zip', 'pw');
      expect(result.success).toBe(false);
      expect(result.message).toContain('Could not find required files');
      expect(app.relaunch).not.toHaveBeenCalled();
    });

    it('should fail if salt is missing from config', async () => {
      const mockSqlFile = { asText: () => 'SELECT 1;' };
      const mockConfigFile = { asNodeBuffer: () => Buffer.from('{}') }; // No db-salt
      const mockZip = {
        file: jest.fn((name) => (name === 'backup.sql' ? mockSqlFile : mockConfigFile)),
      };
      fs.readFile.mockResolvedValue(Buffer.from('zip content'));
      PizZip.mockImplementation(() => mockZip);

      const result = await replaceDatabase('bad.zip', 'pw');
      expect(result.success).toBe(false);
      expect(result.message).toContain('missing the required salt');
    });

    it('should fail gracefully if unlinking the old db fails', async () => {
      const mockSqlFile = { asText: () => 'SELECT 1;' };
      const mockConfigFile = { asNodeBuffer: () => Buffer.from('{"db-salt": "test-salt"}') };
      const mockZip = {
        file: jest.fn((name) => (name === 'backup.sql' ? mockSqlFile : mockConfigFile)),
      };
      fs.readFile.mockResolvedValue(Buffer.from('zip content'));
      PizZip.mockImplementation(() => mockZip);
      // Use mockImplementationOnce to prevent mock leaking to other tests
      fs.unlink.mockImplementationOnce(() => Promise.reject(new Error('Permission denied')));

      const result = await replaceDatabase('good.zip', 'pw');
      expect(result.success).toBe(false);
      expect(result.message).toContain('Permission denied');
    });

    it.skip('should safely execute SQL, skipping statements for non-existent tables', async () => {
      const mockSqlFile = {
        asText: () => `
            REPLACE INTO "students" (id, name) VALUES (1, 'Ali');
            REPLACE INTO "non_existent_table" (id, data) VALUES (1, 'test');
            REPLACE INTO "teachers" (id, name) VALUES (1, 'Fatima');
        `,
      };
      const mockConfigFile = { asNodeBuffer: () => Buffer.from('{"db-salt": "new-salt"}') };
      const mockZip = {
        file: jest.fn((name) => (name === 'backup.sql' ? mockSqlFile : mockConfigFile)),
      };
      fs.readFile.mockResolvedValue(Buffer.from('zip content'));
      PizZip.mockImplementation(() => mockZip);
      // Ensure allQuery is configured for this test
      allQuery.mockResolvedValue([{ name: 'students' }, { name: 'teachers' }]);
      getDb.mockReturnValue({}); // Mock db object for dbExec call
      initializeDatabase.mockResolvedValue(); // Ensure this resolves

      await replaceDatabase('good.zip', 'pw');

      expect(dbExec).toHaveBeenCalled();
      const executedSql = dbExec.mock.calls[0][1];
      expect(executedSql).toContain('REPLACE INTO "students"');
      expect(executedSql).toContain('REPLACE INTO "teachers"');
      expect(executedSql).not.toContain('non_existent_table');
      expect(app.relaunch).toHaveBeenCalled();
    });
  });

  describe('importExcelData - Generic Logic', () => {
    let mockWorkbook;

    beforeEach(() => {
      // Reset mocks for db and exceljs before each test
      getQuery.mockReset();
      runQuery.mockReset();
      allQuery.mockReset();

      // Basic Excel mock setup
      const mockWorksheet = {
        name: 'Sheet1',
        getRow: jest.fn().mockReturnValue({ hasValues: false }),
        rowCount: 0,
      };
      mockWorkbook = {
        xlsx: {
          readFile: jest.fn().mockResolvedValue(),
        },
        worksheets: [mockWorksheet],
        getWorksheet: jest.fn().mockReturnValue(mockWorksheet),
      };
      ExcelJS.Workbook.mockImplementation(() => mockWorkbook);
    });

    it('should return an error if the Excel file cannot be read', async () => {
      mockWorkbook.xlsx.readFile.mockRejectedValue(new Error('File not found'));
      await expect(importExcelData('nonexistent.xlsx', ['الطلاب'])).rejects.toThrow(
        'File not found',
      );
    });

    it('should warn and skip a sheet that is selected but not found', async () => {
      mockWorkbook.getWorksheet.mockReturnValue(undefined); // Simulate sheet not found
      const results = await importExcelData('file.xlsx', ['الطلاب']);
      expect(results.successCount).toBe(0);
      expect(results.errorCount).toBe(0);
      // We can't directly test the log, but we ensure no errors occurred
    });

    it('should report an error if a required header is missing', async () => {
      const mockHeaderRow = {
        hasValues: true,
        eachCell: jest.fn((cb) => {
          cb({ value: 'Some Other Column' }, 1); // Missing 'الاسم واللقب'
        }),
      };
      const mockWorksheet = {
        getRow: jest.fn().mockReturnValue(mockHeaderRow),
        rowCount: 3, // Header + 1 data row
      };
      mockWorkbook.getWorksheet.mockReturnValue(mockWorksheet);

      const results = await importExcelData('file.xlsx', ['الطلاب']);

      expect(results.errorCount).toBe(1);
      expect(results.errors[0]).toContain('ينقصها الأعمدة المطلوبة');
      expect(results.errors[0]).toContain('الاسم واللقب');
    });
  });

  describe('processStudentRow', () => {
    let mockHeaderRow;

    // A helper function to create a mock row with stateful cells
    const createMockRow = (data) => {
      const cells = {}; // Store cell objects to maintain state
      return {
        hasValues: true,
        getCell: jest.fn((index) => {
          const columnName = mockHeaderRow.columns[index - 1];
          if (!cells[index]) {
            cells[index] = { value: data[columnName] };
          }
          return cells[index];
        }),
      };
    };

    beforeEach(() => {
      getQuery.mockReset();
      runQuery.mockReset();
      generateMatricule.mockReset();

      // Define a mock header row for students
      const columns = ['الرقم التعريفي', 'الاسم واللقب', 'الجنس', 'الحالة'];
      mockHeaderRow = {
        columns,
        hasValues: true,
        eachCell: jest.fn((cb) => {
          columns.forEach((col, i) => cb({ value: col }, i + 1));
        }),
      };
    });

    it('should create a new student successfully', async () => {
      const rowData = { 'الاسم واللقب': 'New Student', الجنس: 'ذكر' };
      const mockRow = createMockRow(rowData);

      // Mock that the student does not exist
      getQuery.mockResolvedValue(null);
      generateMatricule.mockResolvedValue('S-2024-001');

      // The function is now directly exported in the test environment
      const { processStudentRow } = require('../src/main/importManager');
      const result = await processStudentRow(mockRow, mockHeaderRow);

      expect(result.success).toBe(true);
      expect(runQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO students'),
        expect.arrayContaining(['New Student', 'Male', 'S-2024-001']),
      );
    });

    it('should update an existing student successfully', async () => {
      const rowData = {
        'الرقم التعريفي': 'S-EXISTING',
        'الاسم واللقب': 'Updated Name',
        الحالة: 'غير نشط',
      };
      const mockRow = createMockRow(rowData);

      // Mock that the student exists
      getQuery.mockResolvedValue({ id: 1 });

      const { processStudentRow } = require('../src/main/importManager');
      const result = await processStudentRow(mockRow, mockHeaderRow);

      expect(result.success).toBe(true);
      expect(runQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE students SET'),
        expect.arrayContaining(['Updated Name', 'inactive', 'S-EXISTING']),
      );
    });

    it('should return an error if name is missing', async () => {
      const rowData = { 'الاسم واللقب': null };
      const mockRow = createMockRow(rowData);

      const { processStudentRow } = require('../src/main/importManager');
      const result = await processStudentRow(mockRow, mockHeaderRow);

      expect(result.success).toBe(false);
      expect(result.message).toContain('اسم الطالب مطلوب');
    });

    it('should return an error when updating a non-existent student', async () => {
      const rowData = { 'الرقم التعريفي': 'S-NON-EXISTENT', 'الاسم واللقب': 'Ghost' };
      const mockRow = createMockRow(rowData);

      // Mock that the student does not exist
      getQuery.mockResolvedValue(null);

      const { processStudentRow } = require('../src/main/importManager');
      const result = await processStudentRow(mockRow, mockHeaderRow);

      expect(result.success).toBe(false);
      expect(result.message).toContain('غير موجود');
    });
  });

  describe('processTeacherRow', () => {
    let mockHeaderRow;

    // Using the same stateful mock row creator
    const createMockRow = (data) => {
      const cells = {};
      return {
        hasValues: true,
        getCell: jest.fn((index) => {
          const columnName = mockHeaderRow.columns[index - 1];
          if (!cells[index]) {
            cells[index] = { value: data[columnName] };
          }
          return cells[index];
        }),
      };
    };

    beforeEach(() => {
      getQuery.mockReset();
      runQuery.mockReset();
      generateMatricule.mockReset();

      const columns = ['الرقم التعريفي', 'الاسم واللقب', 'الجنس', 'رقم الهوية'];
      mockHeaderRow = {
        columns,
        hasValues: true,
        eachCell: jest.fn((cb) => {
          columns.forEach((col, i) => cb({ value: col }, i + 1));
        }),
      };
    });

    it('should create a new teacher successfully', async () => {
      const rowData = { 'الاسم واللقب': 'New Teacher', الجنس: 'أنثى', 'رقم الهوية': 'T123' };
      const mockRow = createMockRow(rowData);

      getQuery.mockResolvedValue(null);
      generateMatricule.mockResolvedValue('T-2024-001');
      const { processTeacherRow } = require('../src/main/importManager');
      const result = await processTeacherRow(mockRow, mockHeaderRow);

      expect(result.success).toBe(true);
      expect(runQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO teachers'),
        expect.arrayContaining(['New Teacher', 'Female', 'T-2024-001']),
      );
    });

    it('should return an error if a teacher with the same national_id already exists', async () => {
      const rowData = { 'الاسم واللقب': 'New Teacher', 'رقم الهوية': 'T123-DUPLICATE' };
      const mockRow = createMockRow(rowData);

      // Mock that a teacher with this national_id exists
      getQuery.mockResolvedValue({ id: 2 });
      const { processTeacherRow } = require('../src/main/importManager');
      const result = await processTeacherRow(mockRow, mockHeaderRow);

      expect(result.success).toBe(false);
      expect(result.message).toContain('موجود بالفعل');
    });
  });

  describe('processUserRow', () => {
    let mockHeaderRow;

    const createMockRow = (data) => {
      const cells = {};
      return {
        hasValues: true,
        getCell: jest.fn((index) => {
          const columnName = mockHeaderRow.columns[index - 1];
          if (!cells[index]) {
            cells[index] = { value: data[columnName] };
          }
          return cells[index];
        }),
      };
    };

    beforeEach(() => {
      getQuery.mockReset();
      runQuery.mockReset();
      generateMatricule.mockReset();
      bcrypt.hashSync.mockReset();

      const columns = ['اسم المستخدم', 'الاسم الأول', 'اللقب', 'الدور', 'نوع التوظيف'];
      mockHeaderRow = {
        columns,
        hasValues: true,
        eachCell: jest.fn((cb) => {
          columns.forEach((col, i) => cb({ value: col }, i + 1));
        }),
      };
    });

    it('should create a new user successfully', async () => {
      const rowData = {
        'اسم المستخدم': 'new.user',
        'الاسم الأول': 'New',
        اللقب: 'User',
        الدور: 'Administrator',
        'نوع التوظيف': 'Full-time',
      };
      const mockRow = createMockRow(rowData);

      // Mock user doesn't exist, role exists
      getQuery.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 1 });
      generateMatricule.mockResolvedValue('U-2024-001');
      bcrypt.hashSync.mockReturnValue('hashed_password');
      runQuery.mockResolvedValue({ id: 100 }); // Mock user insertion result

      const { processUserRow } = require('../src/main/importManager');
      const result = await processUserRow(mockRow, mockHeaderRow);

      expect(result.success).toBe(true);
      expect(result.newUser.username).toBe('new.user');
      expect(bcrypt.hashSync).toHaveBeenCalled();
      // Check that user and role were inserted
      expect(runQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO users'),
        expect.any(Array),
      );
      expect(runQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO user_roles'),
        [100, 1],
      );
      // Check for transaction commits
      expect(runQuery).toHaveBeenCalledWith('BEGIN TRANSACTION');
      expect(runQuery).toHaveBeenCalledWith('COMMIT');
    });

    it('should return error if required fields are missing', async () => {
      const rowData = { 'اسم المستخدم': 'new.user', 'الاسم الأول': null }; // Missing first name
      const mockRow = createMockRow(rowData);

      const { processUserRow } = require('../src/main/importManager');
      const result = await processUserRow(mockRow, mockHeaderRow);

      expect(result.success).toBe(false);
      expect(result.message).toContain('هي حقول مطلوبة');
    });

    it('should rollback transaction if role assignment fails', async () => {
      const rowData = {
        'اسم المستخدم': 'fail.user',
        'الاسم الأول': 'Fail',
        اللقب: 'User',
        الدور: 'NonExistentRole',
        'نوع التوظيف': 'Part-time',
      };
      const mockRow = createMockRow(rowData);

      // Mock user doesn't exist, but role also doesn't exist
      getQuery.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      generateMatricule.mockResolvedValue('U-2024-002');
      runQuery.mockResolvedValue({ id: 101 });

      const { processUserRow } = require('../src/main/importManager');

      // We expect the whole operation to fail and throw an error
      await expect(processUserRow(mockRow, mockHeaderRow)).rejects.toThrow(
        'Role "NonExistentRole" not found.',
      );

      // Verify that the transaction was started and rolled back, but not committed.
      expect(runQuery).toHaveBeenCalledWith('BEGIN TRANSACTION');
      expect(runQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO users'),
        expect.any(Array),
      );
      expect(runQuery).not.toHaveBeenCalledWith('COMMIT');
      expect(runQuery).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('processClassRow', () => {
    let mockHeaderRow;

    const createMockRow = (data) => {
      const cells = {};
      return {
        hasValues: true,
        getCell: jest.fn((index) => {
          const columnName = mockHeaderRow.columns[index - 1];
          if (!cells[index]) {
            cells[index] = { value: data[columnName] };
          }
          return cells[index];
        }),
      };
    };

    beforeEach(() => {
      getQuery.mockReset();
      runQuery.mockReset();
      const columns = ['اسم الفصل', 'معرف المعلم'];
      mockHeaderRow = {
        columns,
        hasValues: true,
        eachCell: jest.fn((cb) => {
          columns.forEach((col, i) => cb({ value: col }, i + 1));
        }),
      };
    });

    it('should create a class successfully', async () => {
      const rowData = { 'اسم الفصل': 'New Class', 'معرف المعلم': 'T-VALID' };
      const mockRow = createMockRow(rowData);

      // Mock that teacher exists
      getQuery.mockResolvedValue({ id: 5 });
      const { processClassRow } = require('../src/main/importManager');
      const result = await processClassRow(mockRow, mockHeaderRow);

      expect(result.success).toBe(true);
      expect(runQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO classes'),
        expect.arrayContaining(['New Class', 5]),
      );
    });

    it('should return an error if teacher is not found', async () => {
      const rowData = { 'اسم الفصل': 'Bad Class', 'معرف المعلم': 'T-INVALID' };
      const mockRow = createMockRow(rowData);

      // Mock that teacher does not exist
      getQuery.mockResolvedValue(null);
      const { processClassRow } = require('../src/main/importManager');
      const result = await processClassRow(mockRow, mockHeaderRow);

      expect(result.success).toBe(false);
      expect(result.message).toContain('لم يتم العثور على معلم');
    });
  });

  describe('processAttendanceRow', () => {
    let mockHeaderRow;

    const createMockRow = (data) => {
      const cells = {};
      return {
        hasValues: true,
        getCell: jest.fn((index) => {
          const columnName = mockHeaderRow.columns[index - 1];
          if (!cells[index]) {
            cells[index] = { value: data[columnName] };
          }
          return cells[index];
        }),
      };
    };

    beforeEach(() => {
      getQuery.mockReset();
      runQuery.mockReset();
      const columns = ['الرقم التعريفي للطالب', 'اسم الفصل', 'التاريخ', 'الحالة'];
      mockHeaderRow = {
        columns,
        hasValues: true,
        eachCell: jest.fn((cb) => {
          columns.forEach((col, i) => cb({ value: col }, i + 1));
        }),
      };
    });

    it('should create an attendance record successfully', async () => {
      const rowData = {
        'الرقم التعريفي للطالب': 'S-VALID',
        'اسم الفصل': 'Class A',
        التاريخ: '2024-01-01',
        الحالة: 'حاضر',
      };
      const mockRow = createMockRow(rowData);

      // Mock student and class exist
      getQuery.mockResolvedValueOnce({ id: 1 }).mockResolvedValueOnce({ id: 1 });
      const { processAttendanceRow } = require('../src/main/importManager');
      const result = await processAttendanceRow(mockRow, mockHeaderRow);

      expect(result.success).toBe(true);
      expect(runQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO attendance'),
        expect.arrayContaining([1, 1, '2024-01-01', 'present']),
      );
    });

    it('should return an error if the student is not found', async () => {
      const rowData = {
        'الرقم التعريفي للطالب': 'S-INVALID',
        'اسم الفصل': 'Class A',
        التاريخ: '2024-01-01',
        الحالة: 'حاضر',
      };
      const mockRow = createMockRow(rowData);

      // Mock student not found
      getQuery.mockResolvedValue(null);
      const { processAttendanceRow } = require('../src/main/importManager');
      const result = await processAttendanceRow(mockRow, mockHeaderRow);

      expect(result.success).toBe(false);
      expect(result.message).toContain('لم يتم العثور على طالب');
    });

    it('should return an error if the class is not found', async () => {
      const rowData = {
        'الرقم التعريفي للطالب': 'S-VALID',
        'اسم الفصل': 'Invalid Class',
        التاريخ: '2024-01-01',
        الحالة: 'حاضر',
      };
      const mockRow = createMockRow(rowData);

      // Mock student exists, but class does not
      getQuery.mockResolvedValueOnce({ id: 1 }).mockResolvedValueOnce(null);
      const { processAttendanceRow } = require('../src/main/importManager');
      const result = await processAttendanceRow(mockRow, mockHeaderRow);

      expect(result.success).toBe(false);
      expect(result.message).toContain('لم يتم العثور على فصل');
    });
  });

  describe('processTransactionRow', () => {
    let mockHeaderRow;

    const createMockRow = (data) => {
      const cells = {};
      return {
        hasValues: true,
        getCell: jest.fn((index) => {
          const columnName = mockHeaderRow.columns[index - 1];
          if (!cells[index]) {
            cells[index] = { value: data[columnName] };
          }
          return cells[index];
        }),
      };
    };

    beforeEach(() => {
      getQuery.mockReset();
      allQuery.mockReset();
      runQuery.mockReset();

      const columns = ['النوع', 'الفئة', 'المبلغ', 'التاريخ', 'طريقة الدفع', 'الوصف'];
      mockHeaderRow = {
        columns,
        hasValues: true,
        eachCell: jest.fn((cb) => {
          columns.forEach((col, i) => cb({ value: col }, i + 1));
        }),
      };
    });

    it('should create an income transaction successfully', async () => {
      const rowData = {
        النوع: 'مدخول',
        الفئة: 'التبرعات النقدية',
        المبلغ: 100,
        التاريخ: '2024-01-01',
        'طريقة الدفع': 'نقدي',
      };
      const mockRow = createMockRow(rowData);

      // Mock valid categories and last transaction for matricule generation
      allQuery.mockResolvedValue([{ name: 'التبرعات النقدية' }]);
      getQuery.mockResolvedValue(null); // No previous transaction this year

      const { processTransactionRow } = require('../src/main/importManager');
      const result = await processTransactionRow(mockRow, mockHeaderRow);

      expect(result.success).toBe(true);
      expect(runQuery).toHaveBeenCalledWith('BEGIN TRANSACTION;');
      // Check main insertion
      expect(runQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO transactions'),
        expect.arrayContaining(['I-2024-001', 'INCOME', 100]),
      );
      // Check account balance update
      expect(runQuery).toHaveBeenCalledWith(expect.stringContaining('UPDATE accounts'), [100]);
      expect(runQuery).toHaveBeenCalledWith('COMMIT;');
    });

    it('should fail if amount is > 500 and payment method is cash', async () => {
      const rowData = {
        النوع: 'مدخول',
        الفئة: 'التبرعات النقدية',
        المبلغ: 600,
        التاريخ: '2024-01-01',
        'طريقة الدفع': 'نقدي',
      };
      const mockRow = createMockRow(rowData);

      allQuery.mockResolvedValue([{ name: 'التبرعات النقدية' }]);

      const { processTransactionRow } = require('../src/main/importManager');
      const result = await processTransactionRow(mockRow, mockHeaderRow);

      expect(result.success).toBe(false);
      expect(result.message).toContain('المبالغ التي تتجاوز 500 دينار');
    });

    it('should fail if category is invalid for the given type', async () => {
      const rowData = {
        النوع: 'مصروف',
        الفئة: 'التبرعات النقدية',
        المبلغ: 50,
        التاريخ: '2024-01-01',
        'طريقة الدفع': 'نقدي',
      };
      const mockRow = createMockRow(rowData);

      // Mock valid categories for 'EXPENSE', which does not include 'التبرعات النقدية'
      allQuery.mockResolvedValue([{ name: 'كراء وفواتير' }]);

      const { processTransactionRow } = require('../src/main/importManager');
      const result = await processTransactionRow(mockRow, mockHeaderRow);

      expect(result.success).toBe(false);
      expect(result.message).toContain('غير موجودة في قاعدة البيانات');
    });
  });

  describe('processGroupRow', () => {
    let mockHeaderRow;

    const createMockRow = (data) => {
      const cells = {};
      return {
        hasValues: true,
        getCell: jest.fn((index) => {
          const columnName = mockHeaderRow.columns[index - 1];
          if (!cells[index]) {
            cells[index] = { value: data[columnName] };
          }
          return cells[index];
        }),
      };
    };

    beforeEach(() => {
      getQuery.mockReset();
      runQuery.mockReset();
      generateMatricule.mockReset();
      const columns = ['اسم المجموعة', 'الفئة'];
      mockHeaderRow = {
        columns,
        hasValues: true,
        eachCell: jest.fn((cb) => {
          columns.forEach((col, i) => cb({ value: col }, i + 1));
        }),
      };
    });

    it('should create a group successfully', async () => {
      const rowData = { 'اسم المجموعة': 'New Group', الفئة: 'Category A' };
      const mockRow = createMockRow(rowData);

      getQuery.mockResolvedValue(null);
      generateMatricule.mockResolvedValue('G-001');
      const { processGroupRow } = require('../src/main/importManager');
      const result = await processGroupRow(mockRow, mockHeaderRow);

      expect(result.success).toBe(true);
      expect(runQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO groups'),
        expect.arrayContaining(['New Group', 'Category A', 'G-001']),
      );
    });
  });

  describe('processInventoryRow', () => {
    let mockHeaderRow;

    const createMockRow = (data) => {
      const cells = {};
      return {
        hasValues: true,
        getCell: jest.fn((index) => {
          const columnName = mockHeaderRow.columns[index - 1];
          if (!cells[index]) {
            cells[index] = { value: data[columnName] };
          }
          return cells[index];
        }),
      };
    };

    beforeEach(() => {
      getQuery.mockReset();
      runQuery.mockReset();
      generateMatricule.mockReset();
      const columns = ['اسم العنصر', 'الفئة', 'الكمية', 'قيمة الوحدة'];
      mockHeaderRow = {
        columns,
        hasValues: true,
        eachCell: jest.fn((cb) => {
          columns.forEach((col, i) => cb({ value: col }, i + 1));
        }),
      };
    });

    it('should create an inventory item successfully', async () => {
      const rowData = { 'اسم العنصر': 'New Item', الفئة: 'Supplies', الكمية: 10, 'قيمة الوحدة': 5 };
      const mockRow = createMockRow(rowData);

      getQuery.mockResolvedValue(null);
      generateMatricule.mockResolvedValue('INV-001');
      const { processInventoryRow } = require('../src/main/importManager');
      const result = await processInventoryRow(mockRow, mockHeaderRow);

      expect(result.success).toBe(true);
      expect(runQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO inventory_items'),
        // Check for total_value calculation
        expect.arrayContaining(['New Item', 10, 5, 50, 'INV-001']),
      );
    });

    it('should fail if inventory item already exists', async () => {
      const rowData = {
        'اسم العنصر': 'Existing Item',
        الفئة: 'Supplies',
        الكمية: 10,
        'قيمة الوحدة': 5,
      };
      const mockRow = createMockRow(rowData);

      // Mock that the item already exists
      getQuery.mockResolvedValue({ id: 1 });
      const { processInventoryRow } = require('../src/main/importManager');
      const result = await processInventoryRow(mockRow, mockHeaderRow);

      expect(result.success).toBe(false);
      expect(result.message).toContain('موجود بالفعل');
    });
  });
});
