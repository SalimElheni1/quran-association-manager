-- Migration 040: Add academic year configuration settings
-- Add settings for configurable academic year start and charge generation timing

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('academic_year_start_month', '9'),
  ('charge_generation_day', '25');
