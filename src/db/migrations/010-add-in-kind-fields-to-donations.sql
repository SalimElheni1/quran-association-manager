-- Migration: Add quantity and category to in-kind donations

-- Add quantity for in-kind items
ALTER TABLE donations ADD COLUMN quantity INTEGER;

-- Add category for in-kind items
ALTER TABLE donations ADD COLUMN category TEXT;
