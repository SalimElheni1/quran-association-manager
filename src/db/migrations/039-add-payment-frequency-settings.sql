-- Migration 039: Add payment frequency settings
-- Add settings for controlling payment frequency per class gender

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('men_payment_frequency', 'MONTHLY'),
  ('women_payment_frequency', 'MONTHLY'),
  ('kids_payment_frequency', 'MONTHLY');
