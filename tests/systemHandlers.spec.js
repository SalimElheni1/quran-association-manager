const { handleGetBackupReminderStatus } = require('../src/main/handlers/systemHandlers');
const db = require('../src/db/db');
const Store = require('electron-store');

// Mock dependencies
jest.mock('../src/db/db');
jest.mock('electron-store');

describe('System Handlers', () => {
  let mockStoreGet;

  beforeEach(() => {
    jest.clearAllMocks();
    mockStoreGet = jest.fn();
    Store.mockImplementation(() => {
      return {
        get: mockStoreGet,
      };
    });
  });

  describe('handleGetBackupReminderStatus', () => {
    it('should not show reminder if disabled in settings', async () => {
      db.allQuery.mockResolvedValue([
        { key: 'backup_reminder_enabled', value: 'false' },
      ]);
      const result = await handleGetBackupReminderStatus();
      expect(result.showReminder).toBe(false);
    });

    it('should show reminder if no previous backup exists', async () => {
      db.allQuery.mockResolvedValue([
        { key: 'backup_reminder_enabled', value: 'true' },
      ]);
      mockStoreGet.mockReturnValue(null);
      const result = await handleGetBackupReminderStatus();
      expect(result.showReminder).toBe(true);
      expect(result.daysSinceLastBackup).toBe(Infinity);
    });

    it('should not show reminder if last backup is recent', async () => {
      db.allQuery.mockResolvedValue([
        { key: 'backup_reminder_enabled', value: 'true' },
        { key: 'backup_reminder_frequency_days', value: '7' },
      ]);
      const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
      mockStoreGet.mockReturnValue({ timestamp: twoDaysAgo });
      const result = await handleGetBackupReminderStatus();
      expect(result.showReminder).toBe(false);
    });

    it('should show reminder if last backup is older than frequency', async () => {
      db.allQuery.mockResolvedValue([
        { key: 'backup_reminder_enabled', value: 'true' },
        { key: 'backup_reminder_frequency_days', value: '7' },
      ]);
      const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
      mockStoreGet.mockReturnValue({ timestamp: tenDaysAgo });
      const result = await handleGetBackupReminderStatus();
      expect(result.showReminder).toBe(true);
      expect(result.daysSinceLastBackup).toBe(10);
    });
  });
});
