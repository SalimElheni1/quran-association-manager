// tests/settingsSchema.spec.js
// Verifies the real Joi settings schema accepts the association transfer key
// and other settings payloads (regression: "association_transfer_key is not
// allowed" when saving settings).

jest.mock('electron');
jest.mock('../src/db/db');
jest.mock('../src/main/backupManager');
jest.mock('../src/main/settingsManager');

// Load the real joi package directly (bypasses the jest moduleNameMapper
// mock for 'joi') to exercise actual schema validation.
const realJoi = require('../node_modules/joi/lib/index.js');
const buildSettingsValidationSchema = require('../src/main/settingsValidation');
const settingsValidationSchema = buildSettingsValidationSchema(realJoi);

describe('settingsValidationSchema (real Joi)', () => {
  it('accepts the association_transfer_key setting', async () => {
    const value = await settingsValidationSchema.validateAsync({
      association_transfer_key: 'my-transfer-secret',
      national_association_name: 'الرابطة الوطنية للقرآن الكريم',
    });
    expect(value.association_transfer_key).toBe('my-transfer-secret');
  });

  it('accepts an empty association_transfer_key', async () => {
    const value = await settingsValidationSchema.validateAsync({
      association_transfer_key: '',
    });
    expect(value.association_transfer_key).toBe('');
  });

  it('accepts a full settings payload', async () => {
    const value = await settingsValidationSchema.validateAsync({
      national_association_name: 'الرابطة الوطنية للقرآن الكريم',
      regional_association_name: '',
      local_branch_name: '',
      president_full_name: '',
      national_logo_path: 'assets/logos/icon.png',
      regional_local_logo_path: '',
      backup_path: '',
      backup_enabled: true,
      backup_frequency: 'weekly',
      backup_reminder_enabled: true,
      backup_reminder_frequency_days: 7,
      backup_time: '02:00',
      annual_fee: 200,
      standard_monthly_fee: 50,
      auto_charge_generation_enabled: true,
      charge_generation_frequency: 'daily',
      pre_generate_months_ahead: 2,
      men_payment_frequency: 'MONTHLY',
      women_payment_frequency: 'ANNUAL',
      kids_payment_frequency: 'MONTHLY',
      academic_year_start_month: 9,
      charge_generation_day: 25,
      last_charge_generation_check: '',
      association_transfer_key: 'secret',
    });
    expect(value.association_transfer_key).toBe('secret');
  });

  it('rejects unknown settings keys', async () => {
    await expect(settingsValidationSchema.validateAsync({ some_unknown_key: 'x' })).rejects.toThrow(
      'not allowed',
    );
  });
});

describe('internalUpdateSettingsHandler (legacy settings rows)', () => {
  const Joi = require('joi');
  const db = require('../src/db/db');
  const { internalUpdateSettingsHandler } = require('../src/main/handlers/settingsHandlers');

  beforeEach(() => {
    jest.clearAllMocks();
    Joi.object().validateAsync.mockImplementation((data) => Promise.resolve(data));
    db.runQuery.mockResolvedValue({ changes: 1 });
  });

  it('filters out legacy settings rows (cloud_backup_enabled etc.) so saving never fails', async () => {
    const result = await internalUpdateSettingsHandler({
      national_association_name: 'الرابطة الوطنية للقرآن الكريم',
      association_transfer_key: 'transfer-secret',
      cloud_backup_enabled: 'false',
      google_account_email: 'old@example.com',
      google_connected: 'false',
    });

    expect(result.success).toBe(true);
    expect(db.runQuery).toHaveBeenCalledWith(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
      ['association_transfer_key', 'transfer-secret'],
    );
    expect(db.runQuery).not.toHaveBeenCalledWith(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
      ['cloud_backup_enabled', 'false'],
    );
    expect(db.runQuery).not.toHaveBeenCalledWith(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
      ['google_connected', 'false'],
    );
  });
});
