-- Migration: Update expense categories to new structure
-- Description: Replace old expense categories with new grouped categories

-- Delete old expense categories
DELETE FROM categories WHERE type = 'EXPENSE';

-- Insert new expense categories
INSERT OR IGNORE INTO categories (name, type, description, is_active)
VALUES 
  ('منح ومرتبات', 'EXPENSE', 'Grants and salaries', 1),
  ('كراء وفواتير', 'EXPENSE', 'Rent and bills', 1),
  ('الفعاليات والتكوين والتنقلات', 'EXPENSE', 'Events, training and travel', 1),
  ('المسابقات والجوائز', 'EXPENSE', 'Competitions and prizes', 1),
  ('لوازم مكتبية وصيانة', 'EXPENSE', 'Office supplies and maintenance', 1),
  ('نفقات متنوعة', 'EXPENSE', 'Miscellaneous expenses', 1);
