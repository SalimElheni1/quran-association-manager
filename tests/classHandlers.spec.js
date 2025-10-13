const { ipcMain } = require('electron');
const { registerClassHandlers } = require('../src/main/handlers/classHandlers');
const db = require('../src/db/db');
const { classValidationSchema } = require('../src/main/validationSchemas');
const { log, error: logError } = require('../src/main/logger');

// Mock dependencies
jest.mock('../src/db/db');
jest.mock('../src/main/validationSchemas', () => ({
  classValidationSchema: {
    validateAsync: jest.fn(),
  },
}));
jest.mock('../src/main/logger');

describe('Class Handlers', () => {
  beforeAll(() => {
    registerClassHandlers();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('classes:add', () => {
    it('should add a new class successfully', async () => {
      const classData = { name: 'New Class', class_type: 'Hifdh' };
      classValidationSchema.validateAsync.mockResolvedValue(classData);
      db.runQuery.mockResolvedValue({ changes: 1 });

      await ipcMain.invoke('classes:add', classData);

      expect(classValidationSchema.validateAsync).toHaveBeenCalledWith(
        classData,
        expect.any(Object),
      );
      expect(db.runQuery).toHaveBeenCalledWith(
        'INSERT INTO classes (name, class_type) VALUES (?, ?)',
        ['New Class', 'Hifdh'],
      );
    });

    it('should throw a validation error for invalid data', async () => {
      const error = new Error('Validation failed');
      error.isJoi = true;
      error.details = [{ message: 'Invalid name' }];
      classValidationSchema.validateAsync.mockRejectedValue(error);

      await expect(ipcMain.invoke('classes:add', {})).rejects.toThrow(
        'بيانات غير صالحة: Invalid name',
      );
    });
  });

  describe('classes:update', () => {
    it('should update a class successfully', async () => {
      const classData = { name: 'Updated Class', status: 'active' };
      const classId = 1;
      classValidationSchema.validateAsync.mockResolvedValue(classData);
      db.runQuery.mockResolvedValue({ changes: 1 });

      await ipcMain.invoke('classes:update', classId, classData);

      expect(db.runQuery).toHaveBeenCalledWith(
        'UPDATE classes SET name = ?, status = ? WHERE id = ?',
        ['Updated Class', 'active', classId],
      );
    });

    it('should throw a validation error for invalid data on update', async () => {
      const error = new Error('Validation failed');
      error.isJoi = true;
      error.details = [{ message: 'Invalid status' }];
      classValidationSchema.validateAsync.mockRejectedValue(error);

      await expect(ipcMain.invoke('classes:update', 1, {})).rejects.toThrow(
        'بيانات غير صالحة: Invalid status',
      );
    });
  });

  describe('classes:delete', () => {
    it('should delete a class successfully', async () => {
      const classId = 1;
      db.runQuery.mockResolvedValue({ changes: 1 });

      await ipcMain.invoke('classes:delete', classId);

      expect(db.runQuery).toHaveBeenCalledWith('DELETE FROM classes WHERE id = ?', [classId]);
    });

    it('should throw an error if no ID is provided', async () => {
      await expect(ipcMain.invoke('classes:delete', null)).rejects.toThrow(
        'A valid class ID is required for deletion.',
      );
    });
  });

  describe('classes:get', () => {
    it('should get all classes without filters', async () => {
      db.allQuery.mockResolvedValue([{ id: 1, name: 'Class A' }]);
      const result = await ipcMain.invoke('classes:get', {});
      expect(db.allQuery).toHaveBeenCalledWith(expect.stringContaining('WHERE 1=1'), []);
      expect(result).toEqual([{ id: 1, name: 'Class A' }]);
    });

    it('should get classes with search and status filters', async () => {
      db.allQuery.mockResolvedValue([]);
      await ipcMain.invoke('classes:get', { searchTerm: 'Math', status: 'active' });
      expect(db.allQuery).toHaveBeenCalledWith(
        expect.stringContaining('c.name LIKE ? AND c.status = ?'),
        ['%Math%', 'active'],
      );
    });
  });

  describe('classes:getById', () => {
    it('should get a class by its ID', async () => {
      const classId = 1;
      const mockClass = { id: classId, name: 'Test Class' };
      db.getQuery.mockResolvedValue(mockClass);

      const result = await ipcMain.invoke('classes:getById', classId);

      expect(db.getQuery).toHaveBeenCalledWith(expect.stringContaining('WHERE c.id = ?'), [
        classId,
      ]);
      expect(result).toEqual(mockClass);
    });
  });

  describe('classes:getEnrollmentData', () => {
    it('should fetch enrollment data for a "kids" class', async () => {
      db.getQuery.mockResolvedValue({ value: '16' }); // adult_age_threshold
      db.allQuery.mockResolvedValue([]); // enrolled and notEnrolled

      await ipcMain.invoke('classes:getEnrollmentData', { classId: 1, classGender: 'kids' });

      const notEnrolledCall = db.allQuery.mock.calls.find((call) =>
        call[0].includes('s.date_of_birth > ?'),
      );
      expect(notEnrolledCall).toBeDefined();
    });
  });

  describe('classes:updateEnrollments', () => {
    it('should correctly update enrollments within a transaction', async () => {
      const classId = 1;
      const studentIds = [10, 11];
      db.runQuery.mockResolvedValue(undefined); // For transaction statements

      await ipcMain.invoke('classes:updateEnrollments', { classId, studentIds });

      expect(db.runQuery).toHaveBeenCalledWith('BEGIN TRANSACTION');
      expect(db.runQuery).toHaveBeenCalledWith('DELETE FROM class_students WHERE class_id = ?', [
        classId,
      ]);
      expect(db.runQuery).toHaveBeenCalledWith(
        'INSERT INTO class_students (class_id, student_id) VALUES (?, ?), (?, ?)',
        [1, 10, 1, 11],
      );
      expect(db.runQuery).toHaveBeenCalledWith('COMMIT');
      expect(log).toHaveBeenCalledWith('Enrollments updated successfully');
    });

    it('should rollback transaction on error', async () => {
      const error = new Error('DB Error');
      db.runQuery
        .mockResolvedValueOnce(undefined) // BEGIN
        .mockResolvedValueOnce(undefined) // DELETE
        .mockRejectedValueOnce(error); // INSERT fails

      await expect(
        ipcMain.invoke('classes:updateEnrollments', { classId: 1, studentIds: [10] }),
      ).rejects.toThrow('DB Error');

      expect(db.runQuery).toHaveBeenCalledWith('BEGIN TRANSACTION');
      expect(db.runQuery).toHaveBeenCalledWith('ROLLBACK');
      expect(logError).toHaveBeenCalledWith('Error updating enrollments:', error);
    });
  });
});
