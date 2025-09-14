CREATE TABLE IF NOT EXISTS export_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK(type IN ('docx', 'pdf_html')),
  content BLOB NOT NULL,
  is_default INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER IF NOT EXISTS set_timestamp_on_export_templates_update
AFTER UPDATE ON export_templates
FOR EACH ROW
BEGIN
  UPDATE export_templates
  SET updated_at = CURRENT_TIMESTAMP
  WHERE id = old.id;
END;
