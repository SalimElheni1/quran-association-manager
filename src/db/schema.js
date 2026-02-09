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
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
    notes TEXT,
    need_guide INTEGER DEFAULT 1,
    current_step INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    branch_id INTEGER,
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS roles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_roles (
    user_id INTEGER NOT NULL,
    role_id INTEGER NOT NULL,
    PRIMARY KEY (user_id, role_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
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
    age_group_id INTEGER,
    FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE SET NULL,
    FOREIGN KEY (age_group_id) REFERENCES age_groups(id) ON DELETE RESTRICT
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

  CREATE TABLE IF NOT EXISTS inventory_items (
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
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(item_name COLLATE NOCASE)
  );

  CREATE TABLE IF NOT EXISTS groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    category TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS student_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    group_id INTEGER NOT NULL,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
    UNIQUE(student_id, group_id)
  );

  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    payment_method TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS salaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    user_type TEXT NOT NULL,
    amount REAL NOT NULL,
    payment_date DATETIME NOT NULL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS donations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    donor_name TEXT NOT NULL,
    amount REAL,
    donation_date DATETIME NOT NULL,
    donation_type TEXT NOT NULL DEFAULT 'Cash',
    description TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS age_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    min_age INTEGER NOT NULL CHECK(min_age >= 0),
    max_age INTEGER NULL CHECK(max_age IS NULL OR max_age >= min_age),
    gender TEXT NOT NULL CHECK(gender IN ('male_only', 'female_only', 'any')),
    gender_policy TEXT DEFAULT 'mixed' CHECK(gender_policy IN ('mixed', 'separated', 'single_gender')),
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    amount REAL NOT NULL,
    expense_date DATETIME NOT NULL,
    responsible_person TEXT,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Insert default settings if they don't exist
  INSERT OR IGNORE INTO settings (key, value) VALUES
    ('national_association_name', 'الرابطة الوطنية للقرآن الكريم'),
    ('regional_association_name', ''),
    ('local_branch_name', ''),
    ('national_logo_path', 'g247.png'),
    ('regional_local_logo_path', ''),
    ('backup_path', ''),
    ('backup_enabled', 'false'),
    ('backup_frequency', 'daily'),
    ('president_full_name', ''),
    ('backup_reminder_enabled', 'true'),
    ('backup_reminder_frequency_days', '7'),
    ('cloud_backup_enabled', 'false'),
    ('cloud_association_key', ''),
    ('cloud_secret_key', '');

  -- Insert default age groups with gender policies
  INSERT OR IGNORE INTO age_groups (uuid, name, description, min_age, max_age, gender, gender_policy, is_active) VALUES
    ('children-6-11', 'الأطفال', 'الأطفال وهم الذين تتراوح أعمارهم بين 6 و 11 سنة', 6, 11, 'any', 'mixed', 1),
    ('youth-boys-12-14', 'الناشئون (ذكور)', 'الناشئون الذكور من 12 إلى 14 سنة', 12, 14, 'male_only', 'separated', 1),
    ('youth-girls-12-14', 'الناشئون (إناث)', 'الناشئون الإناث من 12 إلى 14 سنة', 12, 14, 'female_only', 'separated', 1),
    ('young-adults-boys-15-17', 'الشباب (ذكور)', 'الشباب الذكور من 15 إلى 17 سنة', 15, 17, 'male_only', 'separated', 1),
    ('young-adults-girls-15-17', 'الشباب (إناث)', 'الشباب الإناث من 15 إلى 17 سنة', 15, 17, 'female_only', 'separated', 1),
    ('men-18-plus', 'الرجال', 'الرجال البالغون (18 سنة فما فوق)', 18, NULL, 'male_only', 'single_gender', 1),
    ('women-18-plus', 'النساء', 'النساء البالغات (18 سنة فما فوق)', 18, NULL, 'female_only', 'single_gender', 1);
`;

module.exports = schema;
