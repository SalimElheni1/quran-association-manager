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
jest.mock('../src/main/matriculeService');
jest.mock('../src/main/keyManager');

const fs = require('fs').promises;
const fsSync = require('fs');
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

describe('importManager - Comprehensive Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('validateDatabaseFile - Edge Cases', () => {
    it('should handle legacy config.json file', async () => {
      const mockZipContent = Buffer.from('mock zip content');
      const mockSqlFile = { asText: () => 'SELECT * FROM students;' };
      const mockConfigFile = { asNodeBuffer: () => Buffer.from('{"db-salt": "test-salt"}') };
      const mockZip = {
        file: jest.fn((filename) => {
          if (filename === 'backup.sql') return mockSqlFile;
          if (filename === 'salt.json') return null; // salt.json not found
          if (filename === 'config.json') return mockConfigFile; // config.json found
          return null;
        }),
      };

      fs.readFile.mockResolvedValue(mockZipContent);
      PizZip.mockImplementation(() => mockZip);

      const result = await validateDatabaseFile('/path/to/backup.zip');

      expect(mockZip.file).toHaveBeenCalledWith('backup.sql');
      expect(mockZip.file).toHaveBeenCalledWith('salt.json');
      expect(result.isValid).toBe(true);
    });

    it('should handle corrupted zip files', async () => {
      const mockZipContent = Buffer.from('invalid zip content');
      PizZip.mockImplementation(() => {
        throw new Error('Invalid zip format');
      });

      fs.readFile.mockResolvedValue(mockZipContent);

      const result = await validateDatabaseFile('/path/to/corrupted.zip');

      expect(logError).toHaveBeenCalledWith('Error during backup validation:', expect.any(Error));
      expect(result.isValid).toBe(false);
      expect(result.message).toContain('خطأ في قراءة ملف النسخ الاحتياطي');
    });

    it('should handle empty zip files', async () => {
      const mockZipContent = Buffer.from('');
      const mockZip = {
        file: jest.fn().mockReturnValue(null),
      };

      fs.readFile.mockResolvedValue(mockZipContent);
      PizZip.mockImplementation(() => mockZip);

      const result = await validateDatabaseFile('/path/to/empty.zip');

      expect(result.isValid).toBe(false);
      expect(result.message).toBe('ملف النسخ الاحتياطي غير صالح أو تالف.');
    });
  });

  describe('replaceDatabase - Advanced Scenarios', () => {
    it('should handle database replacement when current DB does not exist', async () => {
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
      getDatabasePath.mockReturnValue('/path/to/nonexistent.db');
      isDbOpen.mockReturnValue(false);
      fsSync.existsSync.mockReturnValue(false); // DB doesn't exist
      initializeDatabase.mockResolvedValue();
      getDb.mockReturnValue({});
      dbExec.mockResolvedValue();
      app.relaunch = jest.fn();
      app.quit = jest.fn();

      const result = await replaceDatabase('/path/to/backup.zip', 'password123');

      expect(fs.unlink).not.toHaveBeenCalled(); // No existing DB to delete
      expect(initializeDatabase).toHaveBeenCalledWith('password123');
      expect(result.success).toBe(true);
    });

    it('should handle file deletion retry mechanism', async () => {
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
      isDbOpen.mockReturnValue(false);
      fsSync.existsSync.mockReturnValue(true);
      
      // Mock EBUSY error then success
      fs.unlink.mockRejectedValueOnce({ code: 'EBUSY' })
        .mockResolvedValueOnce();
      
      initializeDatabase.mockResolvedValue();
      getDb.mockReturnValue({});
      dbExec.mockResolvedValue();
      app.relaunch = jest.fn();
      app.quit = jest.fn();

      const result = await replaceDatabase('/path/to/backup.zip', 'password123');

      expect(fs.unlink).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(true);
    });

    it('should handle SQL execution errors', async () => {
      const mockZipContent = Buffer.from('mock zip content');
      const mockSqlFile = { asText: () => 'INVALID SQL;' };
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
      isDbOpen.mockReturnValue(false);
      fsSync.existsSync.mockReturnValue(false);
      initializeDatabase.mockResolvedValue();
      getDb.mockReturnValue({});
      dbExec.mockRejectedValue(new Error('SQL syntax error'));

      const result = await replaceDatabase('/path/to/backup.zip', 'password123');

      expect(logError).toHaveBeenCalledWith(
        'Failed to replace database from package:',
        expect.any(Error)
      );
      expect(result.success).toBe(false);
      expect(result.message).toContain('فشل استيراد قاعدة البيانات');
    });
  });

  describe('importExcelData - Complex Scenarios', () => {
    let mockWorkbook, mockWorksheet, mockHeaderRow, mockDataRow;

    beforeEach(() => {
      mockHeaderRow = {
        hasValues: true,
        eachCell: jest.fn(),
      };

      mockDataRow = {
        hasValues: true,
        getCell: jest.fn(),
      };

      mockWorksheet = {
        getRow: jest.fn(),
        rowCount: 5,
      };

      mockWorkbook = {
        xlsx: {
          readFile: jest.fn(),
        },
        getWorksheet: jest.fn(() => mockWorksheet),
      };

      ExcelJS.Workbook.mockImplementation(() => mockWorkbook);
    });

    describe('Student Import Edge Cases', () => {
      beforeEach(() => {
        mockHeaderRow.eachCell = jest.fn((callback) => {
          callback({ value: 'الرقم التعريفي' }, 1);
          callback({ value: 'الاسم واللقب' }, 2);
          callback({ value: 'الجنس' }, 3);
          callback({ value: 'الحالة' }, 4);
        });

        mockWorksheet.getRow = jest.fn((rowNum) => {
          if (rowNum === 2) return mockHeaderRow;
          if (rowNum >= 3) return mockDataRow;
          return { hasValues: false };
        });
      });

      it('should handle student update with partial data', async () => {
        mockDataRow.getCell = jest.fn((index) => {
          const cells = {
            1: { value: 'S-000001' }, // Existing matricule
            2: { value: 'أحمد محمد المحدث' }, // Updated name
            3: { value: null }, // No gender update
            4: { value: null }, // No status update
          };
          return cells[index] || { value: null };
        });

        getQuery.mockResolvedValue({ id: 1 }); // Existing student
        runQuery.mockResolvedValue();

        const result = await importExcelData('/path/to/data.xlsx', ['الطلاب']);

        expect(runQuery).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE students SET name = ? WHERE matricule = ?'),
          ['أحمد محمد المحدث', 'S-000001']
        );
        expect(result.successCount).toBe(3); // 3 rows processed
      });

      it('should handle student with no data to update', async () => {
        mockDataRow.getCell = jest.fn((index) => {
          const cells = {
            1: { value: 'S-000001' }, // Existing matricule
            2: { value: null }, // No name update
            3: { value: null }, // No gender update
            4: { value: null }, // No status update
          };
          return cells[index] || { value: null };
        });

        getQuery.mockResolvedValue({ id: 1 }); // Existing student

        const result = await importExcelData('/path/to/data.xlsx', ['الطلاب']);

        expect(runQuery).not.toHaveBeenCalledWith(expect.stringContaining('UPDATE'));
        expect(result.successCount).toBe(0); // No updates made
      });

      it('should handle Arabic gender localization', async () => {
        mockDataRow.getCell = jest.fn((index) => {
          const cells = {
            1: { value: null }, // No matricule (new student)
            2: { value: 'فاطمة أحمد' },
            3: { value: 'أنثى' }, // Arabic gender
            4: { value: 'نشط' }, // Arabic status
          };
          return cells[index] || { value: null };
        });

        getQuery.mockResolvedValue(null); // No existing student
        generateMatricule.mockResolvedValue('S-000002');
        runQuery.mockResolvedValue();

        const result = await importExcelData('/path/to/data.xlsx', ['الطلاب']);

        expect(runQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO students'),
          expect.arrayContaining(['فاطمة أحمد', 'أنثى', 'نشط', 'S-000002'])
        );
        expect(result.successCount).toBe(3); // 3 rows processed
      });
    });

    describe('Teacher Import Edge Cases', () => {
      beforeEach(() => {
        mockHeaderRow.eachCell = jest.fn((callback) => {
          callback({ value: 'الرقم التعريفي' }, 1);
          callback({ value: 'الاسم واللقب' }, 2);
          callback({ value: 'الجنس' }, 3);
        });

        mockWorksheet.getRow = jest.fn((rowNum) => {
          if (rowNum === 2) return mockHeaderRow;
          if (rowNum >= 3) return mockDataRow;
          return { hasValues: false };
        });
      });

      it('should handle teacher with Arabic gender', async () => {
        mockDataRow.getCell = jest.fn((index) => {
          const cells = {
            1: { value: null },
            2: { value: 'محمد أحمد' },
            3: { value: 'ذكر' }, // Arabic gender
          };
          return cells[index] || { value: null };
        });

        getQuery.mockResolvedValue(null);
        generateMatricule.mockResolvedValue('T-000001');
        runQuery.mockResolvedValue();

        const result = await importExcelData('/path/to/data.xlsx', ['المعلمون']);

        expect(runQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO teachers'),
          expect.arrayContaining(['محمد أحمد', 'T-000001'])
        );
      });

      it('should handle teacher update with missing matricule', async () => {
        mockDataRow.getCell = jest.fn((index) => {
          const cells = {
            1: { value: 'T-999999' }, // Non-existent matricule
            2: { value: 'معلم جديد' },
          };
          return cells[index] || { value: null };
        });

        getQuery.mockResolvedValue(null); // Teacher not found

        const result = await importExcelData('/path/to/data.xlsx', ['المعلمون']);

        expect(result.errorCount).toBe(3); // 3 errors
        expect(result.errors[0]).toContain('غير موجود');
      });
    });

    describe('User Import Edge Cases', () => {
      beforeEach(() => {
        mockHeaderRow.eachCell = jest.fn((callback) => {
          callback({ value: 'الرقم التعريفي' }, 1);
          callback({ value: 'اسم المستخدم' }, 2);
          callback({ value: 'الاسم الأول' }, 3);
          callback({ value: 'اللقب' }, 4);
          callback({ value: 'الدور' }, 5);
          callback({ value: 'نوع التوظيف' }, 6);
        });

        mockWorksheet.getRow = jest.fn((rowNum) => {
          if (rowNum === 2) return mockHeaderRow;
          if (rowNum >= 3) return mockDataRow;
          return { hasValues: false };
        });
      });

      it('should create new user with generated password', async () => {
        mockDataRow.getCell = jest.fn((index) => {
          const cells = {
            1: { value: null },
            2: { value: 'newuser' },
            3: { value: 'أحمد' },
            4: { value: 'محمد' },
            5: { value: 'Admin' },
            6: { value: 'contract' },
          };
          return cells[index] || { value: null };
        });

        getQuery.mockResolvedValue(null); // No existing user
        generateMatricule.mockResolvedValue('U-000001');
        bcrypt.hashSync = jest.fn().mockReturnValue('hashedpassword');
        runQuery.mockResolvedValue();

        const result = await importExcelData('/path/to/data.xlsx', ['المستخدمون']);

        expect(bcrypt.hashSync).toHaveBeenCalledWith(expect.any(String), 10);
        expect(runQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO users'),
          expect.arrayContaining(['newuser', 'أحمد', 'محمد', 'Admin', 'contract', 'U-000001', 'hashedpassword'])
        );
        expect(result.newUsers).toHaveLength(3); // 3 users created
        expect(result.newUsers[0]).toHaveProperty('username', 'newuser');
        expect(result.newUsers[0]).toHaveProperty('password');
      });

      it('should handle missing required user fields', async () => {
        mockDataRow.getCell = jest.fn((index) => {
          const cells = {
            1: { value: null },
            2: { value: 'incompleteuser' },
            3: { value: null }, // Missing first name
            4: { value: 'محمد' },
            5: { value: 'Admin' },
            6: { value: 'contract' },
          };
          return cells[index] || { value: null };
        });

        const result = await importExcelData('/path/to/data.xlsx', ['المستخدمون']);

        expect(result.errorCount).toBe(3); // 3 errors
        expect(result.errors[0]).toContain('مطلوبة');
      });
    });

    describe('Salary Import Edge Cases', () => {
      beforeEach(() => {
        mockHeaderRow.eachCell = jest.fn((callback) => {
          callback({ value: 'الرقم التعريفي للموظف' }, 1);
          callback({ value: 'المبلغ' }, 2);
          callback({ value: 'تاريخ الدفع' }, 3);
        });

        mockWorksheet.getRow = jest.fn((rowNum) => {
          if (rowNum === 2) return mockHeaderRow;
          if (rowNum >= 3) return mockDataRow;
          return { hasValues: false };
        });
      });

      it('should handle salary for teacher', async () => {
        mockDataRow.getCell = jest.fn((index) => {
          const cells = {
            1: { value: 'T-000001' },
            2: { value: 1500 },
            3: { value: '2024-01-15' },
          };
          return cells[index] || { value: null };
        });

        getQuery.mockResolvedValueOnce(null) // Not found in users
          .mockResolvedValueOnce({ id: 5 }); // Found in teachers
        runQuery.mockResolvedValue();

        const result = await importExcelData('/path/to/data.xlsx', ['الرواتب']);

        expect(runQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO salaries'),
          expect.arrayContaining([5, 'teacher', 1500, '2024-01-15'])
        );
        expect(result.successCount).toBe(1);
      });

      it('should handle salary for user with employment type', async () => {
        mockDataRow.getCell = jest.fn((index) => {
          const cells = {
            1: { value: 'U-000001' },
            2: { value: 2000 },
            3: { value: '2024-01-15' },
          };
          return cells[index] || { value: null };
        });

        getQuery.mockResolvedValueOnce({ id: 3, employment_type: 'contract' }); // Found in users
        runQuery.mockResolvedValue();

        const result = await importExcelData('/path/to/data.xlsx', ['الرواتب']);

        expect(runQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO salaries'),
          expect.arrayContaining([3, 'contract', 2000, '2024-01-15'])
        );
        expect(result.successCount).toBe(1);
      });

      it('should handle salary for non-existent employee', async () => {
        mockDataRow.getCell = jest.fn((index) => {
          const cells = {
            1: { value: 'X-999999' },
            2: { value: 1500 },
            3: { value: '2024-01-15' },
          };
          return cells[index] || { value: null };
        });

        getQuery.mockResolvedValue(null); // Not found anywhere

        const result = await importExcelData('/path/to/data.xlsx', ['الرواتب']);

        expect(result.errorCount).toBe(3); // 3 errors
        expect(result.errors[0]).toContain('لم يتم العثور على موظف أو معلم');
      });
    });

    describe('Donation Import Edge Cases', () => {
      beforeEach(() => {
        mockHeaderRow.eachCell = jest.fn((callback) => {
          callback({ value: 'اسم المتبرع' }, 1);
          callback({ value: 'نوع التبرع' }, 2);
          callback({ value: 'المبلغ' }, 3);
          callback({ value: 'الوصف' }, 4);
          callback({ value: 'تاريخ التبرع' }, 5);
        });

        mockWorksheet.getRow = jest.fn((rowNum) => {
          if (rowNum === 2) return mockHeaderRow;
          if (rowNum >= 3) return mockDataRow;
          return { hasValues: false };
        });
      });

      it('should handle cash donation with Arabic type', async () => {
        mockDataRow.getCell = jest.fn((index) => {
          const cells = {
            1: { value: 'أحمد المتبرع' },
            2: { value: 'نقدي' }, // Arabic type
            3: { value: 1000 },
            4: { value: null },
            5: { value: '2024-01-15' },
          };
          return cells[index] || { value: null };
        });

        runQuery.mockResolvedValue();

        const result = await importExcelData('/path/to/data.xlsx', ['التبرعات']);

        expect(runQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO donations'),
          expect.arrayContaining(['أحمد المتبرع', 'Cash', 1000, '2024-01-15'])
        );
        expect(result.successCount).toBe(3); // 3 rows processed
      });

      it('should handle in-kind donation with Arabic type', async () => {
        mockDataRow.getCell = jest.fn((index) => {
          const cells = {
            1: { value: 'فاطمة المتبرعة' },
            2: { value: 'عيني' }, // Arabic type
            3: { value: null },
            4: { value: '50 مصحف' },
            5: { value: '2024-01-15' },
          };
          return cells[index] || { value: null };
        });

        runQuery.mockResolvedValue();

        const result = await importExcelData('/path/to/data.xlsx', ['التبرعات']);

        expect(runQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO donations'),
          expect.arrayContaining(['فاطمة المتبرعة', 'In-kind', '50 مصحف', '2024-01-15'])
        );
        expect(result.successCount).toBe(3); // 3 rows processed
      });

      it('should validate cash donation requires amount', async () => {
        mockDataRow.getCell = jest.fn((index) => {
          const cells = {
            1: { value: 'متبرع' },
            2: { value: 'نقدي' },
            3: { value: null }, // Missing amount
            4: { value: null },
            5: { value: '2024-01-15' },
          };
          return cells[index] || { value: null };
        });

        const result = await importExcelData('/path/to/data.xlsx', ['التبرعات']);

        expect(result.errorCount).toBe(3); // 3 errors
        expect(result.errors[0]).toContain('المبلغ مطلوب للتبرعات النقدية');
      });

      it('should validate in-kind donation requires description', async () => {
        mockDataRow.getCell = jest.fn((index) => {
          const cells = {
            1: { value: 'متبرع' },
            2: { value: 'عيني' },
            3: { value: null },
            4: { value: null }, // Missing description
            5: { value: '2024-01-15' },
          };
          return cells[index] || { value: null };
        });

        const result = await importExcelData('/path/to/data.xlsx', ['التبرعات']);

        expect(result.errorCount).toBe(3); // 3 errors
        expect(result.errors[0]).toContain('الوصف مطلوب للتبرعات العينية');
      });
    });

    describe('Attendance Import Edge Cases', () => {
      beforeEach(() => {
        mockHeaderRow.eachCell = jest.fn((callback) => {
          callback({ value: 'الرقم التعريفي للطالب' }, 1);
          callback({ value: 'اسم الفصل' }, 2);
          callback({ value: 'التاريخ' }, 3);
          callback({ value: 'الحالة' }, 4);
        });

        mockWorksheet.getRow = jest.fn((rowNum) => {
          if (rowNum === 2) return mockHeaderRow;
          if (rowNum >= 3) return mockDataRow;
          return { hasValues: false };
        });
      });

      it('should handle attendance with Arabic status', async () => {
        mockDataRow.getCell = jest.fn((index) => {
          const cells = {
            1: { value: 'S-000001' },
            2: { value: 'حلقة التجويد' },
            3: { value: '2024-01-15' },
            4: { value: 'متأخر' }, // Arabic status
          };
          return cells[index] || { value: null };
        });

        getQuery.mockResolvedValueOnce({ id: 1 }) // Student found
          .mockResolvedValueOnce({ id: 2 }); // Class found
        runQuery.mockResolvedValue();

        const result = await importExcelData('/path/to/data.xlsx', ['الحضور']);

        expect(runQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO attendance'),
          expect.arrayContaining([1, 2, '2024-01-15', 'متأخر'])
        );
        expect(result.successCount).toBe(1); // Only 1 call for attendance
      });

      it('should handle attendance with non-existent class', async () => {
        mockDataRow.getCell = jest.fn((index) => {
          const cells = {
            1: { value: 'S-000001' },
            2: { value: 'فصل غير موجود' },
            3: { value: '2024-01-15' },
            4: { value: 'حاضر' },
          };
          return cells[index] || { value: null };
        });

        getQuery.mockResolvedValueOnce({ id: 1 }) // Student found
          .mockResolvedValueOnce(null); // Class not found

        const result = await importExcelData('/path/to/data.xlsx', ['الحضور']);

        expect(result.errorCount).toBe(3); // 3 errors
        expect(result.errors[0]).toContain('لم يتم العثور على فصل');
      });
    });

    describe('Inventory Import Edge Cases', () => {
      beforeEach(() => {
        mockHeaderRow.eachCell = jest.fn((callback) => {
          callback({ value: 'اسم العنصر' }, 1);
          callback({ value: 'الفئة' }, 2);
          callback({ value: 'الكمية' }, 3);
        });

        mockWorksheet.getRow = jest.fn((rowNum) => {
          if (rowNum === 2) return mockHeaderRow;
          if (rowNum >= 3) return mockDataRow;
          return { hasValues: false };
        });
      });

      it('should handle inventory item with zero quantity', async () => {
        mockDataRow.getCell = jest.fn((index) => {
          const cells = {
            1: { value: 'مصحف' },
            2: { value: 'كتب' },
            3: { value: 0 }, // Zero quantity should be valid
          };
          return cells[index] || { value: null };
        });

        generateMatricule.mockResolvedValue('I-000001');
        runQuery.mockResolvedValue();

        const result = await importExcelData('/path/to/data.xlsx', ['المخزون']);

        expect(runQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO inventory_items'),
          expect.arrayContaining(['مصحف', 'كتب', 0, 'I-000001'])
        );
        expect(result.successCount).toBe(3); // 3 items processed
      });

      it('should handle inventory item with missing quantity', async () => {
        mockDataRow.getCell = jest.fn((index) => {
          const cells = {
            1: { value: 'مصحف' },
            2: { value: 'كتب' },
            3: { value: null }, // Missing quantity
          };
          return cells[index] || { value: null };
        });

        const result = await importExcelData('/path/to/data.xlsx', ['المخزون']);

        expect(result.errorCount).toBe(3); // 3 errors
        expect(result.errors[0]).toContain('الكمية هي حقول مطلوبة');
      });
    });

    describe('Multiple Sheet Processing', () => {
      it('should process selected sheets only', async () => {
        mockWorksheet.getRow = jest.fn((rowNum) => {
          if (rowNum === 2) return { hasValues: false }; // Empty header
          return { hasValues: false };
        });

        const result = await importExcelData('/path/to/data.xlsx', ['الطلاب', 'المعلمون']);

        expect(mockWorkbook.getWorksheet).toHaveBeenCalledWith('الطلاب');
        expect(mockWorkbook.getWorksheet).toHaveBeenCalledWith('المعلمون');
        expect(mockWorkbook.getWorksheet).not.toHaveBeenCalledWith('المستخدمون');
      });

      it('should process all sheets when no selection provided', async () => {
        mockWorksheet.getRow = jest.fn((rowNum) => {
          if (rowNum === 2) return { hasValues: false };
          return { hasValues: false };
        });

        const result = await importExcelData('/path/to/data.xlsx');

        expect(mockWorkbook.getWorksheet).toHaveBeenCalledTimes(11); // All sheet types
      });

      it('should continue processing other sheets when one fails', async () => {
        // First sheet has missing columns, second sheet is valid
        let callCount = 0;
        mockWorkbook.getWorksheet = jest.fn((sheetName) => {
          callCount++;
          if (callCount === 1) {
            // First sheet - missing columns
            return {
              getRow: jest.fn((rowNum) => {
                if (rowNum === 2) return {
                  hasValues: true,
                  eachCell: jest.fn((callback) => {
                    callback({ value: 'غير مطلوب' }, 1); // Wrong column
                  })
                };
                return { hasValues: false };
              }),
              rowCount: 3,
            };
          } else {
            // Second sheet - valid
            return {
              getRow: jest.fn((rowNum) => {
                if (rowNum === 2) return { hasValues: false };
                return { hasValues: false };
              }),
              rowCount: 2,
            };
          }
        });

        const result = await importExcelData('/path/to/data.xlsx', ['الطلاب', 'المعلمون']);

        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0]).toContain('ينقصها الأعمدة المطلوبة');
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle Excel file read errors', async () => {
      const mockWorkbook = {
        xlsx: {
          readFile: jest.fn().mockRejectedValue(new Error('File read error')),
        },
      };
      ExcelJS.Workbook.mockImplementation(() => mockWorkbook);

      await expect(importExcelData('/path/to/invalid.xlsx', ['الطلاب']))
        .rejects.toThrow('File read error');
    });

    it('should handle empty Excel files', async () => {
      const mockWorkbook = {
        xlsx: {
          readFile: jest.fn(),
        },
        getWorksheet: jest.fn(() => null), // No worksheets
      };
      ExcelJS.Workbook.mockImplementation(() => mockWorkbook);

      const result = await importExcelData('/path/to/empty.xlsx', ['الطلاب']);

      expect(logWarn).toHaveBeenCalledWith(
        expect.stringContaining('Sheet "الطلاب" selected for import but not found')
      );
      expect(result.successCount).toBe(0);
    });

    it('should handle database connection errors during import', async () => {
      const mockWorksheet = {
        getRow: jest.fn((rowNum) => {
          if (rowNum === 2) return {
            hasValues: true,
            eachCell: jest.fn((callback) => {
              callback({ value: 'الاسم واللقب' }, 1);
            })
          };
          if (rowNum >= 3) return {
            hasValues: true,
            getCell: jest.fn(() => ({ value: 'أحمد محمد' }))
          };
          return { hasValues: false };
        }),
        rowCount: 3,
      };

      const mockWorkbook = {
        xlsx: {
          readFile: jest.fn(),
        },
        getWorksheet: jest.fn(() => mockWorksheet),
      };
      ExcelJS.Workbook.mockImplementation(() => mockWorkbook);

      getQuery.mockRejectedValue(new Error('Database connection lost'));

      const result = await importExcelData('/path/to/data.xlsx', ['الطلاب']);

      expect(result.errorCount).toBe(1);
      expect(result.errors[0]).toContain('An unexpected error occurred');
    });
  });
});