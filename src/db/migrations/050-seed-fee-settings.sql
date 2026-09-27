-- Migration 050: Seed default fee settings
-- Ensures fresh databases contain all fee-related settings with sane defaults.
-- Uses INSERT OR IGNORE so existing values are never overwritten.

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('annual_fee', '0'),
  ('standard_monthly_fee', '0'),
  ('men_payment_frequency', 'MONTHLY'),
  ('women_payment_frequency', 'MONTHLY'),
  ('kids_payment_frequency', 'MONTHLY'),
  ('academic_year_start_month', '9'),
  ('charge_generation_day', '25'),
  ('auto_charge_generation_enabled', 'true'),
  ('charge_generation_frequency', 'daily'),
  ('pre_generate_months_ahead', '2'),
  ('last_charge_generation_check', NULL);
