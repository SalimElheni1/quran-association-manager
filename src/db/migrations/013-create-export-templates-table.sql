-- 013-create-export-templates-table.sql

CREATE TABLE IF NOT EXISTS export_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('docx', 'pdf_html')), -- Type of the template
    content BLOB NOT NULL, -- The binary content of the template file
    is_default BOOLEAN DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create a trigger to automatically update the updated_at timestamp
CREATE TRIGGER IF NOT EXISTS update_export_templates_updated_at
AFTER UPDATE ON export_templates
FOR EACH ROW
BEGIN
    UPDATE export_templates SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;
