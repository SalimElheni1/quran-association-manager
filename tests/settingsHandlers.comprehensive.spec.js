// tests/settingsHandlers.comprehensive.spec.js

const { ipcMain, app } = require('electron');
const db = require('../src/db/db');
const {
  registerSettingsHandlers,
  internalGetSettingsHandler,
} = require('../src/main/handlers/settingsHandlers');
const path = require('path');
const fs = require('fs');

// Mock the studentFeeHandlers to control its behavior
let callCount = 0;
jest.mock('../src/main/handlers/studentFeeHandlers', () => ({
  checkAndGenerateChargesForAllStudents: jest.fn().mockImplementation(() => {
    callCount++;
    if (callCount === 1) {
      return Promise.reject(new Error('First call error'));
    }
    return Promise.resolve({ success: true, studentsProcessed: 10 });
  }),
}));

describe('settings:update IPC Handler - Comprehensive Transaction Test', () => {
  let handlers = {};
  let mockRefreshSettings;

  beforeAll(async () => {
    const dbPath = path.join(__dirname, 'test-settings-db.sqlite');
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }

    await db.init(dbPath);
    await db.runQuery(
      `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );`,
    );
    await db.runQuery(
      `CREATE TABLE IF NOT EXISTS students (
        id INTEGER PRIMARY KEY,
        first_name TEXT,
        last_name TEXT,
        gender TEXT,
        birth_date TEXT
      );`,
    );
  });

  afterAll(async () => {
    await db.close();
    const dbPath = path.join(__dirname, 'test-settings-db.sqlite');
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    callCount = 0; // Reset call count for each test

    // Clear settings table
    await db.runQuery('DELETE FROM settings');
    // Seed with initial data
    await db.runQuery(`
      INSERT INTO settings (key, value) VALUES 
      ('annual_fee', '0'), 
      ('standard_monthly_fee', '0'),
      ('auto_charge_generation_enabled', 'true'),
      ('charge_generation_frequency', 'daily'),
      ('pre_generate_months_ahead', '2'),
      ('men_payment_frequency', 'ANNUAL'),
      ('women_payment_frequency', 'ANNUAL'),
      ('kids_payment_frequency', 'MONTHLY'),
      ('adultAgeThreshold', '18');
    `);

    handlers = {};
    ipcMain.handle.mockImplementation((channel, handler) => {
      handlers[channel] = handler;
    });

    mockRefreshSettings = jest.fn().mockResolvedValue(undefined);
    registerSettingsHandlers(mockRefreshSettings);

    // Mock app path
    app.getPath.mockReturnValue(path.join(__dirname));
  });

  it('should rollback the entire transaction when charge generation fails on the first attempt', async () => {
    const newSettings = {
      annual_fee: '100',
      standard_monthly_fee: '10',
      auto_charge_generation_enabled: true,
      charge_generation_frequency: 'daily',
      pre_generate_months_ahead: 2,
      men_payment_frequency: 'ANNUAL',
      women_payment_frequency: 'ANNUAL',
      kids_payment_frequency: 'MONTHLY',
      adultAgeThreshold: 18,
    };

    // First attempt - should fail and rollback
    const result1 = await handlers['settings:update'](null, newSettings);

    expect(result1.success).toBe(false);
    expect(result1.message).toContain('First call error');

    // Verify that the settings were NOT updated in the database
    const { settings: settingsAfterFailure } = await internalGetSettingsHandler();
    expect(settingsAfterFailure.annual_fee).toBe(0);
    expect(settingsAfterFailure.standard_monthly_fee).toBe(0);

    // Second attempt - should succeed
    const result2 = await handlers['settings:update'](null, newSettings);

    expect(result2.success).toBe(true);
    expect(result2.message).toBe('تم تحديث الإعدادات بنجاح.');

    // Verify that the settings ARE updated in the database
    const { settings: settingsAfterSuccess } = await internalGetSettingsHandler();
    expect(settingsAfterSuccess.annual_fee).toBe(100);
    expect(settingsAfterSuccess.standard_monthly_fee).toBe(10);
  });
});