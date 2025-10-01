// tests/settings.spec.js

// Mock dependencies at the top level
jest.mock('electron');
jest.mock('../src/db/db');
jest.mock('../src/main/backupManager');
// Joi is mocked globally via jest.config.js
jest.mock('../src/main/settingsManager');


const { registerSettingsHandlers } = require('../src/main/handlers/settingsHandlers');
const { ipcMain } = require('electron');
const db = require('../src/db/db');
const backupManager = require('../src/main/backupManager');
const Joi = require('joi');

describe('Settings Handlers IPC', () => {
    let handlers = {};
    let mockRefreshSettings;

    beforeEach(() => {
        jest.clearAllMocks();

        handlers = {};
        ipcMain.handle.mockImplementation((channel, handler) => {
            handlers[channel] = handler;
        });

        mockRefreshSettings = jest.fn();
        registerSettingsHandlers(mockRefreshSettings);

        Joi.object().validateAsync.mockImplementation(data => Promise.resolve(data));
    });

    describe('settings:get', () => {
        it('should fetch and format settings correctly', async () => {
            const mockDbResult = [{ key: 'backup_enabled', value: 'true' }];
            db.isDbOpen.mockReturnValue(true);
            db.allQuery.mockResolvedValue(mockDbResult);

            const result = await handlers['settings:get']();

            expect(result.success).toBe(true);
            expect(result.settings.backup_enabled).toBe(true);
        });
    });

    describe('settings:update', () => {
        const mockSettings = { national_association_name: 'New Name' };

        it('should update settings successfully', async () => {
            db.runQuery.mockResolvedValue({ changes: 1 });
            db.allQuery.mockResolvedValue([]);

            const result = await handlers['settings:update'](null, mockSettings);

            expect(db.runQuery).toHaveBeenCalledWith('BEGIN TRANSACTION;');
            expect(db.runQuery).toHaveBeenCalledWith('COMMIT;');
            expect(backupManager.startScheduler).toHaveBeenCalled();
            expect(mockRefreshSettings).toHaveBeenCalled();
            expect(result.success).toBe(true);
        });

        it('should rollback transaction on error', async () => {
            db.runQuery.mockResolvedValueOnce().mockRejectedValueOnce(new Error('DB write error'));

            const result = await handlers['settings:update'](null, mockSettings);

            expect(db.runQuery).toHaveBeenCalledWith('ROLLBACK;');
            expect(result.success).toBe(false);
      expect(result.message).toContain('فشل تحديث الإعدادات.');
        });
    });
});
