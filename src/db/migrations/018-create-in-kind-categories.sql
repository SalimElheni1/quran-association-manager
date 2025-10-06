-- Migration: Create in-kind categories table
-- Description: Creates table for managing in-kind donation categories

CREATE TABLE IF NOT EXISTS in_kind_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  is_system INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1
);

-- Seed default in-kind categories
INSERT OR IGNORE INTO in_kind_categories (name, is_system, is_active)
VALUES 
  ('إلكترونيات', 0, 1),
  ('كتب ومراجع', 0, 1),
  ('Bureautique', 0, 1),
  ('أخرى', 1, 1);
