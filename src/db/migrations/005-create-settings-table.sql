-- Migration: Create the settings table
-- This table uses a key-value structure to store application settings flexibly.

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT
);

-- Insert default values for all settings to ensure they exist in the database on first run.
-- The application can then safely read these keys without errors.
INSERT OR IGNORE INTO settings (key, value) VALUES
    ('national_association_name', ''),
    ('regional_association_name', ''),
    ('local_branch_name', ''),
    ('national_logo_path', ''),
    ('regional_local_logo_path', ''),
    ('backup_path', ''),
    ('backup_enabled', 'false'),
    ('backup_frequency', 'daily'), -- Default to daily, options: daily, weekly, monthly
    ('president_full_name', '');
