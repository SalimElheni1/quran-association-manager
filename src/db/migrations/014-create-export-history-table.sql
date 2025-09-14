CREATE TABLE IF NOT EXISTS export_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  export_type TEXT NOT NULL,
  format TEXT NOT NULL,
  filters TEXT, -- Storing filters as a JSON string
  columns TEXT, -- Storing the selected columns as a JSON string
  row_count INTEGER,
  file_path TEXT,
  status TEXT NOT NULL CHECK(status IN ('Success', 'Failed')),
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
