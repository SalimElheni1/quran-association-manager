-- Migration to create the new attendance system tables and drop the old one.

-- Create a header table for attendance sheets.
-- Each row represents a single attendance session for a specific class on a specific date.
CREATE TABLE IF NOT EXISTS attendance_sheets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    seance_id INTEGER NOT NULL,
    date TEXT NOT NULL, -- Storing date as YYYY-MM-DD text
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER, -- Optional: user_id of who created it
    FOREIGN KEY (seance_id) REFERENCES classes(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE(seance_id, date) -- Enforce one sheet per class per day
);

-- Create a detail table for individual attendance entries.
-- Each row links a student to a specific attendance sheet with a status.
CREATE TABLE IF NOT EXISTS attendance_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sheet_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('present', 'absent', 'late', 'excused')), -- 'excused' is a useful addition
    note TEXT, -- Optional: for reasons of absence/lateness
    FOREIGN KEY (sheet_id) REFERENCES attendance_sheets(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

-- Drop the old, flat attendance table as it's being replaced.
DROP TABLE IF EXISTS attendance;

-- Add indexes for performance optimization.
CREATE INDEX IF NOT EXISTS idx_attendance_sheets_seance_id ON attendance_sheets(seance_id);
CREATE INDEX IF NOT EXISTS idx_attendance_sheets_date ON attendance_sheets(date);
CREATE INDEX IF NOT EXISTS idx_attendance_entries_sheet_id ON attendance_entries(sheet_id);
