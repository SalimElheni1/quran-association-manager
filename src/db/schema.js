const schema = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    first_name TEXT,
    last_name TEXT,
    date_of_birth DATE,
    national_id TEXT UNIQUE,
    email TEXT UNIQUE,
    phone_number TEXT,
    occupation TEXT,
    civil_status TEXT CHECK(civil_status IN ('Single', 'Married', 'Divorced', 'Widowed')),
    employment_type TEXT CHECK(employment_type IN ('volunteer', 'contract')),
    start_date DATE,
    end_date DATE,
    role TEXT NOT NULL CHECK(role IN (
      'Superadmin',
      'Manager',
      'FinanceManager',
      'Admin',
      'SessionSupervisor'
    )),
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    branch_id INTEGER,
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS branches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    location TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    date_of_birth DATE,
    gender TEXT,
    address TEXT,
    contact_info TEXT,
    email TEXT,
    enrollment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'active',
    branch_id INTEGER,
    memorization_level TEXT,
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
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS teachers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    national_id TEXT,
    contact_info TEXT,
    email TEXT,
    address TEXT,
    date_of_birth DATE,
    gender TEXT,
    educational_level TEXT,
    specialization TEXT,
    years_of_experience INTEGER,
    availability TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    branch_id INTEGER,
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS classes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    class_type TEXT,
    teacher_id INTEGER,
    schedule TEXT, -- JSON array of objects, e.g., [{"day": "Monday", "time": "After Asr"}]
    start_date DATE,
    end_date DATE,
    status TEXT DEFAULT 'pending', -- pending, active, completed
    capacity INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    gender TEXT CHECK(gender IN ('women', 'men', 'kids', 'all')) DEFAULT 'all',
    FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS class_students (
    class_id INTEGER NOT NULL,
    student_id INTEGER NOT NULL,
    enrollment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (class_id, student_id),
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS attendance (
    student_id INTEGER NOT NULL,
    class_id INTEGER NOT NULL,
    date TEXT NOT NULL, -- Storing date as YYYY-MM-DD text
    status TEXT NOT NULL CHECK(status IN ('present', 'absent', 'late')),
    PRIMARY KEY (class_id, student_id, date),
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT
  );

  -- Insert default settings if they don't exist
  INSERT OR IGNORE INTO settings (key, value) VALUES
    ('national_association_name', ''),
    ('regional_association_name', ''),
    ('local_branch_name', ''),
    ('national_logo_path', ''),
    ('regional_local_logo_path', ''),
    ('backup_path', ''),
    ('backup_enabled', 'false'),
    ('backup_frequency', 'daily'),
    ('president_full_name', ''),
    ('adultAgeThreshold', '18');
`;

module.exports = schema;
