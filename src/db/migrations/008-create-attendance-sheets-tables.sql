-- Migration: Create new tables for the revamped attendance system

-- Create the header table for attendance sheets
CREATE TABLE IF NOT EXISTS attendance_sheets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    seance_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (seance_id) REFERENCES classes(id) ON DELETE CASCADE,
    UNIQUE(seance_id, date)
);

-- Create a trigger to automatically update the updated_at timestamp
CREATE TRIGGER IF NOT EXISTS set_attendance_sheets_updated_at
AFTER UPDATE ON attendance_sheets
FOR EACH ROW
BEGIN
    UPDATE attendance_sheets
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = OLD.id;
END;

-- Create the detail table for individual attendance entries
CREATE TABLE IF NOT EXISTS attendance_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sheet_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('present', 'absent', 'late', 'excused')),
    notes TEXT,
    FOREIGN KEY (sheet_id) REFERENCES attendance_sheets(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    UNIQUE(sheet_id, student_id)
);

-- Indexes to improve query performance
CREATE INDEX IF NOT EXISTS idx_attendance_sheets_date ON attendance_sheets(date);
CREATE INDEX IF NOT EXISTS idx_attendance_entries_sheet_id ON attendance_entries(sheet_id);
CREATE INDEX IF NOT EXISTS idx_attendance_entries_student_id ON attendance_entries(student_id);
