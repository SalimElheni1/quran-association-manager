const path = require('path');
const { ipcMain } = require('electron');
const { initializeTestDatabase, closeDatabase, getQuery, runQuery } = require('../src/db/db');
const { registerUserHandlers } = require('../src/main/handlers/userHandlers');
const bcrypt = require('bcryptjs');

const { generateMatricule } = require('../src/main/matriculeService');

// Mock the matricule service
jest.mock('../src/main/matriculeService', () => ({
    generateMatricule: jest.fn(),
}));

const { registerAuthHandlers } = require('../src/main/handlers/authHandlers');

describe('User Handlers', () => {
    beforeAll(async () => {
        const dbPath = path.join(__dirname, 'test-user.sqlite');
        await initializeTestDatabase(dbPath);
        registerUserHandlers();
        registerAuthHandlers();
    });

    beforeEach(() => {
        // Reset the mock before each test
        generateMatricule.mockClear();
        // Default mock implementation
        generateMatricule.mockResolvedValue('U-000001');
    });

    afterAll(async () => {
        await closeDatabase();
    });

    beforeEach(async () => {
        // Reset the mock before each test
        generateMatricule.mockClear();
        // Default mock implementation
        generateMatricule.mockResolvedValue('U-000001');

        await runQuery('DELETE FROM users');
        await runQuery("DELETE FROM sqlite_sequence WHERE name='users'");
    });

    describe('users:add', () => {
        it('should add a new user correctly', async () => {
            const userData = {
                username: 'testuser',
                password: 'password123',
                first_name: 'Test',
                last_name: 'User',
                role: 'Admin',
                email: 'user@test.com',
            };

            generateMatricule.mockResolvedValue('U-000002');

            const result = await ipcMain.invoke('users:add', userData);
            expect(result).toHaveProperty('id');

            const insertedUser = await getQuery('SELECT * FROM users WHERE id = ?', [result.id]);
            expect(insertedUser.username).toBe(userData.username);
            expect(insertedUser.first_name).toBe(userData.first_name);
            expect(insertedUser.role).toBe(userData.role);

            // Verify password was hashed
            const isPasswordMatch = await bcrypt.compare(userData.password, insertedUser.password);
            expect(isPasswordMatch).toBe(true);
        });

        it('should reject adding a user with invalid data', async () => {
            const invalidUserData = {
                username: 'u', // Too short
                password: 'p', // Too short
            };

            await expect(ipcMain.invoke('users:add', invalidUserData))
                .rejects.toThrow(/بيانات غير صالحة/);
        });

        it('should not add a user with a duplicate username', async () => {
            const userData = {
                username: 'duplicateuser',
                password: 'password123',
                first_name: 'Test',
                last_name: 'User',
                role: 'Admin',
            };

            // Mock different matricules for each call
            generateMatricule.mockResolvedValueOnce('U-000002').mockResolvedValueOnce('U-000003');

            // Add the user for the first time
            await ipcMain.invoke('users:add', userData);

            // Try to add the same user again
            await expect(ipcMain.invoke('users:add', userData))
                .rejects.toThrow(/UNIQUE constraint failed: users.username/);
        });
    });
});
