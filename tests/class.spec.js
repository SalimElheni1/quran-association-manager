const path = require('path');
const { ipcMain } = require('electron');
const { initializeTestDatabase, closeDatabase, getQuery, runQuery } = require('../src/db/db');
const { registerClassHandlers } = require('../src/main/handlers/classHandlers');

describe('Class Handlers', () => {
    beforeAll(async () => {
        const dbPath = path.join(__dirname, 'test-class.sqlite');
        await initializeTestDatabase(dbPath);
        registerClassHandlers();
    });

    afterAll(async () => {
        await closeDatabase();
    });

    afterEach(async () => {
        await runQuery('DELETE FROM classes');
        await runQuery("DELETE FROM sqlite_sequence WHERE name='classes'");
    });

    describe('classes:add', () => {
        it('should add a new class correctly', async () => {
            const classData = {
                name: 'Test Class',
                class_type: 'Hifz',
                gender: 'men',
            };

            const result = await ipcMain.invoke('classes:add', classData);
            expect(result).toHaveProperty('id');

            const insertedClass = await getQuery('SELECT * FROM classes WHERE id = ?', [result.id]);
            expect(insertedClass.name).toBe(classData.name);
            expect(insertedClass.class_type).toBe(classData.class_type);
            expect(insertedClass.gender).toBe(classData.gender);
        });

        it('should reject adding a class with invalid data', async () => {
            const invalidClassData = {
                name: 'A', // Too short
            };

            await expect(ipcMain.invoke('classes:add', invalidClassData))
                .rejects.toThrow(/بيانات غير صالحة/);
        });
    });

    describe('classes:update', () => {
        it('should update a class correctly', async () => {
            // Add a class first
            const addResult = await ipcMain.invoke('classes:add', { name: 'Old Name', class_type: 'Hifz', gender: 'men' });
            const classId = addResult.id;

            const updatedClassData = {
                name: 'New Name',
                class_type: 'Tajweed',
                gender: 'women',
            };

            const updateResult = await ipcMain.invoke('classes:update', classId, updatedClassData);
            expect(updateResult).toHaveProperty('changes', 1);

            const fetchedClass = await getQuery('SELECT * FROM classes WHERE id = ?', [classId]);
            expect(fetchedClass.name).toBe(updatedClassData.name);
            expect(fetchedClass.class_type).toBe(updatedClassData.class_type);
            expect(fetchedClass.gender).toBe(updatedClassData.gender);
        });
    });
});
