-- Create classrooms table
CREATE TABLE IF NOT EXISTS classrooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    capacity INTEGER,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create class_sessions table to handle multi-session timetables
CREATE TABLE IF NOT EXISTS class_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    class_id INTEGER NOT NULL,
    day_of_week TEXT CHECK(day_of_week IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday')) NOT NULL,
    start_time TEXT NOT NULL, -- Format: 'HH:MM'
    end_time TEXT NOT NULL,   -- Format: 'HH:MM'
    classroom_id INTEGER,
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
    FOREIGN KEY (classroom_id) REFERENCES classrooms(id) ON DELETE SET NULL
);

-- Seed default classrooms
INSERT OR IGNORE INTO classrooms (name, capacity, notes) VALUES
  ('القاعة 1 (المسجد)', 25, 'القاعة الرئيسية الكبرى بالقرب من المحراب'),
  ('القاعة 2 (المكتبة)', 15, 'قاعة دراسية مجهزة بمراجع وكتب التجويد'),
  ('القاعة 3 (العلية)', 20, 'القاعة العلوية للدروس الفردية ومجموعات الأطفال');
