const bcrypt = require('bcryptjs');
const { getQuery, runQuery, allQuery } = require('./db');

const getDobFromAge = (age) => {
  const today = new Date();
  const year = today.getFullYear() - age;
  return new Date(year, today.getMonth(), today.getDate()).toISOString().split('T')[0];
};

// Enhanced Dummy Data
const dummyBranches = [
  { name: 'الفرع الرئيسي', location: 'تونس العاصمة - المدينة' },
  { name: 'فرع المنار', location: 'تونس العاصمة - المنار' },
  { name: 'فرع أريانة', location: 'أريانة - السيجومي' },
  { name: 'فرع بن عروس', location: 'بن عروس - حمام الشط' },
  { name: 'فرع منوبة', location: 'منوبة - طبربة' },
];

const dummyUsers = [
  {
    username: 'superadmin',
    password: 'password123',
    first_name: 'محمد',
    last_name: 'الأمين',
    email: 'superadmin@quran-center.tn',
    phone_number: '+21650123456',
    role: 'Superadmin',
    employment_type: 'contract',
    start_date: '2020-01-01',
    status: 'active',
    branch_id: 1,
    national_id: '12345678901',
    date_of_birth: '1980-05-15',
    occupation: 'مدير عام',
    civil_status: 'Married',
  },
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
    branch_id: 1,
    national_id: '12345678902',
    date_of_birth: '1985-03-20',
    occupation: 'مدير فرع',
    civil_status: 'Married',
  },
  {
    username: 'finance1',
    password: 'password123',
    first_name: 'زينب',
    last_name: 'المالية',
    email: 'finance1@quran-center.tn',
    phone_number: '+21652123456',
    role: 'FinanceManager',
    employment_type: 'contract',
    start_date: '2022-03-15',
    status: 'active',
    branch_id: 1,
    national_id: '12345678903',
    date_of_birth: '1988-11-25',
    occupation: 'محاسبة',
    civil_status: 'Married',
  },
  {
    username: 'admin1',
    password: 'password123',
    first_name: 'علي',
    last_name: 'الإداري',
    email: 'admin1@quran-center.tn',
    phone_number: '+21653123456',
    role: 'Admin',
    employment_type: 'volunteer',
    start_date: '2023-09-01',
    status: 'active',
    branch_id: 1,
    national_id: '12345678904',
    date_of_birth: '1992-04-12',
    occupation: 'موظف إداري',
    civil_status: 'Single',
  },
  {
    username: 'supervisor1',
    password: 'password123',
    first_name: 'عائشة',
    last_name: 'المشرفة',
    email: 'supervisor1@quran-center.tn',
    phone_number: '+21654123456',
    role: 'SessionSupervisor',
    employment_type: 'volunteer',
    start_date: '2023-10-01',
    status: 'active',
    branch_id: 1,
    national_id: '12345678905',
    date_of_birth: '1987-06-30',
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
    phone_number: '+21660123456',
    address: 'تونس العاصمة - المدينة',
    date_of_birth: '1975-03-15',
    educational_level: 'جامعي - شريعة',
    years_of_experience: 15,
    availability: 'دوام كامل',
    branch_id: 1,
  },
  {
    name: 'الأستاذ عمر الفاروق',
    gender: 'Male',
    specialization: 'اللغة العربية والنحو',
    email: 'omar.teacher@quran-center.tn',
    phone_number: '+21661123456',
    address: 'تونس العاصمة - المنار',
    date_of_birth: '1980-07-20',
    educational_level: 'جامعي - آداب',
    years_of_experience: 12,
    availability: 'دوام مسائي',
    branch_id: 1,
  },
  {
    name: 'الأستاذة عائشة بنت أبي بكر',
    gender: 'Female',
    specialization: 'الحفظ والتجويد',
    email: 'aisha.teacher@quran-center.tn',
    phone_number: '+21662123456',
    address: 'تونس العاصمة - المدينة',
    date_of_birth: '1985-12-08',
    educational_level: 'جامعي - شريعة',
    years_of_experience: 8,
    availability: 'دوام صباحي',
    branch_id: 1,
  },
  {
    name: 'الأستاذة فاطمة الزهراء',
    gender: 'Female',
    specialization: 'اللغة العربية للأطفال',
    email: 'fatima.teacher@quran-center.tn',
    phone_number: '+21663123456',
    address: 'تونس العاصمة - المنار',
    date_of_birth: '1988-04-18',
    educational_level: 'جامعي - آداب',
    years_of_experience: 6,
    availability: 'دوام صباحي',
    branch_id: 2,
  },
  {
    name: 'الشيخ عبدالرحمن السديس',
    gender: 'Male',
    specialization: 'الفقه والحديث',
    email: 'abdulrahman.teacher@quran-center.tn',
    phone_number: '+21664123456',
    address: 'أريانة - السيجومي',
    date_of_birth: '1978-11-10',
    educational_level: 'جامعي - شريعة',
    years_of_experience: 18,
    availability: 'دوام صباحي',
    branch_id: 3,
  },
];

const dummyStudents = [
  // Kids (6-12 years)
  { name: 'أحمد الصغير', gender: 'Male', age: 8, branch_id: 1 },
  { name: 'محمد الصغير', gender: 'Male', age: 10, branch_id: 1 },
  { name: 'فاطمة الصغيرة', gender: 'Female', age: 9, branch_id: 1 },
  { name: 'سارة الصغيرة', gender: 'Female', age: 7, branch_id: 2 },
  { name: 'عمر الصغير', gender: 'Male', age: 11, branch_id: 2 },
  { name: 'زينب الصغيرة', gender: 'Female', age: 8, branch_id: 3 },
  { name: 'علي الصغير', gender: 'Male', age: 12, branch_id: 3 },
  { name: 'حفصة الصغيرة', gender: 'Female', age: 10, branch_id: 4 },
  { name: 'حسن الصغير', gender: 'Male', age: 9, branch_id: 4 },
  { name: 'خديجة الصغيرة', gender: 'Female', age: 11, branch_id: 5 },

  // Teenagers (13-18 years)
  { name: 'أحمد المراهق', gender: 'Male', age: 15, branch_id: 1 },
  { name: 'فاطمة المراهقة', gender: 'Female', age: 16, branch_id: 1 },
  { name: 'محمد المراهق', gender: 'Male', age: 14, branch_id: 2 },
  { name: 'عائشة المراهقة', gender: 'Female', age: 17, branch_id: 2 },
  { name: 'عبدالله المراهق', gender: 'Male', age: 13, branch_id: 3 },
  { name: 'زينب المراهقة', gender: 'Female', age: 15, branch_id: 3 },
  { name: 'يوسف المراهق', gender: 'Male', age: 16, branch_id: 4 },
  { name: 'حفصة المراهقة', gender: 'Female', age: 14, branch_id: 4 },
  { name: 'إبراهيم المراهق', gender: 'Male', age: 18, branch_id: 5 },
  { name: 'مريم المراهقة', gender: 'Female', age: 17, branch_id: 5 },

  // Adults (19-60 years)
  { name: 'أحمد الكبير', gender: 'Male', age: 25, branch_id: 1 },
  { name: 'فاطمة الكبيرة', gender: 'Female', age: 30, branch_id: 1 },
  { name: 'محمد الكبير', gender: 'Male', age: 35, branch_id: 2 },
  { name: 'عائشة الكبيرة', gender: 'Female', age: 28, branch_id: 2 },
  { name: 'عبدالله الكبير', gender: 'Male', age: 45, branch_id: 3 },
  { name: 'زينب الكبيرة', gender: 'Female', age: 32, branch_id: 3 },
  { name: 'يوسف الكبير', gender: 'Male', age: 40, branch_id: 4 },
  { name: 'حفصة الكبيرة', gender: 'Female', age: 38, branch_id: 4 },
  { name: 'إبراهيم الكبير', gender: 'Male', age: 50, branch_id: 5 },
  { name: 'مريم الكبيرة', gender: 'Female', age: 42, branch_id: 5 },
];

const getDummyClasses = (teacherIds) => {
  return [
    {
      name: 'فصل التجويد للرجال',
      gender: 'men',
      status: 'active',
      teacher_id: teacherIds.male[0],
      capacity: 20,
    },
    {
      name: 'فصل الحفظ للنساء',
      gender: 'women',
      status: 'active',
      teacher_id: teacherIds.female[0],
      capacity: 15,
    },
    {
      name: 'فصل الأطفال التمهيدي',
      gender: 'kids',
      status: 'pending',
      teacher_id: teacherIds.male[1],
      capacity: 12,
    },
    {
      name: 'فصل اللغة العربية',
      gender: 'all',
      status: 'active',
      teacher_id: teacherIds.male[0],
      capacity: 25,
    },
    {
      name: 'فصل الفقه اليومي',
      gender: 'men',
      status: 'active',
      teacher_id: teacherIds.male[2],
      capacity: 18,
    },
    {
      name: 'فصل الحفظ المكثف',
      gender: 'women',
      status: 'active',
      teacher_id: teacherIds.female[1],
      capacity: 16,
    },
    {
      name: 'فصل الأطفال المتقدم',
      gender: 'kids',
      status: 'active',
      teacher_id: teacherIds.female[0],
      capacity: 10,
    },
    {
      name: 'فصل التفسير العام',
      gender: 'all',
      status: 'active',
      teacher_id: teacherIds.male[1],
      capacity: 30,
    },
  ];
};

// Seeding Functions
async function seedBranches() {
  console.log('Seeding branches...');
  const { count } = await getQuery('SELECT COUNT(*) as count FROM branches');
  if (count > 0) return;

  for (const branch of dummyBranches) {
    const sql = `INSERT INTO branches (name, location) VALUES (?, ?)`;
    await runQuery(sql, [branch.name, branch.location]);
    console.log(`Inserted branch: ${branch.name}`);
  }
}

async function seedUsers() {
  console.log('Seeding users...');
  const { count } = await getQuery(
    "SELECT COUNT(*) as count FROM users WHERE role != 'Superadmin'",
  );
  if (count > 0) return;

  for (const user of dummyUsers) {
    const hashedPassword = bcrypt.hashSync(user.password, 10);
    const sql = `INSERT INTO users (username, password, first_name, last_name, email, phone_number, role, employment_type, start_date, status, branch_id, national_id, date_of_birth, occupation, civil_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
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
      user.branch_id,
      user.national_id,
      user.date_of_birth,
      user.occupation,
      user.civil_status,
    ]);
    console.log(`Inserted user: ${user.username} (${user.role})`);
  }
}

async function seedTeachers() {
  console.log('Seeding teachers...');
  const { count } = await getQuery('SELECT COUNT(*) as count FROM teachers');
  if (count > 0) return;

  for (const teacher of dummyTeachers) {
    const sql = `INSERT INTO teachers (name, gender, specialization, email, phone_number, address, date_of_birth, educational_level, years_of_experience, availability, branch_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    await runQuery(sql, [
      teacher.name,
      teacher.gender,
      teacher.specialization,
      teacher.email,
      teacher.phone_number,
      teacher.address,
      teacher.date_of_birth,
      teacher.educational_level,
      teacher.years_of_experience,
      teacher.availability,
      teacher.branch_id,
    ]);
    console.log(`Inserted teacher: ${teacher.name}`);
  }
}

async function seedStudents() {
  console.log('Seeding students...');
  const { count } = await getQuery('SELECT COUNT(*) as count FROM students');
  if (count > 0) return;

  for (const student of dummyStudents) {
    const sql = `INSERT INTO students (name, gender, date_of_birth, status, branch_id, address, contact_info, email, parent_name, parent_contact) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    await runQuery(sql, [
      student.name,
      student.gender,
      getDobFromAge(student.age),
      student.status,
      student.branch_id,
      `فرع ${student.branch_id} - المنطقة`,
      `+216${700000000 + Math.floor(Math.random() * 99999999)}`,
      `student${Math.random().toString(36).substr(2, 9)}@quran-center.tn`,
      `ولي أمر ${student.name}`,
      `+216${700000000 + Math.floor(Math.random() * 99999999)}`,
    ]);
    console.log(`Inserted student: ${student.name} (${student.age} years)`);
  }
}

async function seedClasses() {
  console.log('Seeding classes...');
  const { count } = await getQuery('SELECT COUNT(*) as count FROM classes');
  if (count > 0) return;

  const maleTeachers = await allQuery("SELECT id FROM teachers WHERE gender = 'Male'");
  const femaleTeachers = await allQuery("SELECT id FROM teachers WHERE gender = 'Female'");

  const teacherIds = {
    male: maleTeachers.map((t) => t.id),
    female: femaleTeachers.map((t) => t.id),
  };

  const classes = getDummyClasses(teacherIds);
  for (const cls of classes) {
    const sql = `INSERT INTO classes (name, gender, status, teacher_id, capacity) VALUES (?, ?, ?, ?, ?)`;
    await runQuery(sql, [cls.name, cls.gender, cls.status, cls.teacher_id, cls.capacity]);
    console.log(`Inserted class: ${cls.name}`);
  }
}

async function seedEnrollments() {
  console.log('Seeding enrollments...');
  const { count } = await getQuery('SELECT COUNT(*) as count FROM class_students');
  if (count > 0) return;

  const classes = await allQuery('SELECT id, gender FROM classes');
  const students = await allQuery('SELECT id, gender FROM students');

  let enrollmentCount = 0;
  for (let i = 0; i < Math.min(classes.length * 5, students.length); i++) {
    const student = students[i % students.length];
    const suitableClasses = classes.filter((c) => {
      if (c.gender === 'all') return true;
      if (c.gender === 'men' && student.gender === 'Male') return true;
      if (c.gender === 'women' && student.gender === 'Female') return true;
      if (c.gender === 'kids') return true;
      return false;
    });

    if (suitableClasses.length > 0) {
      const selectedClass = suitableClasses[i % suitableClasses.length];
      const sql = `INSERT INTO class_students (class_id, student_id) VALUES (?, ?)`;
      await runQuery(sql, [selectedClass.id, student.id]);
      enrollmentCount++;
    }
  }
  console.log(`Inserted ${enrollmentCount} enrollments`);
}

async function seedAttendance() {
  console.log('Seeding attendance...');
  const { count } = await getQuery('SELECT COUNT(*) as count FROM attendance');
  if (count > 0) return;

  const enrollments = await allQuery('SELECT class_id, student_id FROM class_students');
  const statuses = ['present', 'absent', 'late'];

  let attendanceCount = 0;
  for (const enrollment of enrollments) {
    // Generate attendance for last 30 days
    for (let day = 0; day < 30; day++) {
      const date = new Date();
      date.setDate(date.getDate() - day);
      const dateStr = date.toISOString().split('T')[0];

      const sql = `INSERT INTO attendance (class_id, student_id, date, status) VALUES (?, ?, ?, ?)`;
      await runQuery(sql, [
        enrollment.class_id,
        enrollment.student_id,
        dateStr,
        statuses[Math.floor(Math.random() * statuses.length)],
      ]);
      attendanceCount++;
    }
  }
  console.log(`Inserted ${attendanceCount} attendance records`);
}

async function seedDatabase() {
  console.log('Starting enhanced database seeding...');
  try {
    console.log('Seeding branches...');
    await seedBranches();
    console.log('Seeding users...');
    await seedUsers();
    console.log('Seeding teachers...');
    await seedTeachers();
    console.log('Seeding students...');
    await seedStudents();
    console.log('Seeding classes...');
    await seedClasses();
    console.log('Seeding enrollments...');
    await seedEnrollments();
    console.log('Seeding attendance...');
    await seedAttendance();
    console.log('Enhanced database seeding completed successfully.');
  } catch (error) {
    console.error('An error occurred during enhanced database seeding:', error);
  }
}

module.exports = { seedDatabase };
