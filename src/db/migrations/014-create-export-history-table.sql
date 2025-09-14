-- 014-create-export-history-table.sql

CREATE TABLE IF NOT EXISTS export_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    export_type TEXT NOT NULL, -- e.g., 'students', 'financial-report', 'batch'
    format TEXT NOT NULL CHECK(format IN ('pdf', 'xlsx', 'csv', 'docx')),
    row_count INTEGER,
    file_path TEXT,
    filters TEXT, -- JSON string of the filters used
    columns TEXT, -- JSON string of the columns exported
    status TEXT NOT NULL CHECK(status IN ('Success', 'Failed')),
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
