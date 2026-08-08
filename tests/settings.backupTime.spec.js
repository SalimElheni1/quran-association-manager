// tests/settings.backupTime.spec.js

jest.mock('electron', () => ({
  ipcMain: { handle: jest.fn() },
  app: { getPath: jest.fn(() => '/tmp'), getAppPath: jest.fn(() => '/tmp') },
  dialog: jest.fn(),
}));
jest.mock('../src/main/logger');
jest.mock('../src/main/feeChargeScheduler', () => ({ startScheduler: jest.fn() }));

const db = require('../src/db/db');

describe('settings - backup_time', () => {
  let internalGetSettingsHandler;
  let internalUpdateSettingsHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    ({
      internalGetSettingsHandler,
      internalUpdateSettingsHandler,
    } = require('../src/main/handlers/settingsHandlers'));
  });

  it('should default backup_time to 02:00 even when the database has no stored value', async () => {
    db.allQuery.mockResolvedValue([]);

    const { settings } = await internalGetSettingsHandler();

    expect(settings.backup_time).toBe('02:00');
  });

  it('should read back a stored backup_time value', async () => {
    db.allQuery.mockResolvedValue([{ key: 'backup_time', value: '06:30' }]);

    const { settings } = await internalGetSettingsHandler();

    expect(settings.backup_time).toBe('06:30');
  });

  it('should write backup_time through the save path', async () => {
    db.runQuery.mockResolvedValue({ id: 1, changes: 1 });

    await internalUpdateSettingsHandler({ backup_time: '03:30' });

    const insertCalls = db.runQuery.mock.calls.filter(([sql]) =>
      sql.includes('INSERT OR REPLACE INTO settings'),
    );
    expect(insertCalls.some(([, params]) => params[0] === 'backup_time')).toBe(true);
    expect(insertCalls.some(([, params]) => params[1] === '03:30')).toBe(true);
  });
});
