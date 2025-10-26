-- Migration 036: Add auto fee charge generation settings
-- Add settings for controlling automated fee charge generation

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('auto_charge_generation_enabled', 'true'),
  ('charge_generation_frequency', 'daily'),
  ('pre_generate_months_ahead', '2'),
  ('last_charge_generation_check', NULL);
