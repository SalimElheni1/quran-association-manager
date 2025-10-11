-- Migration: Update income categories to simplified structure
-- Description: Remove old income categories and keep only 3

-- Delete old income categories
DELETE FROM categories WHERE type = 'INCOME';

-- Insert new simplified income categories
INSERT OR IGNORE INTO categories (name, type, description, is_active)
VALUES 
  ('التبرعات النقدية', 'INCOME', 'Cash donations', 1),
  ('التبرعات العينية', 'INCOME', 'In-kind donations', 1),
  ('مداخيل أخرى', 'INCOME', 'Other income', 1);
