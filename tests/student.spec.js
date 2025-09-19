const path = require('path');
const { ipcMain } = require('electron');
const { initializeTestDatabase, closeDatabase, getQuery, runQuery } = require('../src/db/db');
const { registerStudentHandlers } = require('../src/main/handlers/studentHandlers');
const { studentValidationSchema } = require('../src/main/validationSchemas');

// Mock the matricule service
jest.mock('../src/main/matriculeService', () => ({
  generateMatricule: jest.fn().mockResolvedValue('S-000001'),
}));

// We are not mocking the db, we want to use the real db for these tests
// jest.mock('../src/db/db');

describe('Student Handlers', () => {
  beforeAll(async () => {
    const dbPath = path.join(__dirname, 'test-student.sqlite');
    await initializeTestDatabase(dbPath);
    registerStudentHandlers();
  });

  afterAll(async () => {
    await closeDatabase();
  });

  afterEach(async () => {
    await runQuery('DELETE FROM student_groups');
    await runQuery('DELETE FROM students');
    // Reset the SQLite sequence for the students table to ensure IDs start from 1 for each test
    await runQuery("DELETE FROM sqlite_sequence WHERE name='students'");
  });

  describe('students:add', () => {
    it('should add a new "kid" student correctly', async () => {
      const kidStudentData = {
        name: 'Kid Student',
        date_of_birth: '2015-01-01', // 10 years old
        gender: 'Male',
        parent_name: 'John Doe',
        parent_contact: '12345678',
      };

      const result = await ipcMain.invoke('students:add', kidStudentData);
      expect(result).toHaveProperty('id');

      const insertedStudent = await getQuery('SELECT * FROM students WHERE id = ?', [result.id]);
      expect(insertedStudent.name).toBe(kidStudentData.name);
      expect(insertedStudent.gender).toBe(kidStudentData.gender);
      expect(insertedStudent.parent_name).toBe(kidStudentData.parent_name);
    });

    it('should add a new "teen" student correctly', async () => {
      const teenStudentData = {
        name: 'Teen Student',
        date_of_birth: '2008-01-01', // 17 years old
        gender: 'Female',
        contact_info: '87654321',
        national_id: '12345678',
      };

      const result = await ipcMain.invoke('students:add', teenStudentData);
      expect(result).toHaveProperty('id');

      const insertedStudent = await getQuery('SELECT * FROM students WHERE id = ?', [result.id]);
      expect(insertedStudent.name).toBe(teenStudentData.name);
      expect(insertedStudent.contact_info).toBe(teenStudentData.contact_info);
      expect(insertedStudent.national_id).toBe(teenStudentData.national_id);
    });

    it('should add a new "adult" student correctly', async () => {
      const adultStudentData = {
        name: 'Adult Student',
        date_of_birth: '1995-01-01', // 30 years old
        gender: 'Male',
        occupation: 'Engineer',
        civil_status: 'Married',
      };

      const result = await ipcMain.invoke('students:add', adultStudentData);
      expect(result).toHaveProperty('id');

      const insertedStudent = await getQuery('SELECT * FROM students WHERE id = ?', [result.id]);
      expect(insertedStudent.name).toBe(adultStudentData.name);
      expect(insertedStudent.occupation).toBe(adultStudentData.occupation);
      expect(insertedStudent.civil_status).toBe(adultStudentData.civil_status);
    });

    it('should add a student and assign them to a group', async () => {
        // First, add a group to the database to assign the student to.
        const groupRes = await runQuery("INSERT INTO groups (name, description, category) VALUES ('Test Group', 'A group for testing', 'Kids')");
        const groupId = groupRes.id;

        const studentData = {
            name: 'Group Student',
            date_of_birth: '2000-01-01',
            groupIds: [groupId],
        };

        const result = await ipcMain.invoke('students:add', studentData);
        expect(result).toHaveProperty('id');
        const studentId = result.id;

        const insertedStudent = await getQuery('SELECT * FROM students WHERE id = ?', [studentId]);
        expect(insertedStudent.name).toBe(studentData.name);

        const groupAssignment = await getQuery(
            'SELECT * FROM student_groups WHERE student_id = ? AND group_id = ?',
            [studentId, groupId]
        );
        expect(groupAssignment).not.toBeNull();
        expect(groupAssignment.student_id).toBe(studentId);
        expect(groupAssignment.group_id).toBe(groupId);
    });

    it('should reject adding a student with invalid data', async () => {
      const invalidStudentData = {
        name: 'A', // Too short
        email: 'not-an-email',
      };

      await expect(ipcMain.invoke('students:add', invalidStudentData))
        .rejects.toThrow(/بيانات غير صالحة/);
    });
  });
});
