// tests/importManager.extended.spec.js

// Mock all dependencies at the top level
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    unlink: jest.fn().mockResolvedValue(),
    rename: jest.fn().mockResolvedValue(),
  },
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
}));
jest.mock('pizzip');
jest.mock('electron', () => ({
  app: {
    relaunch: jest.fn(),
    quit: jest.fn(),
  },
}));
// 'electron-store' resolves to tests/mocks/electron-store.js (a working in-memory store).
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
const path = require('path');
const Store = require('electron-store');
const { setDbSalt } = require('../src/main/keyManager');

const {
  getDatabasePath,
  isDbOpen,
  closeDatabase,
  withTransaction,
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
    const DB = '/fake/db/path.sqlite';
    const PREVIOUS = `${DB}.pre-restore`;
    // The database files on "disk": path -> which database they hold.
    let files;

    const backupZip = (sql, extraFiles = [], salt = '{"db-salt": "new-salt"}') => ({
      file: jest.fn((name) => {
        if (name instanceof RegExp) return extraFiles.filter((f) => name.test(f.name));
        if (name === 'backup.sql') return { asText: () => sql };
        if (name === 'salt.json') return { asNodeBuffer: () => Buffer.from(salt) };
        return null;
      }),
    });

    beforeEach(() => {
      files = new Map([
        [DB, 'current'],
        [`${DB}-wal`, 'current'],
      ]);
      getDatabasePath.mockReturnValue(DB);
      isDbOpen.mockReturnValue(true);
      fsSync.existsSync.mockImplementation((p) => files.has(p) || p === '/user/data/assets');
      fs.rename.mockImplementation(async (from, to) => {
        files.set(to, files.get(from));
        files.delete(from);
      });
      fs.unlink.mockImplementation(async (p) => {
        files.delete(p);
      });
      // Opening the database creates an empty one when the file is gone.
      initializeDatabase.mockImplementation(async () => {
        if (!files.has(DB)) files.set(DB, 'new');
      });
      fs.readFile.mockResolvedValue(Buffer.from('zip content'));
      getDb.mockReturnValue({});
      dbExec.mockResolvedValue();
      runQuery.mockResolvedValue({ changes: 1 });
      getQuery.mockImplementation((sql) =>
        Promise.resolve(sql.includes('FROM roles WHERE name = ?') ? { id: 2 } : undefined),
      );
      allQuery.mockImplementation((sql) => {
        if (sql.includes('sqlite_master')) {
          return Promise.resolve([
            { name: 'students' },
            { name: 'teachers' },
            { name: 'migrations' },
          ]);
        }
        if (sql.startsWith('PRAGMA table_info')) {
          return Promise.resolve([{ name: 'id' }, { name: 'name' }]);
        }
        if (sql.includes('NOT EXISTS (SELECT 1 FROM user_roles')) {
          return Promise.resolve([{ id: 4, username: 'old_admin' }]);
        }
        if (sql.includes('FROM students') && sql.includes('LENGTH(matricule)')) {
          return Promise.resolve([{ id: 1, matricule: 'S-000012' }]);
        }
        return Promise.resolve([]);
      });
      app.relaunch.mockClear();
      app.quit.mockClear();
    });

    describe('a file that cannot be restored changes nothing', () => {
      it.each([
        ['files are missing from the package', { file: () => null }, 'غير صالح أو تالف'],
        [
          'the salt is missing',
          backupZip('SELECT 1;', [], '{}'),
          'Backup configuration is missing the required salt.',
        ],
      ])('%s', async (_label, zip, message) => {
        PizZip.mockImplementation(() => zip);

        const result = await replaceDatabase('bad.qdb', 'pw');

        expect(result.success).toBe(false);
        expect(result.message).toContain(message);
        expect(closeDatabase).not.toHaveBeenCalled();
        expect(fs.rename).not.toHaveBeenCalled();
        expect(files.get(DB)).toBe('current');
        expect(app.relaunch).not.toHaveBeenCalled();
      });
    });

    it('keeps the current database when it cannot be moved aside', async () => {
      PizZip.mockImplementation(() => backupZip('REPLACE INTO "students" (id) VALUES (1);'));
      fs.rename.mockImplementationOnce(() => Promise.reject(new Error('Permission denied')));

      const result = await replaceDatabase('good.qdb', 'pw');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Permission denied');
      expect(files.get(DB)).toBe('current');
      expect(dbExec).not.toHaveBeenCalled();
      // Opened again, so the app keeps working.
      expect(initializeDatabase).toHaveBeenCalledTimes(1);
    });

    describe('with a valid backup', () => {
      it('replaces the database and keeps the previous one aside', async () => {
        PizZip.mockImplementation(() =>
          backupZip(`
            REPLACE INTO "students" (id, name) VALUES (1, 'Ali');
            REPLACE INTO "non_existent_table" (id, data) VALUES (1, 'test');
            REPLACE INTO "teachers" (id, name) VALUES (1, 'Fatima');
          `),
        );

        const result = await replaceDatabase('good.qdb', 'pw');

        expect(result).toEqual({
          success: true,
          message: 'تم استيراد قاعدة البيانات بنجاح. سيتم إعادة تشغيل التطبيق الآن.',
        });
        expect(files.get(DB)).toBe('new');
        expect(files.get(PREVIOUS)).toBe('current');
        expect(files.get(`${PREVIOUS}-wal`)).toBe('current');
        expect(files.has(`${DB}-wal`)).toBe(false);
        expect(setDbSalt).toHaveBeenCalledWith('new-salt');
        // A backup that does not list its migrations gets today's schema.
        expect(initializeDatabase).toHaveBeenCalledWith({ migrations: null });

        // The data runs with foreign keys off, in one transaction, and they are always turned
        // back on.
        const execs = dbExec.mock.calls.map(([, sql]) => sql);
        expect(execs[0]).toBe('PRAGMA foreign_keys = OFF');
        expect(execs[execs.length - 1]).toBe('PRAGMA foreign_keys = ON');
        expect(withTransaction).toHaveBeenCalledTimes(1);
        const data = execs[1];
        expect(data).toContain('REPLACE INTO "students"');
        expect(data).toContain('REPLACE INTO "teachers"');
        expect(data).not.toContain('non_existent_table');

        // The renderer relaunches the app and the user has to log in again.
        expect(Store.mockMethods.set).toHaveBeenCalledWith('force-relogin-after-restart', true);
        expect(app.relaunch).not.toHaveBeenCalled();
      });

      it('replaces the copy kept by an earlier restore', async () => {
        files.set(PREVIOUS, 'older');
        files.set(`${PREVIOUS}-shm`, 'older');
        PizZip.mockImplementation(() => backupZip('REPLACE INTO "students" (id) VALUES (1);'));

        await replaceDatabase('good.qdb', 'pw');

        expect(files.get(PREVIOUS)).toBe('current');
        expect(files.has(`${PREVIOUS}-shm`)).toBe(false);
      });

      it('runs only rows: schema changes, ATTACH, triggers, PRAGMA and INSERT ... SELECT are skipped', async () => {
        PizZip.mockImplementation(() =>
          backupZip(`
            -- Database Schema
            CREATE TABLE IF NOT EXISTS students (id INTEGER PRIMARY KEY, name TEXT);
            DROP TABLE teachers;
            ATTACH DATABASE '/tmp/evil.bat' AS evil;
            CREATE TRIGGER t AFTER INSERT ON students BEGIN DELETE FROM teachers; END;
            PRAGMA writable_schema = 1;
            INSERT INTO "teachers" (id, name) SELECT id, name FROM users;
            REPLACE INTO "migrations" (name) VALUES ('999-skip-everything.sql');
            -- Database Data
            REPLACE INTO "students" (id, name) VALUES (1, 'Ali; DROP TABLE teachers');
          `),
        );

        await replaceDatabase('good.qdb', 'pw');

        const data = dbExec.mock.calls[1][1];
        expect(data).toBe(
          '-- Database Data\n            REPLACE INTO "students" (id, name) VALUES (1, \'Ali; DROP TABLE teachers\')',
        );
      });

      it('makes a safety copy of the current data in its backup folder before replacing it', async () => {
        const backupManager = require('../src/main/backupManager');
        const validate = jest
          .spyOn(backupManager, 'validateBackupPath')
          .mockReturnValue({ valid: true, path: '/backups' });
        const runBackup = jest
          .spyOn(backupManager, 'runBackup')
          .mockResolvedValue({ success: true });
        PizZip.mockImplementation(() => backupZip('SELECT 1;'));
        const currentSettings = {
          backup_path: '/backups',
          association_transfer_key: 'saved-transfer-key',
        };

        try {
          await replaceDatabase('good.qdb', 'pw', undefined, currentSettings);

          expect(validate).toHaveBeenCalledWith('/backups');
          // With the current settings, so the copy is encrypted with the saved transfer key.
          expect(runBackup).toHaveBeenCalledWith(
            currentSettings,
            expect.stringMatching(/^\/backups\/pre-import-backup-.+\.qdb$/),
          );
          // Taken while the current database is still in place.
          expect(runBackup.mock.invocationCallOrder[0]).toBeLessThan(
            fs.rename.mock.invocationCallOrder[0],
          );
        } finally {
          validate.mockRestore();
          runBackup.mockRestore();
        }
      });

      it('drops columns the current schema no longer has', async () => {
        PizZip.mockImplementation(() =>
          backupZip(`REPLACE INTO "students" ("id", "name", "old_col") VALUES (1, 'Ali', 'x');`),
        );

        await replaceDatabase('good.qdb', 'pw');

        const data = dbExec.mock.calls[1][1];
        expect(data).toBe('REPLACE INTO "students" ("id", "name") VALUES (1, \'Ali\')');
      });

      it('puts the previous database back when the data fails to load', async () => {
        const assetFile = {
          name: 'assets/logo.png',
          dir: false,
          asNodeBuffer: () => Buffer.from('x'),
        };
        PizZip.mockImplementation(() =>
          backupZip('REPLACE INTO "students" (id) VALUES (1);', [assetFile]),
        );
        app.getPath = jest.fn(() => '/user/data');
        dbExec.mockImplementation((_db, sql) =>
          sql.startsWith('PRAGMA') ? Promise.resolve() : Promise.reject(new Error('bad data')),
        );

        try {
          const result = await replaceDatabase('good.qdb', 'pw');

          expect(result.success).toBe(false);
          expect(result.message).toContain('bad data');
          expect(result.message).toContain('بقيت البيانات السابقة كما هي');
          expect(dbExec).toHaveBeenLastCalledWith({}, 'PRAGMA foreign_keys = ON');
          // The half-imported database is gone and the previous one is open again.
          expect(files.get(DB)).toBe('current');
          expect(files.get(`${DB}-wal`)).toBe('current');
          expect(files.has(PREVIOUS)).toBe(false);
          expect(initializeDatabase).toHaveBeenCalledTimes(2);
          // Nothing of the backup was applied.
          expect(setDbSalt).not.toHaveBeenCalled();
          expect(fsSync.writeFileSync).not.toHaveBeenCalled();
          expect(Store.mockMethods.set).not.toHaveBeenCalledWith(
            'force-relogin-after-restart',
            true,
          );
        } finally {
          delete app.getPath;
        }
      });

      it('gives users of a backup from before user_roles the role they had', async () => {
        allQuery.mockImplementation((sql) => {
          if (sql.includes('sqlite_master')) return Promise.resolve([{ name: 'users' }]);
          if (sql.startsWith('PRAGMA table_info')) {
            return Promise.resolve([{ name: 'id' }, { name: 'username' }]);
          }
          return Promise.resolve([]);
        });
        getQuery.mockImplementation((sql, [name]) =>
          Promise.resolve({ Administrator: { id: 2 }, SessionSupervisor: { id: 4 } }[name]),
        );
        PizZip.mockImplementation(() =>
          backupZip(
            `REPLACE INTO "users" ("id", "username", "role") VALUES (7, 'amal', 'Manager');
             REPLACE INTO "users" ("id", "username", "role") VALUES (8, 'samir', 'SessionSupervisor');
             REPLACE INTO "users" ("id", "username", "role") VALUES (9, 'x', 'Owner');`,
          ),
        );

        await replaceDatabase('good.qdb', 'pw');

        const grants = runQuery.mock.calls.filter(([sql]) => sql.includes('INTO user_roles'));
        expect(grants.map(([, params]) => params)).toEqual([
          [7, 2],
          [8, 4],
        ]);
      });

      it('makes up no role for a user of a recent backup who has none', async () => {
        allQuery.mockImplementation((sql) => {
          if (sql.includes('sqlite_master')) {
            return Promise.resolve([{ name: 'users' }, { name: 'user_roles' }]);
          }
          if (sql.startsWith('PRAGMA table_info("users")')) {
            return Promise.resolve([{ name: 'id' }, { name: 'username' }]);
          }
          if (sql.startsWith('PRAGMA table_info')) {
            return Promise.resolve([{ name: 'user_id' }, { name: 'role_id' }]);
          }
          return Promise.resolve([]);
        });
        PizZip.mockImplementation(() =>
          backupZip(
            `REPLACE INTO "users" ("id", "username") VALUES (7, 'amal'), (8, 'no_role');
             REPLACE INTO "user_roles" ("user_id", "role_id") VALUES (7, 1);`,
          ),
        );

        await replaceDatabase('good.qdb', 'pw');

        const grants = runQuery.mock.calls.filter(([sql]) => sql.includes('INTO user_roles'));
        expect(grants).toEqual([]);
      });

      it('converts old 6-digit matricules to the 4-digit format', async () => {
        PizZip.mockImplementation(() => backupZip('SELECT 1;'));

        await replaceDatabase('good.qdb', 'pw');

        expect(runQuery).toHaveBeenCalledWith('UPDATE students SET matricule = ? WHERE id = ?', [
          'S-0012',
          1,
        ]);
      });

      it('restores backup assets but never writes outside the assets folder', async () => {
        app.getPath = jest.fn(() => '/user/data');
        const asset = (name) => ({ name, dir: false, asNodeBuffer: () => Buffer.from(name) });
        PizZip.mockImplementation(() =>
          backupZip('SELECT 1;', [
            asset('assets/logos/logo.png'),
            asset('assets/../../evil.js'),
            asset('assets/../assets-evil/x.png'),
          ]),
        );

        try {
          const result = await replaceDatabase('good.qdb', 'pw');

          expect(result.success).toBe(true);
          const written = fsSync.writeFileSync.mock.calls.map(([dest]) => dest);
          expect(written).toEqual([path.resolve('/user/data/assets', 'logos/logo.png')]);
        } finally {
          delete app.getPath;
        }
      });
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
      expect(results.errorCount).toBe(1);
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
      // The user and their role are written in one transaction.
      expect(withTransaction).toHaveBeenCalledTimes(1);
      expect(runQuery).not.toHaveBeenCalledWith('BEGIN TRANSACTION');
    });

    it('should return error if required fields are missing', async () => {
      const rowData = { 'اسم المستخدم': 'new.user', 'الاسم الأول': null }; // Missing first name
      const mockRow = createMockRow(rowData);

      const { processUserRow } = require('../src/main/importManager');
      const result = await processUserRow(mockRow, mockHeaderRow);

      expect(result.success).toBe(false);
      expect(result.message).toContain('هي حقول مطلوبة');
    });

    it('refuses a row whose role is not one of the four, before writing anything', async () => {
      const rowData = {
        'اسم المستخدم': 'fail.user',
        'الاسم الأول': 'Fail',
        اللقب: 'User',
        الدور: 'NonExistentRole',
        'نوع التوظيف': 'Part-time',
      };
      const mockRow = createMockRow(rowData);

      const { processUserRow } = require('../src/main/importManager');

      const result = await processUserRow(mockRow, mockHeaderRow);
      expect(result).toEqual({ success: false, message: 'الدور "NonExistentRole" غير معروف.' });
      expect(runQuery).not.toHaveBeenCalled();
    });
  });

  describe('refusedImportSheets', () => {
    const { refusedImportSheets } = require('../src/main/importManager');
    const ALL = [
      'الطلاب',
      'المعلمون',
      'المستخدمون',
      'الفصول',
      'العمليات المالية',
      'رسوم الطلاب',
      'الحضور',
      'المجموعات',
      'المخزون',
    ];

    it('lets the Superadmin import every sheet', () => {
      expect(refusedImportSheets(['Superadmin'], ALL)).toEqual([]);
    });

    it('keeps the users sheet for the Superadmin', () => {
      expect(refusedImportSheets(['Administrator'], ALL)).toEqual(['المستخدمون']);
    });

    it('gives a FinanceManager only the sheets of the channels they may write', () => {
      expect(refusedImportSheets(['FinanceManager'], ALL)).toEqual([
        'الطلاب',
        'المعلمون',
        'المستخدمون',
        'الفصول',
        'المجموعات',
        'المخزون',
      ]);
    });

    it('refuses unknown sheets, and everything without roles', () => {
      expect(refusedImportSheets(['Superadmin'], ['constructor', 'ورقة'])).toEqual([
        'constructor',
        'ورقة',
      ]);
      expect(refusedImportSheets(undefined, ['الطلاب'])).toEqual(['الطلاب']);
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
      // The transaction and the account balance are written in one transaction.
      expect(withTransaction).toHaveBeenCalledTimes(1);
      // Check main insertion
      expect(runQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO transactions'),
        expect.arrayContaining(['I-2024-001', 'INCOME', 100]),
      );
      // Check account balance update
      expect(runQuery).toHaveBeenCalledWith(expect.stringContaining('UPDATE accounts'), [100]);
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

      expect(result.success).toBe(true);
      expect(result.message).toContain('تم تحديث كمية');
    });
  });
});
