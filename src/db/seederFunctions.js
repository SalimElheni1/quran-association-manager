const bcrypt = require('bcryptjs');
const { getQuery, runQuery, allQuery } = require('./db');
const { log, error: logError } = require('../main/logger');

const getDobFromAge = (age) => {
  const today = new Date();
  const year = today.getFullYear() - age;
  return new Date(year, today.getMonth(), today.getDate()).toISOString().split('T')[0];
};

// Comprehensive Dummy Data

const dummyBranches = [
  { name: 'الفرع الرئيسي', location: 'تونس العاصمة - المدينة' },
  { name: 'فرع المنار', location: 'تونس العاصمة - المنار' },
  { name: 'فرع أريانة', location: 'أريانة - السيجومي' },
  { name: 'فرع بن عروس', location: 'بن عروس - حمام الشط' },
  { name: 'فرع منوبة', location: 'منوبة - طبربة' },
];

const dummyUsers = [
  // Superadmins
  {
    username: 'superadmin',
    password: 'Admin123!',
    first_name: 'محمد',
    last_name: 'الأمين',
    email: 'superadmin@quran-center.tn',
    phone_number: '+21650123456',
    role: 'Superadmin',
    employment_type: 'contract',
    start_date: '2020-01-01',
    status: 'active',
    national_id: '12345678901',
    date_of_birth: '1980-05-15',
    occupation: 'مدير عام',
    civil_status: 'Married',
  },
  // Managers
  {
    username: 'manager1',
    password: 'password123',
    first_name: 'أحمد',
    last_name: 'محمود',
    email: 'manager1@quran-center.tn',
    phone_number: '+21651123456',
    role: 'Manager',
    employment_type: 'contract',
    start_date: '2023-01-01',
    status: 'active',
    national_id: '12345678902',
    date_of_birth: '1985-03-20',
    occupation: 'مدير فرع',
    civil_status: 'Married',
  },
  {
    username: 'manager2',
    password: 'password123',
    first_name: 'فاطمة',
    last_name: 'الزهراء',
    email: 'manager2@quran-center.tn',
    phone_number: '+21652123456',
    role: 'Manager',
    employment_type: 'contract',
    start_date: '2023-06-01',
    status: 'active',
    national_id: '12345678903',
    date_of_birth: '1988-07-12',
    occupation: 'مديرة فرع',
    civil_status: 'Married',
  },
  // Admins
  {
    username: 'admin1',
    password: 'password123',
    first_name: 'علي',
    last_name: 'الحسن',
    email: 'admin1@quran-center.tn',
    phone_number: '+21653123456',
    role: 'Admin',
    employment_type: 'volunteer',
    start_date: '2023-01-15',
    status: 'active',
    national_id: '12345678904',
    date_of_birth: '1990-01-10',
    occupation: 'مساعد إداري',
    civil_status: 'Single',
  },
  // Session Supervisors
  {
    username: 'supervisor1',
    password: 'password123',
    first_name: 'خديجة',
    last_name: 'الكبير',
    email: 'supervisor1@quran-center.tn',
    phone_number: '+21654123456',
    role: 'SessionSupervisor',
    employment_type: 'volunteer',
    start_date: '2023-02-01',
    status: 'active',
    national_id: '12345678905',
    date_of_birth: '1982-11-25',
    occupation: 'مشرفة جلسات',
    civil_status: 'Married',
  },
];

const dummyTeachers = [
  {
    name: 'الشيخ خالد بن الوليد',
    gender: 'Male',
    specialization: 'تجويد وتلاوة',
    email: 'khalid.teacher@quran-center.tn',
    contact_info: '+21660123456',
    address: 'تونس العاصمة - المدينة',
    date_of_birth: '1975-03-15',
    educational_level: 'جامعي - شريعة',
    years_of_experience: 15,
    availability: 'دوام كامل',
  },
  {
    name: 'الشيخة أم سلمة',
    gender: 'Female',
    specialization: 'تجويد للنساء',
    email: 'um.salma.teacher@quran-center.tn',
    contact_info: '+21660223456',
    address: 'تونس العاصمة - المنار',
    date_of_birth: '1980-07-20',
    educational_level: 'جامعي - أصول الدين',
    years_of_experience: 12,
    availability: 'دوام كامل',
  },
  {
    name: 'الشيخ عبد الرحمن',
    gender: 'Male',
    specialization: 'حفظ القرآن',
    email: 'abdul.rahman.teacher@quran-center.tn',
    contact_info: '+21660333456',
    address: 'أريانة - السيجومي',
    date_of_birth: '1978-09-10',
    educational_level: 'جامعي - القرآن الكريم',
    years_of_experience: 18,
    availability: 'دوام جزئي',
  },
  {
    name: 'الشيخة فاطمة الزهراء',
    gender: 'Female',
    specialization: 'تعليم الأطفال',
    email: 'fatima.teacher@quran-center.tn',
    contact_info: '+21660443456',
    address: 'بن عروس - حمام الشط',
    date_of_birth: '1985-04-05',
    educational_level: 'جامعي - تربية إسلامية',
    years_of_experience: 8,
    availability: 'دوام كامل',
  },
];

const dummyStudents = [
  // Male Kids
  {
    name: 'أحمد محمد الصغير',
    gender: 'Male',
    age: 8,
    status: 'active',
    address: 'تونس العاصمة - المدينة',
    contact_info: '+21670123456',
    email: 'ahmed.student@quran-center.tn',
    parent_name: 'محمد الصغير',
    parent_contact: '+21670123456',
    memorization_level: 'الجزء 1-5',
    school_name: 'مدرسة ابن خلدون',
    grade_level: 'الصف الثالث',
  },
  {
    name: 'يوسف علي الحسن',
    gender: 'Male',
    age: 12,
    status: 'active',
    address: 'تونس العاصمة - المنار',
    contact_info: '+21670223456',
    email: 'youssef.student@quran-center.tn',
    parent_name: 'علي الحسن',
    parent_contact: '+21670223456',
    memorization_level: 'الجزء 6-10',
    school_name: 'مدرسة الزهراء',
    grade_level: 'الصف السادس',
  },
  // Female Kids
  {
    name: 'فاطمة الزهراء محمد',
    gender: 'Female',
    age: 9,
    status: 'active',
    address: 'تونس العاصمة - المدينة',
    contact_info: '+21670443456',
    email: 'fatima.student@quran-center.tn',
    parent_name: 'محمد الزهراء',
    parent_contact: '+21670443456',
    memorization_level: 'الجزء 1-3',
    school_name: 'مدرسة فاطمة الزهراء',
    grade_level: 'الصف الرابع',
  },
  {
    name: 'عائشة عبد الله',
    gender: 'Female',
    age: 11,
    status: 'active',
    address: 'بن عروس - حمام الشط',
    contact_info: '+21670553456',
    email: 'aicha.student@quran-center.tn',
    parent_name: 'عبد الله',
    parent_contact: '+21670553456',
    memorization_level: 'الجزء 4-7',
    school_name: 'مدرسة عائشة',
    grade_level: 'الصف الخامس',
  },
  // Adult Men
  {
    name: 'عمر خالد المبارك',
    gender: 'Male',
    age: 25,
    status: 'active',
    address: 'أريانة - السيجومي',
    contact_info: '+21670333456',
    email: 'omar.student@quran-center.tn',
    memorization_level: 'الجزء 11-15',
    occupation: 'مهندس',
    civil_status: 'Single',
  },
  {
    name: 'علي بن سالم',
    gender: 'Male',
    age: 42,
    status: 'active',
    address: 'تونس - باردو',
    contact_info: '+21671111222',
    email: 'ali.salem.student@quran-center.tn',
    memorization_level: 'كاملاً',
    occupation: 'طبيب',
    civil_status: 'Married',
  },
  // Adult Women
  {
    name: 'سارة إبراهيم',
    gender: 'Female',
    age: 28,
    status: 'active',
    address: 'منوبة - طبربة',
    contact_info: '+21670663456',
    email: 'sarah.student@quran-center.tn',
    memorization_level: 'الجزء 8-12',
    occupation: 'معلمة',
    civil_status: 'Married',
  },
  {
    name: 'مريم بنت أحمد',
    gender: 'Female',
    age: 35,
    status: 'inactive',
    address: 'بن عروس - المروج',
    contact_info: '+21672222333',
    email: 'mariem.ahmed.student@quran-center.tn',
    memorization_level: '15 جزء',
    occupation: 'ربة منزل',
    civil_status: 'Married',
  },
];

const getDummyClasses = (teacherIds) => {
  return [
    {
      name: 'فصل التجويد للرجال - الصباح',
      gender: 'men',
      status: 'active',
      teacher_id: teacherIds.male[0],
      class_type: 'تجويد',
      capacity: 20,
      schedule: JSON.stringify({ days: ['السبت', 'الأحد'], time: '08:00-10:00' }),
      start_date: '2024-01-15',
    },
    {
      name: 'فصل الحفظ للنساء - المساء',
      gender: 'women',
      status: 'active',
      teacher_id: teacherIds.female[0],
      class_type: 'حفظ',
      capacity: 15,
      schedule: JSON.stringify({ days: ['الاثنين', 'الأربعاء'], time: '18:00-20:00' }),
      start_date: '2024-01-20',
    },
    {
      name: 'فصل الأطفال التمهيدي - الصباح',
      gender: 'kids',
      status: 'active',
      teacher_id: teacherIds.male[1],
      class_type: 'تمهيدي',
      capacity: 25,
      schedule: JSON.stringify({ days: ['السبت', 'الأحد'], time: '09:00-11:00' }),
      start_date: '2024-02-01',
    },
    {
      name: 'فصل التفسير المتقدم',
      gender: 'all',
      status: 'pending',
      teacher_id: teacherIds.male[2],
      class_type: 'تفسير',
      capacity: 30,
      schedule: JSON.stringify({ days: ['الجمعة'], time: '14:00-16:00' }),
      start_date: '2024-02-15',
    },
  ];
};

// Seeding Functions

async function seedBranches() {
  log('Seeding branches...');
  try {
    const { count } = await getQuery('SELECT COUNT(*) as count FROM branches');
    if (count > 0) {
      log('Branches already exist, skipping...');
      return;
    }

    for (const branch of dummyBranches) {
      const sql = `INSERT INTO branches (name, location) VALUES (?, ?)`;
      await runQuery(sql, [branch.name, branch.location]);
    }
    log('Successfully seeded 5 branches');
  } catch (error) {
    logError('Error seeding branches:', error);
    throw error;
  }
}

async function seedUsers() {
  log('Seeding users...');
  try {
    const existingUsers = await allQuery('SELECT username FROM users');
    const existingUsernames = existingUsers.map((user) => user.username);

    let insertedCount = 0;
    for (const user of dummyUsers) {
      if (existingUsernames.includes(user.username)) {
        log(`User with username '${user.username}' already exists. Skipping...`);
        continue;
      }

      const hashedPassword = bcrypt.hashSync(user.password, 10);
      const sql = `INSERT INTO users (username, password, first_name, last_name, email, phone_number, role, employment_type, start_date, status, national_id, date_of_birth, occupation, civil_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
      await runQuery(sql, [
        user.username,
        hashedPassword,
        user.first_name,
        user.last_name,
        user.email,
        user.phone_number,
        user.role,
        user.employment_type,
        user.start_date,
        user.status,
        user.national_id,
        user.date_of_birth,
        user.occupation,
        user.civil_status,
      ]);
      insertedCount++;
    }
    log(`Successfully seeded ${insertedCount} users`);
  } catch (error) {
    logError('Error seeding users:', error);
    throw error;
  }
}

async function seedTeachers() {
  log('Seeding teachers...');
  try {
    const { count } = await getQuery('SELECT COUNT(*) as count FROM teachers');
    if (count > 0) {
      log('Teachers already exist, skipping...');
      return;
    }

    let insertedCount = 0;
    for (const teacher of dummyTeachers) {
      const sql = `INSERT INTO teachers (
        name,
        gender,
        specialization,
        email,
        contact_info,
        address,
        date_of_birth,
        educational_level,
        years_of_experience,
        availability
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

      await runQuery(sql, [
        teacher.name,
        teacher.gender,
        teacher.specialization,
        teacher.email,
        teacher.contact_info,
        teacher.address,
        teacher.date_of_birth,
        teacher.educational_level,
        teacher.years_of_experience,
        teacher.availability,
      ]);
      insertedCount++;
    }
    log(`Successfully seeded ${insertedCount} teachers`);
  } catch (error) {
    logError('Error seeding teachers:', error);
    throw error;
  }
}

async function seedStudents() {
  log('Seeding students...');
  try {
    const { count } = await getQuery('SELECT COUNT(*) as count FROM students');
    if (count > 0) {
      log('Students already exist, skipping...');
      return;
    }

    let insertedCount = 0;
    for (const student of dummyStudents) {
      const dateOfBirth = getDobFromAge(student.age);
      const sql = `INSERT INTO students (
        name,
        gender,
        date_of_birth,
        status,
        address,
        contact_info,
        email,
        parent_name,
        parent_contact,
        memorization_level,
        school_name,
        grade_level,
        occupation,
        civil_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

      await runQuery(sql, [
        student.name,
        student.gender,
        dateOfBirth,
        student.status || 'active',
        student.address || 'تونس العاصمة',
        student.contact_info || '',
        student.email || '',
        student.parent_name || '',
        student.parent_contact || '',
        student.memorization_level || '',
        student.school_name || '',
        student.grade_level || '',
        student.occupation || '',
        student.civil_status || '',
      ]);
      insertedCount++;
    }
    log(`Successfully seeded ${insertedCount} students`);
  } catch (error) {
    logError('Error seeding students:', error);
    throw error;
  }
}

async function seedClasses() {
  log('Seeding classes...');
  try {
    const { count } = await getQuery('SELECT COUNT(*) as count FROM classes');
    if (count > 0) {
      log('Classes already exist, skipping...');
      return;
    }

    const maleTeachers = await allQuery("SELECT id FROM teachers WHERE gender = 'Male'");
    const femaleTeachers = await allQuery("SELECT id FROM teachers WHERE gender = 'Female'");

    if (maleTeachers.length === 0 || femaleTeachers.length === 0) {
      log('No teachers found, skipping classes seeding...');
      return;
    }

    const teacherIds = {
      male: maleTeachers.map((t) => t.id),
      female: femaleTeachers.map((t) => t.id),
    };

    const classes = getDummyClasses(teacherIds);
    let insertedCount = 0;
    for (const cls of classes) {
      const sql = `INSERT INTO classes (name, gender, status, teacher_id, class_type, capacity, schedule, start_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
      await runQuery(sql, [
        cls.name,
        cls.gender,
        cls.status,
        cls.teacher_id,
        cls.class_type,
        cls.capacity,
        cls.schedule,
        cls.start_date,
      ]);
      insertedCount++;
    }
    log(`Successfully seeded ${insertedCount} classes`);
  } catch (error) {
    logError('Error seeding classes:', error);
    throw error;
  }
}

async function seedEnrollments() {
  log('Seeding enrollments...');
  try {
    const { count } = await getQuery('SELECT COUNT(*) as count FROM class_students');
    if (count > 0) {
      log('Enrollments already exist, skipping...');
      return;
    }

    const classes = await allQuery('SELECT id FROM classes');
    const students = await allQuery('SELECT id FROM students');

    if (classes.length === 0 || students.length === 0) {
      log('No classes or students found, skipping enrollments...');
      return;
    }

    let insertedCount = 0;
    for (let i = 0; i < Math.min(classes.length * 3, students.length); i++) {
      const sql = `INSERT INTO class_students (class_id, student_id) VALUES (?, ?)`;
      await runQuery(sql, [classes[i % classes.length].id, students[i % students.length].id]);
      insertedCount++;
    }
    log(`Successfully seeded ${insertedCount} enrollments`);
  } catch (error) {
    logError('Error seeding enrollments:', error);
    throw error;
  }
}

async function seedAttendance() {
  log('Seeding attendance...');
  try {
    const { count } = await getQuery('SELECT COUNT(*) as count FROM attendance');
    if (count > 0) {
      log('Attendance already exists, skipping...');
      return;
    }

    const enrollments = await allQuery('SELECT class_id, student_id FROM class_students');
    if (enrollments.length === 0) {
      log('No enrollments found, skipping attendance...');
      return;
    }

    let insertedCount = 0;
    const today = new Date().toISOString().split('T')[0];

    for (let i = 0; i < Math.min(enrollments.length, 50); i++) {
      const sql = `INSERT INTO attendance (class_id, student_id, date, status) VALUES (?, ?, ?, ?)`;
      await runQuery(sql, [
        enrollments[i].class_id,
        enrollments[i].student_id,
        today,
        ['present', 'absent', 'late'][Math.floor(Math.random() * 3)],
      ]);
      insertedCount++;
    }
    log(`Successfully seeded ${insertedCount} attendance records`);
  } catch (error) {
    logError('Error seeding attendance:', error);
    throw error;
  }
}

// Quran Data Seeding
const surahs = [
  { id: 1, name_ar: 'الفاتحة', name_en: 'Al-Fatiha', revelation_type: 'Meccan', verse_count: 7 },
  { id: 2, name_ar: 'البقرة', name_en: 'Al-Baqarah', revelation_type: 'Medinan', verse_count: 286 },
  {
    id: 3,
    name_ar: 'آل عمران',
    name_en: 'Aal-E-Imran',
    revelation_type: 'Medinan',
    verse_count: 200,
  },
  { id: 4, name_ar: 'النساء', name_en: 'An-Nisa', revelation_type: 'Medinan', verse_count: 176 },
  { id: 5, name_ar: 'المائدة', name_en: 'Al-Maidah', revelation_type: 'Medinan', verse_count: 120 },
  { id: 6, name_ar: 'الأنعام', name_en: 'Al-Anam', revelation_type: 'Meccan', verse_count: 165 },
  { id: 7, name_ar: 'الأعراف', name_en: 'Al-Araf', revelation_type: 'Meccan', verse_count: 206 },
  { id: 8, name_ar: 'الأنفال', name_en: 'Al-Anfal', revelation_type: 'Medinan', verse_count: 75 },
  { id: 9, name_ar: 'التوبة', name_en: 'At-Tawbah', revelation_type: 'Medinan', verse_count: 129 },
  { id: 10, name_ar: 'يونس', name_en: 'Yunus', revelation_type: 'Meccan', verse_count: 109 },
  { id: 11, name_ar: 'هود', name_en: 'Hud', revelation_type: 'Meccan', verse_count: 123 },
  { id: 12, name_ar: 'يوسف', name_en: 'Yusuf', revelation_type: 'Meccan', verse_count: 111 },
  { id: 13, name_ar: 'الرعد', name_en: 'Ar-Rad', revelation_type: 'Medinan', verse_count: 43 },
  { id: 14, name_ar: 'إبراهيم', name_en: 'Ibrahim', revelation_type: 'Meccan', verse_count: 52 },
  { id: 15, name_ar: 'الحجر', name_en: 'Al-Hijr', revelation_type: 'Meccan', verse_count: 99 },
  { id: 16, name_ar: 'النحل', name_en: 'An-Nahl', revelation_type: 'Meccan', verse_count: 128 },
  { id: 17, name_ar: 'الإسراء', name_en: 'Al-Isra', revelation_type: 'Meccan', verse_count: 111 },
  { id: 18, name_ar: 'الكهف', name_en: 'Al-Kahf', revelation_type: 'Meccan', verse_count: 110 },
  { id: 19, name_ar: 'مريم', name_en: 'Maryam', revelation_type: 'Meccan', verse_count: 98 },
  { id: 20, name_ar: 'طه', name_en: 'Taha', revelation_type: 'Meccan', verse_count: 135 },
  {
    id: 21,
    name_ar: 'الأنبياء',
    name_en: 'Al-Anbiya',
    revelation_type: 'Meccan',
    verse_count: 112,
  },
  { id: 22, name_ar: 'الحج', name_en: 'Al-Hajj', revelation_type: 'Medinan', verse_count: 78 },
  {
    id: 23,
    name_ar: 'المؤمنون',
    name_en: 'Al-Muminun',
    revelation_type: 'Meccan',
    verse_count: 118,
  },
  { id: 24, name_ar: 'النور', name_en: 'An-Nur', revelation_type: 'Medinan', verse_count: 64 },
  { id: 25, name_ar: 'الفرقان', name_en: 'Al-Furqan', revelation_type: 'Meccan', verse_count: 77 },
  {
    id: 26,
    name_ar: 'الشعراء',
    name_en: 'Ash-Shuara',
    revelation_type: 'Meccan',
    verse_count: 227,
  },
  { id: 27, name_ar: 'النمل', name_en: 'An-Naml', revelation_type: 'Meccan', verse_count: 93 },
  { id: 28, name_ar: 'القصص', name_en: 'Al-Qasas', revelation_type: 'Meccan', verse_count: 88 },
  {
    id: 29,
    name_ar: 'العنكبوت',
    name_en: 'Al-Ankabut',
    revelation_type: 'Meccan',
    verse_count: 69,
  },
  { id: 30, name_ar: 'الروم', name_en: 'Ar-Rum', revelation_type: 'Meccan', verse_count: 60 },
  { id: 31, name_ar: 'لقمان', name_en: 'Luqman', revelation_type: 'Meccan', verse_count: 34 },
  { id: 32, name_ar: 'السجدة', name_en: 'As-Sajdah', revelation_type: 'Meccan', verse_count: 30 },
  { id: 33, name_ar: 'الأحزاب', name_en: 'Al-Ahzab', revelation_type: 'Medinan', verse_count: 73 },
  { id: 34, name_ar: 'سبأ', name_en: 'Saba', revelation_type: 'Meccan', verse_count: 54 },
  { id: 35, name_ar: 'فاطر', name_en: 'Fatir', revelation_type: 'Meccan', verse_count: 45 },
  { id: 36, name_ar: 'يس', name_en: 'Ya-Sin', revelation_type: 'Meccan', verse_count: 83 },
  { id: 37, name_ar: 'الصافات', name_en: 'As-Saffat', revelation_type: 'Meccan', verse_count: 182 },
  { id: 38, name_ar: 'ص', name_en: 'Sad', revelation_type: 'Meccan', verse_count: 88 },
  { id: 39, name_ar: 'الزمر', name_en: 'Az-Zumar', revelation_type: 'Meccan', verse_count: 75 },
  { id: 40, name_ar: 'غافر', name_en: 'Ghafir', revelation_type: 'Meccan', verse_count: 85 },
  { id: 41, name_ar: 'فصلت', name_en: 'Fussilat', revelation_type: 'Meccan', verse_count: 54 },
  { id: 42, name_ar: 'الشورى', name_en: 'Ash-Shura', revelation_type: 'Meccan', verse_count: 53 },
  { id: 43, name_ar: 'الزخرف', name_en: 'Az-Zukhruf', revelation_type: 'Meccan', verse_count: 89 },
  { id: 44, name_ar: 'الدخان', name_en: 'Ad-Dukhan', revelation_type: 'Meccan', verse_count: 59 },
  {
    id: 45,
    name_ar: 'الجاثية',
    name_en: 'Al-Jathiyah',
    revelation_type: 'Meccan',
    verse_count: 37,
  },
  { id: 46, name_ar: 'الأحقاف', name_en: 'Al-Ahqaf', revelation_type: 'Meccan', verse_count: 35 },
  { id: 47, name_ar: 'محمد', name_en: 'Muhammad', revelation_type: 'Medinan', verse_count: 38 },
  { id: 48, name_ar: 'الفتح', name_en: 'Al-Fath', revelation_type: 'Medinan', verse_count: 29 },
  {
    id: 49,
    name_ar: 'الحجرات',
    name_en: 'Al-Hujurat',
    revelation_type: 'Medinan',
    verse_count: 18,
  },
  { id: 50, name_ar: 'ق', name_en: 'Qaf', revelation_type: 'Meccan', verse_count: 45 },
  {
    id: 51,
    name_ar: 'الذاريات',
    name_en: 'Adh-Dhariyat',
    revelation_type: 'Meccan',
    verse_count: 60,
  },
  { id: 52, name_ar: 'الطور', name_en: 'At-Tur', revelation_type: 'Meccan', verse_count: 49 },
  { id: 53, name_ar: 'النجم', name_en: 'An-Najm', revelation_type: 'Meccan', verse_count: 62 },
  { id: 54, name_ar: 'القمر', name_en: 'Al-Qamar', revelation_type: 'Meccan', verse_count: 55 },
  { id: 55, name_ar: 'الرحمن', name_en: 'Ar-Rahman', revelation_type: 'Medinan', verse_count: 78 },
  { id: 56, name_ar: 'الواقعة', name_en: 'Al-Waqiah', revelation_type: 'Meccan', verse_count: 96 },
  { id: 57, name_ar: 'الحديد', name_en: 'Al-Hadid', revelation_type: 'Medinan', verse_count: 29 },
  {
    id: 58,
    name_ar: 'المجادلة',
    name_en: 'Al-Mujadila',
    revelation_type: 'Medinan',
    verse_count: 22,
  },
  { id: 59, name_ar: 'الحشر', name_en: 'Al-Hashr', revelation_type: 'Medinan', verse_count: 24 },
  {
    id: 60,
    name_ar: 'الممتحنة',
    name_en: 'Al-Mumtahanah',
    revelation_type: 'Medinan',
    verse_count: 13,
  },
  { id: 61, name_ar: 'الصف', name_en: 'As-Saff', revelation_type: 'Medinan', verse_count: 14 },
  { id: 62, name_ar: 'الجمعة', name_en: 'Al-Jumuah', revelation_type: 'Medinan', verse_count: 11 },
  {
    id: 63,
    name_ar: 'المنافقون',
    name_en: 'Al-Munafiqun',
    revelation_type: 'Medinan',
    verse_count: 11,
  },
  {
    id: 64,
    name_ar: 'التغابن',
    name_en: 'At-Taghabun',
    revelation_type: 'Medinan',
    verse_count: 18,
  },
  { id: 65, name_ar: 'الطلاق', name_en: 'At-Talaq', revelation_type: 'Medinan', verse_count: 12 },
  { id: 66, name_ar: 'التحريم', name_en: 'At-Tahrim', revelation_type: 'Medinan', verse_count: 12 },
  { id: 67, name_ar: 'الملك', name_en: 'Al-Mulk', revelation_type: 'Meccan', verse_count: 30 },
  { id: 68, name_ar: 'القلم', name_en: 'Al-Qalam', revelation_type: 'Meccan', verse_count: 52 },
  { id: 69, name_ar: 'الحاقة', name_en: 'Al-Haqqah', revelation_type: 'Meccan', verse_count: 52 },
  { id: 70, name_ar: 'المعارج', name_en: 'Al-Maarij', revelation_type: 'Meccan', verse_count: 44 },
  { id: 71, name_ar: 'نوح', name_en: 'Nuh', revelation_type: 'Meccan', verse_count: 28 },
  { id: 72, name_ar: 'الجن', name_en: 'Al-Jinn', revelation_type: 'Meccan', verse_count: 28 },
  {
    id: 73,
    name_ar: 'المزمل',
    name_en: 'Al-Muzzammil',
    revelation_type: 'Meccan',
    verse_count: 20,
  },
  {
    id: 74,
    name_ar: 'المدثر',
    name_en: 'Al-Muddaththir',
    revelation_type: 'Meccan',
    verse_count: 56,
  },
  { id: 75, name_ar: 'القيامة', name_en: 'Al-Qiyamah', revelation_type: 'Meccan', verse_count: 40 },
  { id: 76, name_ar: 'الإنسان', name_en: 'Al-Insan', revelation_type: 'Medinan', verse_count: 31 },
  {
    id: 77,
    name_ar: 'المرسلات',
    name_en: 'Al-Mursalat',
    revelation_type: 'Meccan',
    verse_count: 50,
  },
  { id: 78, name_ar: 'النبأ', name_en: 'An-Naba', revelation_type: 'Meccan', verse_count: 40 },
  { id: 79, name_ar: 'النازعات', name_en: 'An-Naziat', revelation_type: 'Meccan', verse_count: 46 },
  { id: 80, name_ar: 'عبس', name_en: 'Abasa', revelation_type: 'Meccan', verse_count: 42 },
  { id: 81, name_ar: 'التكوير', name_en: 'At-Takwir', revelation_type: 'Meccan', verse_count: 29 },
  {
    id: 82,
    name_ar: 'الإنفطار',
    name_en: 'Al-Infitar',
    revelation_type: 'Meccan',
    verse_count: 19,
  },
  {
    id: 83,
    name_ar: 'المطففين',
    name_en: 'Al-Mutaffifin',
    revelation_type: 'Meccan',
    verse_count: 36,
  },
  {
    id: 84,
    name_ar: 'الإنشقاق',
    name_en: 'Al-Inshiqaq',
    revelation_type: 'Meccan',
    verse_count: 25,
  },
  { id: 85, name_ar: 'البروج', name_en: 'Al-Buruj', revelation_type: 'Meccan', verse_count: 22 },
  { id: 86, name_ar: 'الطارق', name_en: 'At-Tariq', revelation_type: 'Meccan', verse_count: 17 },
  { id: 87, name_ar: 'الأعلى', name_en: 'Al-Ala', revelation_type: 'Meccan', verse_count: 19 },
  {
    id: 88,
    name_ar: 'الغاشية',
    name_en: 'Al-Ghashiyah',
    revelation_type: 'Meccan',
    verse_count: 26,
  },
  { id: 89, name_ar: 'الفجر', name_en: 'Al-Fajr', revelation_type: 'Meccan', verse_count: 30 },
  { id: 90, name_ar: 'البلد', name_en: 'Al-Balad', revelation_type: 'Meccan', verse_count: 20 },
  { id: 91, name_ar: 'الشمس', name_en: 'Ash-Shams', revelation_type: 'Meccan', verse_count: 15 },
  { id: 92, name_ar: 'الليل', name_en: 'Al-Layl', revelation_type: 'Meccan', verse_count: 21 },
  { id: 93, name_ar: 'الضحى', name_en: 'Ad-Duha', revelation_type: 'Meccan', verse_count: 11 },
  { id: 94, name_ar: 'الشرح', name_en: 'Ash-Sharh', revelation_type: 'Meccan', verse_count: 8 },
  { id: 95, name_ar: 'التين', name_en: 'At-Tin', revelation_type: 'Meccan', verse_count: 8 },
  { id: 96, name_ar: 'العلق', name_en: 'Al-Alaq', revelation_type: 'Meccan', verse_count: 19 },
  { id: 97, name_ar: 'القدر', name_en: 'Al-Qadr', revelation_type: 'Meccan', verse_count: 5 },
  { id: 98, name_ar: 'البينة', name_en: 'Al-Bayyinah', revelation_type: 'Medinan', verse_count: 8 },
  {
    id: 99,
    name_ar: 'الزلزلة',
    name_en: 'Az-Zalzalah',
    revelation_type: 'Medinan',
    verse_count: 8,
  },
  {
    id: 100,
    name_ar: 'العاديات',
    name_en: 'Al-Adiyat',
    revelation_type: 'Meccan',
    verse_count: 11,
  },
  { id: 101, name_ar: 'القارعة', name_en: 'Al-Qariah', revelation_type: 'Meccan', verse_count: 11 },
  {
    id: 102,
    name_ar: 'التكاثر',
    name_en: 'At-Takathur',
    revelation_type: 'Meccan',
    verse_count: 8,
  },
  { id: 103, name_ar: 'العصر', name_en: 'Al-Asr', revelation_type: 'Meccan', verse_count: 3 },
  { id: 104, name_ar: 'الهمزة', name_en: 'Al-Humazah', revelation_type: 'Meccan', verse_count: 9 },
  { id: 105, name_ar: 'الفيل', name_en: 'Al-Fil', revelation_type: 'Meccan', verse_count: 5 },
  { id: 106, name_ar: 'قريش', name_en: 'Quraysh', revelation_type: 'Meccan', verse_count: 4 },
  { id: 107, name_ar: 'الماعون', name_en: 'Al-Maun', revelation_type: 'Meccan', verse_count: 7 },
  { id: 108, name_ar: 'الكوثر', name_en: 'Al-Kawthar', revelation_type: 'Meccan', verse_count: 3 },
  {
    id: 109,
    name_ar: 'الكافرون',
    name_en: 'Al-Kafirun',
    revelation_type: 'Meccan',
    verse_count: 6,
  },
  { id: 110, name_ar: 'النصر', name_en: 'An-Nasr', revelation_type: 'Medinan', verse_count: 3 },
  { id: 111, name_ar: 'المسد', name_en: 'Al-Masad', revelation_type: 'Meccan', verse_count: 5 },
  { id: 112, name_ar: 'الإخلاص', name_en: 'Al-Ikhlas', revelation_type: 'Meccan', verse_count: 4 },
  { id: 113, name_ar: 'الفلق', name_en: 'Al-Falaq', revelation_type: 'Meccan', verse_count: 5 },
  { id: 114, name_ar: 'الناس', name_en: 'An-Nas', revelation_type: 'Meccan', verse_count: 6 },
];

async function seedSurahs() {
  log('Seeding surahs...');
  try {
    const { count } = await getQuery('SELECT COUNT(*) as count FROM surahs');
    if (count > 0) {
      log('Surahs already exist, skipping...');
      return;
    }

    for (const surah of surahs) {
      const sql = `INSERT INTO surahs (id, name_ar, name_en, revelation_type, verse_count) VALUES (?, ?, ?, ?, ?)`;
      await runQuery(sql, [
        surah.id,
        surah.name_ar,
        surah.name_en,
        surah.revelation_type,
        surah.verse_count,
      ]);
    }
    log(`Successfully seeded ${surahs.length} surahs`);
  } catch (error) {
    logError('Error seeding surahs:', error);
    throw error;
  }
}

async function seedHizbs() {
  log('Seeding hizbs...');
  try {
    const { count } = await getQuery('SELECT COUNT(*) as count FROM hizbs');
    if (count > 0) {
      log('Hizbs already exist, skipping...');
      return;
    }

    for (let i = 1; i <= 60; i++) {
      const sql = `INSERT INTO hizbs (id, hizb_number) VALUES (?, ?)`;
      await runQuery(sql, [i, i]);
    }
    log('Successfully seeded 60 hizbs');
  } catch (error) {
    logError('Error seeding hizbs:', error);
    throw error;
  }
}

module.exports = {
  seedBranches,
  seedUsers,
  seedTeachers,
  seedStudents,
  seedClasses,
  seedEnrollments,
  seedAttendance,
  seedSurahs,
  seedHizbs,
};
