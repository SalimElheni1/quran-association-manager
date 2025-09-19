const path = require('path');
const { ipcMain } = require('electron');
const { initializeTestDatabase, closeDatabase, getQuery, runQuery } = require('../src/db/db');
const { registerTeacherHandlers } = require('../src/main/handlers/teacherHandlers');

// Mock the matricule service
jest.mock('../src/main/matriculeService', () => ({
    generateMatricule: jest.fn().mockResolvedValue('T-000001'),
}));

describe('Teacher Handlers', () => {
    beforeAll(async () => {
        const dbPath = path.join(__dirname, 'test-teacher.sqlite');
        await initializeTestDatabase(dbPath);
        registerTeacherHandlers();
    });

    afterAll(async () => {
        await closeDatabase();
    });

    afterEach(async () => {
        await runQuery('DELETE FROM teachers');
        await runQuery("DELETE FROM sqlite_sequence WHERE name='teachers'");
    });

    describe('teachers:add', () => {
        it('should add a new teacher correctly', async () => {
            const teacherData = {
                name: 'Test Teacher',
                contact_info: '12345678',
                email: 'teacher@test.com',
                address: '123 Test St',
                date_of_birth: '1980-01-01',
                gender: 'Female',
                educational_level: 'Masters',
                specialization: 'Quranic Studies',
                years_of_experience: 10,
                availability: 'Full-time',
                notes: 'Test note',
            };

            const result = await ipcMain.invoke('teachers:add', teacherData);
            expect(result).toHaveProperty('id');

            const insertedTeacher = await getQuery('SELECT * FROM teachers WHERE id = ?', [result.id]);
            expect(insertedTeacher.name).toBe(teacherData.name);
            expect(insertedTeacher.email).toBe(teacherData.email);
            expect(insertedTeacher.contact_info).toBe(teacherData.contact_info);
        });

        it('should reject adding a teacher with invalid data', async () => {
            const invalidTeacherData = {
                name: 'T', // Too short
                contact_info: '123', // Too short
            };

            await expect(ipcMain.invoke('teachers:add', invalidTeacherData))
                .rejects.toThrow(/بيانات غير صالحة/);
        });
    });
});
