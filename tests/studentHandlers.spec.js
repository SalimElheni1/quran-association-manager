const { ipcMain } = require('electron');
const { registerStudentHandlers } = require('../src/main/handlers/studentHandlers');
const db = require('../src/db/db');
const { studentValidationSchema } = require('../src/main/validationSchemas');
const { generateMatricule } = require('../src/main/matriculeService');

// Mock dependencies
jest.mock('../src/db/db');
jest.mock('../src/main/validationSchemas', () => ({
  studentValidationSchema: {
    validateAsync: jest.fn(),
  },
}));
jest.mock('../src/main/matriculeService');
jest.mock('../src/main/logger');

describe('Student Handlers', () => {
  beforeAll(() => {
    registerStudentHandlers();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('students:get', () => {
    const currentYear = 2024;
    const OriginalDate = global.Date;

    // Mock Date to control the current year for consistent test results.
    // This allows us to have predictable age calculations.
    beforeEach(() => {
      const mockToday = new OriginalDate(`${currentYear}-06-15T10:00:00Z`);

      global.Date = jest.fn((...args) => {
        // If called with arguments (e.g., new Date('2010-01-01')), use the real constructor.
        if (args.length > 0) {
          return new OriginalDate(...args);
        }
        // If called without arguments (e.g., new Date()), return our mocked "today".
        return mockToday;
      });

      // Jest doesn't copy static methods like `now()` automatically.
      Object.assign(global.Date, OriginalDate);
    });

    afterEach(() => {
      global.Date = OriginalDate; // Restore the real Date object
    });

    it('should fetch students and calculate their age correctly', async () => {
      const mockStudents = [{ id: 1, name: 'Test Student', date_of_birth: '2014-01-01' }];
      db.allQuery.mockResolvedValue(mockStudents);

      const results = await ipcMain.invoke('students:get', {});
      expect(db.allQuery).toHaveBeenCalledWith(expect.stringContaining('SELECT'), []);
      // Age should be 2024 - 2014 = 10
      expect(results[0].age).toBe(10);
    });

    it('should correctly build the SQL query with all filters applied', async () => {
      db.allQuery.mockResolvedValue([]);
      const filters = {
        searchTerm: 'Ali',
        genderFilter: 'Male',
        minAgeFilter: '10',
        maxAgeFilter: '20',
      };

      await ipcMain.invoke('students:get', filters);

      const maxBirthYear = currentYear - parseInt(filters.minAgeFilter, 10); // 2014
      const minBirthYear = currentYear - parseInt(filters.maxAgeFilter, 10) - 1; // 2003

      expect(db.allQuery).toHaveBeenCalledWith(
        expect.stringContaining(
          'AND (name LIKE ? OR matricule LIKE ?) AND gender = ? AND CAST(SUBSTR(date_of_birth, 1, 4) AS INTEGER) <= ? AND CAST(SUBSTR(date_of_birth, 1, 4) AS INTEGER) > ?'
        ),
        ['%Ali%', '%Ali%', 'Male', maxBirthYear, minBirthYear]
      );
    });

    it('should handle only the minAgeFilter', async () => {
      db.allQuery.mockResolvedValue([]);
      const filters = { minAgeFilter: '15' };

      await ipcMain.invoke('students:get', filters);

      const maxBirthYear = currentYear - 15; // 2009

      expect(db.allQuery).toHaveBeenCalledWith(
        expect.stringContaining('AND CAST(SUBSTR(date_of_birth, 1, 4) AS INTEGER) <= ?'),
        [maxBirthYear]
      );
    });

    it('should handle only the maxAgeFilter', async () => {
      db.allQuery.mockResolvedValue([]);
      const filters = { maxAgeFilter: '25' };

      await ipcMain.invoke('students:get', filters);

      const minBirthYear = currentYear - 25 - 1; // 1998

      expect(db.allQuery).toHaveBeenCalledWith(
        expect.stringContaining('AND CAST(SUBSTR(date_of_birth, 1, 4) AS INTEGER) > ?'),
        [minBirthYear]
      );
    });
  });

  describe('students:getById', () => {
    it('should get a single student by ID', async () => {
      const mockStudent = { id: 1, name: 'Test Student' };
      db.getQuery.mockResolvedValue(mockStudent);

      const result = await ipcMain.invoke('students:getById', 1);

      expect(db.getQuery).toHaveBeenCalledWith('SELECT * FROM students WHERE id = ?', [1]);
      expect(result).toEqual(mockStudent);
    });
  });

  describe('students:add', () => {
    it('should add a new student and assign to groups within a transaction', async () => {
      const studentData = { name: 'New Student', groupIds: [1, 2] };
      const studentId = 123;

      studentValidationSchema.validateAsync.mockResolvedValue({ name: 'New Student' });
      generateMatricule.mockResolvedValue('S-2024-001');
      db.runQuery.mockResolvedValue({ id: studentId });

      await ipcMain.invoke('students:add', studentData);

      expect(db.runQuery).toHaveBeenCalledWith('BEGIN TRANSACTION;');
      expect(generateMatricule).toHaveBeenCalledWith('student');
      expect(db.runQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO students'), expect.any(Array));
      expect(db.runQuery).toHaveBeenCalledWith('INSERT INTO student_groups (student_id, group_id) VALUES (?, ?)', [studentId, 1]);
      expect(db.runQuery).toHaveBeenCalledWith('INSERT INTO student_groups (student_id, group_id) VALUES (?, ?)', [studentId, 2]);
      expect(db.runQuery).toHaveBeenCalledWith('COMMIT;');
      expect(db.runQuery).not.toHaveBeenCalledWith('ROLLBACK;');
    });

    it('should rollback transaction on validation error', async () => {
      const error = new Error('Validation failed');
      error.isJoi = true;
      error.details = [{ message: 'Invalid name' }];
      studentValidationSchema.validateAsync.mockRejectedValue(error);

      await expect(ipcMain.invoke('students:add', {})).rejects.toThrow('بيانات غير صالحة: Invalid name');

      expect(db.runQuery).toHaveBeenCalledWith('BEGIN TRANSACTION;');
      expect(db.runQuery).toHaveBeenCalledWith('ROLLBACK;');
      expect(db.runQuery).not.toHaveBeenCalledWith('COMMIT;');
    });
  });

  describe('students:update', () => {
    it('should update a student and their groups within a transaction', async () => {
      const studentData = { name: 'Updated Student', groupIds: [3] };
      const studentId = 1;

      studentValidationSchema.validateAsync.mockResolvedValue({ name: 'Updated Student' });
      db.runQuery.mockResolvedValue({ changes: 1 });

      await ipcMain.invoke('students:update', studentId, studentData);

      expect(db.runQuery).toHaveBeenCalledWith('BEGIN TRANSACTION;');
      expect(db.runQuery).toHaveBeenCalledWith(expect.stringContaining('UPDATE students SET'), ['Updated Student', studentId]);
      expect(db.runQuery).toHaveBeenCalledWith('DELETE FROM student_groups WHERE student_id = ?', [studentId]);
      expect(db.runQuery).toHaveBeenCalledWith('INSERT INTO student_groups (student_id, group_id) VALUES (?, ?)', [studentId, 3]);
      expect(db.runQuery).toHaveBeenCalledWith('COMMIT;');
      expect(db.runQuery).not.toHaveBeenCalledWith('ROLLBACK;');
    });
  });

  describe('students:delete', () => {
    it('should delete a student', async () => {
      db.runQuery.mockResolvedValue({ changes: 1 });
      await ipcMain.invoke('students:delete', 1);
      expect(db.runQuery).toHaveBeenCalledWith('DELETE FROM students WHERE id = ?', [1]);
    });

    it('should throw an error for invalid ID', async () => {
      await expect(ipcMain.invoke('students:delete', null)).rejects.toThrow(
        'فشل حذف الطالب.'
      );
    });
  });
});
