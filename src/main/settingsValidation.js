// src/main/settingsValidation.js
// Joi schema factory for settings payloads. Kept separate from the handler so
// it can be exercised with the real Joi implementation in tests (jest maps
// 'joi' to a mock for handler tests).

// Canonical list of settings keys the application manages. Payloads may carry
// additional rows (e.g. settings imported from backups of older app versions,
// like cloud_backup_enabled/google_connected); those are filtered out before
// validation rather than rejected, so legacy data never blocks saving.
// Retired fee keys still stored by older databases (charge_generation_frequency,
// pre_generate_months_ahead, last_charge_generation_check, men/women/kids_payment_frequency)
// are ignored the same way: nothing reads them; payment frequency now belongs to age groups.
const SETTINGS_KEYS = [
  'national_association_name',
  'regional_association_name',
  'local_branch_name',
  'president_full_name',
  'national_logo_path',
  'regional_local_logo_path',
  'backup_path',
  'backup_enabled',
  'backup_frequency',
  'backup_reminder_enabled',
  'backup_reminder_frequency_days',
  'backup_time',
  'annual_fee',
  'standard_monthly_fee',
  'auto_charge_generation_enabled',
  'academic_year_start_month',
  'charge_generation_day',
  'association_transfer_key',
];

module.exports = function buildSettingsValidationSchema(Joi) {
  return Joi.object({
    national_association_name: Joi.string().allow(''),
    regional_association_name: Joi.string().allow(''),
    local_branch_name: Joi.string().allow(''),
    president_full_name: Joi.string().allow(''),
    national_logo_path: Joi.string().allow(''),
    regional_local_logo_path: Joi.string().allow(''),
    backup_path: Joi.string().allow(''),
    backup_enabled: Joi.boolean(),
    backup_frequency: Joi.string().valid('daily', 'weekly', 'monthly'),

    backup_reminder_enabled: Joi.boolean(),
    backup_reminder_frequency_days: Joi.number().integer().min(1).max(365),
    backup_time: Joi.string()
      .pattern(/^([01]\d|2[0-3]):[0-5]\d$/)
      .allow(''),
    annual_fee: Joi.number().min(0).allow(null),
    standard_monthly_fee: Joi.number().min(0).allow(null),
    auto_charge_generation_enabled: Joi.boolean(),
    academic_year_start_month: Joi.number().integer().min(1).max(12),
    charge_generation_day: Joi.number().integer().min(1).max(28),
    association_transfer_key: Joi.string().allow(''),
  });
};

module.exports.SETTINGS_KEYS = SETTINGS_KEYS;
