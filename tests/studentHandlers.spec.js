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
  let handlers = {};

  beforeAll(() => {
    // The mock for ipcMain.handle will store the handler functions.
    ipcMain.handle.mockImplementation((channel, handler) => {
      handlers[channel] = handler;
    });
    registerStudentHandlers();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('students:get', () => {
    it('should get students with various filters', async () => {
      db.allQuery.mockResolvedValue([]);
      const filters = {
        searchTerm: 'Ali',
        genderFilter: 'Male',
      };

      await handlers['students:get'](null, filters);

      expect(db.allQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE (name LIKE ? OR matricule LIKE ?) AND gender = ?'),
        expect.arrayContaining(['%Ali%', '%Ali%', 'Male'])
      );
    });

    it('should correctly filter by max age', async () => {
        db.allQuery.mockResolvedValue([]);
        const maxAge = 10;
        const filters = { maxAgeFilter: maxAge.toString() };

        const currentYear = 2024;
        jest.spyOn(global, 'Date').mockImplementation(() => ({
          getFullYear: () => currentYear,
        }));

        await handlers['students:get'](null, filters);

        expect(db.allQuery).toHaveBeenCalledWith(
          expect.stringContaining('SELECT id, matricule, name, date_of_birth, enrollment_date, status, gender FROM students'),
          []
        );

        jest.restoreAllMocks();
      });
  });

  describe('students:getById', () => {
    it('should get a single student by ID', async () => {
      const mockStudent = { id: 1, name: 'Test Student' };
      db.getQuery.mockResolvedValue(mockStudent);

      const result = await handlers['students:getById'](null, 1);

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

      await handlers['students:add'](null, studentData);

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

      await expect(handlers['students:add'](null, { name: ''})).rejects.toThrow('بيانات غير صالحة: Invalid name');

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

      await handlers['students:update'](null, { id: studentId, studentData });

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
      await handlers['students:delete'](null, 1);
      expect(db.runQuery).toHaveBeenCalledWith('DELETE FROM students WHERE id = ?', [1]);
    });

    it('should throw an error for invalid ID', async () => {
      await expect(handlers['students:delete'](null, null)).rejects.toThrow(
        'فشل حذف الطالب.'
      );
    });
  });
});