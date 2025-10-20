-- Drop the unique constraint on item_name to allow duplicate item names

-- SQLite doesn't support DROP CONSTRAINT directly, so we need to recreate the table
CREATE TABLE inventory_items_temp (
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
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO inventory_items_temp SELECT * FROM inventory_items;

DROP TABLE inventory_items;

ALTER TABLE inventory_items_temp RENAME TO inventory_items;
