-- Create a table to store all 114 Surahs of the Quran
CREATE TABLE surahs (
    id INTEGER PRIMARY KEY,
    name_ar TEXT NOT NULL,
    name_en TEXT NOT NULL,
    revelation_type TEXT CHECK(revelation_type IN ('Meccan', 'Medinan')),
    verse_count INTEGER NOT NULL
);

-- Create a table for the 60 Hizbs of the Quran
CREATE TABLE hizbs (
    id INTEGER PRIMARY KEY,
    hizb_number INTEGER NOT NULL UNIQUE
);

-- Create a join table to link students to the Surahs they have memorized
CREATE TABLE student_surahs (
    student_id INTEGER NOT NULL,
    surah_id INTEGER NOT NULL,
    PRIMARY KEY (student_id, surah_id),
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (surah_id) REFERENCES surahs(id) ON DELETE CASCADE
);

-- Create a join table to link students to the Hizbs they have memorized
CREATE TABLE student_hizbs (
    student_id INTEGER NOT NULL,
    hizb_id INTEGER NOT NULL,
    PRIMARY KEY (student_id, hizb_id),
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (hizb_id) REFERENCES hizbs(id) ON DELETE CASCADE
);

-- Add a boolean column to the students table to flag full memorizers
ALTER TABLE students ADD COLUMN is_full_memorizer BOOLEAN DEFAULT FALSE;

-- Step 1: Create a new table with the desired schema (without memorization_level)
CREATE TABLE students_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    matricule TEXT UNIQUE,
    name TEXT NOT NULL,
    date_of_birth DATE,
    gender TEXT,
    address TEXT,
    contact_info TEXT,
    email TEXT,
    enrollment_date DATE DEFAULT (date('now')),
    status TEXT DEFAULT 'active',
    notes TEXT,
    parent_name TEXT,
    guardian_relation TEXT,
    parent_contact TEXT,
    guardian_email TEXT,
    emergency_contact_name TEXT,
    emergency_contact_phone TEXT,
    health_conditions TEXT,
    national_id TEXT,
    school_name TEXT,
    grade_level TEXT,
    educational_level TEXT,
    occupation TEXT,
    civil_status TEXT,
    related_family_members TEXT,
    financial_assistance_notes TEXT,
    is_full_memorizer BOOLEAN DEFAULT FALSE
);

-- Step 2: Copy data from the old table to the new table
INSERT INTO students_new (id, matricule, name, date_of_birth, gender, address, contact_info, email, enrollment_date, status, notes, parent_name, guardian_relation, parent_contact, guardian_email, emergency_contact_name, emergency_contact_phone, health_conditions, national_id, school_name, grade_level, educational_level, occupation, civil_status, related_family_members, financial_assistance_notes, is_full_memorizer)
SELECT id, matricule, name, date_of_birth, gender, address, contact_info, email, enrollment_date, status, notes, parent_name, guardian_relation, parent_contact, guardian_email, emergency_contact_name, emergency_contact_phone, health_conditions, national_id, school_name, grade_level, educational_level, occupation, civil_status, related_family_members, financial_assistance_notes, is_full_memorizer FROM students;

-- Step 3: Drop the old table
DROP TABLE students;

-- Step 4: Rename the new table to the original name
ALTER TABLE students_new RENAME TO students;
