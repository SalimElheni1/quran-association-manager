const { ipcMain } = require('electron');
const { registerStudentHandlers } = require('../src/main/handlers/studentHandlers');
const db = require('../src/db/db');
const { studentValidationSchema } = require('../src/main/validationSchemas');
const { generateMatricule } = require('../src/main/services/matriculeService');

// Mock dependencies
jest.mock('../src/db/db');
jest.mock('../src/main/validationSchemas', () => ({
  studentValidationSchema: {
    validateAsync: jest.fn(),
  },
}));
jest.mock('../src/main/services/matriculeService');
jest.mock('../src/main/logger');
jest.mock('../src/main/authMiddleware', () => ({
  requireRoles: jest.fn(() => (handler) => handler),
}));

describe('Student Handlers', () => {
  beforeAll(() => {
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
        minAgeFilter: '10',
        maxAgeFilter: '15',
      };

      await ipcMain.invoke('students:get', filters);

      // The test should check the SQL query and the parameters
      expect(db.allQuery).toHaveBeenCalledWith(
        expect.stringContaining('AND (s.name LIKE ? OR s.matricule LIKE ?) AND s.gender = ?'),
        expect.arrayContaining(['%Ali%', '%Ali%', 'Male']),
      );
    });

    it('keeps only students within the age range, leaving out unknown ages', async () => {
      const yearsAgo = (years) => {
        const d = new Date();
        d.setFullYear(d.getFullYear() - years);
        return d.toISOString().slice(0, 10);
      };
      db.getQuery.mockResolvedValue({ total: 4 });
      db.allQuery.mockResolvedValue([
        { id: 1, name: 'A', date_of_birth: yearsAgo(5) },
        { id: 2, name: 'B', date_of_birth: yearsAgo(10) },
        { id: 3, name: 'C', date_of_birth: yearsAgo(12) },
        { id: 4, name: 'D', date_of_birth: null },
      ]);

      const result = await ipcMain.invoke('students:get', {
        minAgeFilter: '6',
        maxAgeFilter: '10',
      });

      expect(result.students.map((s) => s.id)).toEqual([2]);
      expect(result.total).toBe(1);
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

      expect(generateMatricule).toHaveBeenCalledWith('student');
      expect(db.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO students'),
        expect.any(Array),
      );
      expect(db.runQuery).toHaveBeenCalledWith(
        'INSERT INTO student_groups (student_id, group_id) VALUES (?, ?)',
        [studentId, 1],
      );
      expect(db.runQuery).toHaveBeenCalledWith(
        'INSERT INTO student_groups (student_id, group_id) VALUES (?, ?)',
        [studentId, 2],
      );
    });

    it('should rollback transaction on validation error', async () => {
      const error = new Error('Validation failed');
      error.isJoi = true;
      error.details = [{ message: 'Invalid name' }];
      studentValidationSchema.validateAsync.mockRejectedValue(error);

      await expect(ipcMain.invoke('students:add', {})).rejects.toThrow(
        'بيانات غير صالحة: Invalid name',
      );
    });

    it('rejects a student younger than the minimum age (Joi returns the birth date as a Date)', async () => {
      const dateOfBirth = new Date();
      dateOfBirth.setFullYear(dateOfBirth.getFullYear() - 2);
      studentValidationSchema.validateAsync.mockResolvedValue({
        name: 'Young Student',
        date_of_birth: dateOfBirth,
      });
      generateMatricule.mockResolvedValue('S-0001');

      await expect(ipcMain.invoke('students:add', { name: 'Young Student' })).rejects.toThrow(
        'عمر الطالب أقل من الحد الأدنى',
      );
      expect(db.runQuery).not.toHaveBeenCalled();
    });

    it('shows the minimum-age message on update too', async () => {
      const dateOfBirth = new Date();
      dateOfBirth.setFullYear(dateOfBirth.getFullYear() - 2);
      studentValidationSchema.validateAsync.mockResolvedValue({
        name: 'Young Student',
        date_of_birth: dateOfBirth,
      });

      await expect(ipcMain.invoke('students:update', 1, { name: 'Young Student' })).rejects.toThrow(
        'عمر الطالب أقل من الحد الأدنى',
      );
      expect(db.runQuery).not.toHaveBeenCalled();
    });

    it('accepts a student at or above the minimum age', async () => {
      const dateOfBirth = new Date();
      dateOfBirth.setFullYear(dateOfBirth.getFullYear() - 10);
      studentValidationSchema.validateAsync.mockResolvedValue({
        name: 'Student',
        date_of_birth: dateOfBirth,
      });
      generateMatricule.mockResolvedValue('S-0002');
      db.runQuery.mockResolvedValue({ id: 5 });

      await ipcMain.invoke('students:add', { name: 'Student' });

      expect(db.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO students'),
        expect.any(Array),
      );
    });
  });

  describe('students:update', () => {
    it('should update a student and their groups within a transaction', async () => {
      const studentData = { name: 'Updated Student', groupIds: [3] };
      const studentId = 1;

      studentValidationSchema.validateAsync.mockResolvedValue({ name: 'Updated Student' });
      db.runQuery.mockResolvedValue({ changes: 1 });

      await ipcMain.invoke('students:update', studentId, studentData);

      expect(db.runQuery).toHaveBeenCalledWith(expect.stringContaining('UPDATE students SET'), [
        'Updated Student',
        studentId,
      ]);
      expect(db.runQuery).toHaveBeenCalledWith('DELETE FROM student_groups WHERE student_id = ?', [
        studentId,
      ]);
      expect(db.runQuery).toHaveBeenCalledWith(
        'INSERT INTO student_groups (student_id, group_id) VALUES (?, ?)',
        [studentId, 3],
      );
    });
  });

  describe('students:delete', () => {
    it('should soft delete a student and cancel their unpaid charges', async () => {
      db.runQuery.mockResolvedValue({ changes: 1 });
      await ipcMain.invoke('students:delete', 1);

      const [softSql, softParams] = db.runQuery.mock.calls[0];
      expect(softSql).toBe(
        'UPDATE students SET deleted_at = ?, deleted_by = ? WHERE id = ? AND deleted_at IS NULL',
      );
      expect(softParams[2]).toBe(1);
      const [cancelSql, cancelParams] = db.runQuery.mock.calls[1];
      expect(cancelSql).toContain('UPDATE student_fee_charges SET cancelled_at = ?');
      expect(cancelSql).toContain("status IN ('UNPAID', 'PARTIALLY_PAID')");
      // Stamped with the deletion time, so a restore finds exactly these charges again
      expect(cancelParams).toEqual([softParams[0], 1]);
      expect(db.runQuery).not.toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM'),
        expect.anything(),
      );
    });

    it('should restore a student and the charges its deletion cancelled', async () => {
      db.getQuery.mockResolvedValue({ deleted_at: '2026-09-29 10:00:00' });
      db.runQuery.mockResolvedValue({ changes: 1 });

      await ipcMain.invoke('students:restore', 1);

      expect(db.runQuery).toHaveBeenCalledWith(
        'UPDATE student_fee_charges SET cancelled_at = NULL WHERE student_id = ? AND cancelled_at = ?',
        [1, '2026-09-29 10:00:00'],
      );
      expect(db.runQuery).toHaveBeenCalledWith(
        'UPDATE students SET deleted_at = NULL, deleted_by = NULL WHERE id = ? AND deleted_at IS NOT NULL',
        [1],
      );
    });

    it('should throw an error for invalid ID', async () => {
      await expect(ipcMain.invoke('students:delete', null)).rejects.toThrow('فشل حذف الطالب.');
    });
  });

  // ============================================
  // SPONSOR FIELDS TESTS (Migration 033)
  // ============================================

  describe('students:add with sponsor fields', () => {
    it('should add student with sponsor information when fee_category is SPONSORED', async () => {
      const studentData = {
        name: 'Sponsored Student',
        fee_category: 'SPONSORED',
        sponsor_name: 'Ahmed Ali',
        sponsor_phone: '0123456789',
        sponsor_cin: 'AB123456',
        groupIds: [],
      };

      studentValidationSchema.validateAsync.mockResolvedValue({
        name: 'Sponsored Student',
        fee_category: 'SPONSORED',
        sponsor_name: 'Ahmed Ali',
        sponsor_phone: '0123456789',
        sponsor_cin: 'AB123456',
      });
      generateMatricule.mockResolvedValue('S-2024-003');
      db.runQuery.mockResolvedValue({ id: 3 });

      await ipcMain.invoke('students:add', studentData);

      expect(db.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO students'),
        expect.arrayContaining(['Ahmed Ali', '0123456789', 'AB123456']),
      );
    });

    it('should add student with fee_category CAN_PAY', async () => {
      const studentData = {
        name: 'Regular Student',
        fee_category: 'CAN_PAY',
        groupIds: [],
      };

      studentValidationSchema.validateAsync.mockResolvedValue({
        name: 'Regular Student',
        fee_category: 'CAN_PAY',
      });
      generateMatricule.mockResolvedValue('S-2024-004');
      db.runQuery.mockResolvedValue({ id: 4 });

      await ipcMain.invoke('students:add', studentData);

      const [sql, params] = db.runQuery.mock.calls.find(([q]) =>
        q.includes('INSERT INTO students'),
      );
      expect(sql).toContain('fee_category');
      expect(sql).not.toContain('sponsor_');
      expect(params).toContain('CAN_PAY');
      expect(studentValidationSchema.validateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ matricule: 'S-2024-004', fee_category: 'CAN_PAY' }),
        expect.any(Object),
      );
    });

    it('should add student with fee_category EXEMPT', async () => {
      const studentData = {
        name: 'Exempt Student',
        fee_category: 'EXEMPT',
        groupIds: [],
      };

      studentValidationSchema.validateAsync.mockResolvedValue({
        name: 'Exempt Student',
        fee_category: 'EXEMPT',
      });
      generateMatricule.mockResolvedValue('S-2024-005');
      db.runQuery.mockResolvedValue({ id: 5 });

      await ipcMain.invoke('students:add', studentData);

      const [sql, params] = db.runQuery.mock.calls.find(([q]) =>
        q.includes('INSERT INTO students'),
      );
      expect(sql).toContain('fee_category');
      expect(sql).not.toContain('sponsor_');
      expect(params).toContain('EXEMPT');
      expect(studentValidationSchema.validateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ matricule: 'S-2024-005', fee_category: 'EXEMPT' }),
        expect.any(Object),
      );
    });
  });

  describe('students:update with sponsor fields', () => {
    it('should update sponsor information for SPONSORED student', async () => {
      const studentData = {
        name: 'Updated Sponsored Student',
        fee_category: 'SPONSORED',
        sponsor_name: 'Updated Sponsor',
        sponsor_phone: '9876543210',
        sponsor_cin: 'XY654321',
        groupIds: [],
      };

      studentValidationSchema.validateAsync.mockResolvedValue({
        name: 'Updated Sponsored Student',
        fee_category: 'SPONSORED',
        sponsor_name: 'Updated Sponsor',
        sponsor_phone: '9876543210',
        sponsor_cin: 'XY654321',
      });
      db.runQuery.mockResolvedValue({ changes: 1 });

      await ipcMain.invoke('students:update', 1, studentData);

      expect(db.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE students SET'),
        expect.any(Array),
      );
    });
  });

  describe('students:getById with sponsor fields', () => {
    it('should retrieve student with sponsor information', async () => {
      const mockStudent = {
        id: 1,
        name: 'Test Student',
        fee_category: 'SPONSORED',
        sponsor_name: 'Ahmed Ali',
        sponsor_phone: '0123456789',
        sponsor_cin: 'AB123456',
      };
      db.getQuery.mockResolvedValue(mockStudent);

      const result = await ipcMain.invoke('students:getById', 1);

      expect(result).toEqual(mockStudent);
      expect(result.sponsor_name).toBe('Ahmed Ali');
      expect(result.sponsor_phone).toBe('0123456789');
      expect(result.sponsor_cin).toBe('AB123456');
    });
  });
});
