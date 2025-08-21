const bcrypt = require('bcryptjs');
const { getQuery, runQuery, allQuery } = require('./db');

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
  console.log('Seeding branches...');
  try {
    const { count } = await getQuery('SELECT COUNT(*) as count FROM branches');
    if (count > 0) {
      console.log('Branches already exist, skipping...');
      return;
    }

    for (const branch of dummyBranches) {
      const sql = `INSERT INTO branches (name, location) VALUES (?, ?)`;
      await runQuery(sql, [branch.name, branch.location]);
    }
    console.log('Successfully seeded 5 branches');
  } catch (error) {
    console.error('Error seeding branches:', error);
    throw error;
  }
}

async function seedUsers() {
  console.log('Seeding users...');
  try {
    const existingUsers = await allQuery('SELECT username FROM users');
    const existingUsernames = existingUsers.map((user) => user.username);

    let insertedCount = 0;
    for (const user of dummyUsers) {
      if (existingUsernames.includes(user.username)) {
        console.log(`User with username '${user.username}' already exists. Skipping...`);
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
    console.log(`Successfully seeded ${insertedCount} users`);
  } catch (error) {
    console.error('Error seeding users:', error);
    throw error;
  }
}

async function seedTeachers() {
  console.log('Seeding teachers...');
  try {
    const { count } = await getQuery('SELECT COUNT(*) as count FROM teachers');
    if (count > 0) {
      console.log('Teachers already exist, skipping...');
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
    console.log(`Successfully seeded ${insertedCount} teachers`);
  } catch (error) {
    console.error('Error seeding teachers:', error);
    throw error;
  }
}

async function seedStudents() {
  console.log('Seeding students...');
  try {
    const { count } = await getQuery('SELECT COUNT(*) as count FROM students');
    if (count > 0) {
      console.log('Students already exist, skipping...');
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
    console.log(`Successfully seeded ${insertedCount} students`);
  } catch (error) {
    console.error('Error seeding students:', error);
    throw error;
  }
}

async function seedClasses() {
  console.log('Seeding classes...');
  try {
    const { count } = await getQuery('SELECT COUNT(*) as count FROM classes');
    if (count > 0) {
      console.log('Classes already exist, skipping...');
      return;
    }

    const maleTeachers = await allQuery("SELECT id FROM teachers WHERE gender = 'Male'");
    const femaleTeachers = await allQuery("SELECT id FROM teachers WHERE gender = 'Female'");

    if (maleTeachers.length === 0 || femaleTeachers.length === 0) {
      console.log('No teachers found, skipping classes seeding...');
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
    console.log(`Successfully seeded ${insertedCount} classes`);
  } catch (error) {
    console.error('Error seeding classes:', error);
    throw error;
  }
}

async function seedEnrollments() {
  console.log('Seeding enrollments...');
  try {
    const { count } = await getQuery('SELECT COUNT(*) as count FROM class_students');
    if (count > 0) {
      console.log('Enrollments already exist, skipping...');
      return;
    }

    const classes = await allQuery('SELECT id FROM classes');
    const students = await allQuery('SELECT id FROM students');

    if (classes.length === 0 || students.length === 0) {
      console.log('No classes or students found, skipping enrollments...');
      return;
    }

    let insertedCount = 0;
    for (let i = 0; i < Math.min(classes.length * 3, students.length); i++) {
      const sql = `INSERT INTO class_students (class_id, student_id) VALUES (?, ?)`;
      await runQuery(sql, [classes[i % classes.length].id, students[i % students.length].id]);
      insertedCount++;
    }
    console.log(`Successfully seeded ${insertedCount} enrollments`);
  } catch (error) {
    console.error('Error seeding enrollments:', error);
    throw error;
  }
}

async function seedAttendance() {
  console.log('Seeding attendance...');
  try {
    const { count } = await getQuery('SELECT COUNT(*) as count FROM attendance');
    if (count > 0) {
      console.log('Attendance already exists, skipping...');
      return;
    }

    const enrollments = await allQuery('SELECT class_id, student_id FROM class_students');
    if (enrollments.length === 0) {
      console.log('No enrollments found, skipping attendance...');
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
    console.log(`Successfully seeded ${insertedCount} attendance records`);
  } catch (error) {
    console.error('Error seeding attendance:', error);
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
};
