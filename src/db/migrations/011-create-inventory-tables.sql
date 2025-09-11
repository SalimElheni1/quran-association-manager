-- Migration: Create inventory_items table for the Inventory Management module

CREATE TABLE IF NOT EXISTS inventory_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  matricule TEXT UNIQUE NOT NULL,
  item_name TEXT NOT NULL,
  category TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  unit_value DECIMAL(10,2),
  total_value DECIMAL(10,2),
  acquisition_date DATE,
  acquisition_source TEXT,
  condition_status TEXT,
  location TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(item_name COLLATE NOCASE)
);
