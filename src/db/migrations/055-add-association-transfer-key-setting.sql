-- Migration: Add Association Transfer Key setting
-- Description: Introduces the shared transfer key used to encrypt/decrypt
-- cross-device .qdb backups. Only affects existing installs; fresh
-- databases get this key from the base schema seed.
-- Existing rows and settings are untouched.

INSERT OR IGNORE INTO settings (key, value) VALUES ('association_transfer_key', '');