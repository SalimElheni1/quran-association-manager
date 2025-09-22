// tests/backupManager.spec.js

// Mock all dependencies at the top level
jest.mock('fs', () => ({ promises: { writeFile: jest.fn() } }));
jest.mock('pizzip');
jest.mock('../src/db/db');
jest.mock('../src/main/logger');
jest.mock('../src/main/keyManager');

// A proper mock for electron-store
const mockStore = {
    get: jest.fn(),
    set: jest.fn(),
};
jest.mock('electron-store', () => {
    return jest.fn().mockImplementation(() => mockStore);
});


describe('backupManager', () => {
    let backupManager;
    let db;
    let keyManager;
    let PizZip;
    let fs;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        // Make setInterval return a dummy ID
        global.setInterval = jest.fn(() => 123);
        global.clearInterval = jest.fn();

        backupManager = require('../src/main/backupManager');
        db = require('../src/db/db');
        keyManager = require('../src/main/keyManager');
        PizZip = require('pizzip');
        fs = require('fs').promises;
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    describe('runBackup', () => {
        it('should create backup successfully', async () => {
            const settings = { backup_enabled: true };
            const mockZip = { file: jest.fn(), generate: jest.fn().mockReturnValue(Buffer.from('zip')) };
            PizZip.mockImplementation(() => mockZip);
            keyManager.getDbSalt.mockReturnValue('test-salt');
            db.allQuery
                .mockResolvedValueOnce([{ name: 'students' }])
                .mockResolvedValueOnce([{ id: 1, name: 'John' }]);

            const result = await backupManager.runBackup(settings, '/path/to/backup.qdb');

            expect(result.success).toBe(true);
        });
    });

    describe('isBackupDue', () => {
        it('should return true when no backup has ever run', () => {
            mockStore.get.mockReturnValue(null);
            const result = backupManager.isBackupDue({ backup_frequency: 'daily' });
            expect(result).toBe(true);
        });
    });

    describe('startScheduler', () => {
        it('should start scheduler when backup is enabled', () => {
            backupManager.startScheduler({ backup_enabled: true, backup_frequency: 'daily' });
            expect(global.setInterval).toHaveBeenCalledWith(expect.any(Function), 1000 * 60 * 60);
        });
    });

    describe('stopScheduler', () => {
        it('should stop active scheduler', () => {
            backupManager.startScheduler({ backup_enabled: true });
            const intervalId = global.setInterval.mock.results[0].value;

            backupManager.stopScheduler();
            expect(global.clearInterval).toHaveBeenCalledWith(intervalId);
        });
    });
});
