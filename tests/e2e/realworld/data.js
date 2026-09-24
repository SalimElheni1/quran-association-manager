/**
 * Deterministic "real branch" data for the real-world scenario: the same names,
 * ages and phone numbers on every run, so failures are reproducible.
 */
const fs = require('fs');
const path = require('path');

/** Where the seed leaves the backup + manifest for the continuation phase (gitignored). */
const HANDOFF_DIR = path.join(__dirname, '.handoff');
const MANIFEST_PATH = path.join(HANDOFF_DIR, 'manifest.json');

// Small LCG so the data is pseudo-random but identical on every run.
function rng(seed) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

const MALE_NAMES = [
  'أحمد',
  'محمد',
  'يوسف',
  'عمر',
  'علي',
  'حمزة',
  'إبراهيم',
  'خالد',
  'سليم',
  'أنس',
  'بلال',
  'زياد',
  'طارق',
  'نور الدين',
  'إلياس',
  'آدم',
  'مهدي',
  'هادي',
  'صالح',
  'رامي',
];
const FEMALE_NAMES = [
  'مريم',
  'فاطمة',
  'خديجة',
  'عائشة',
  'سارة',
  'ليلى',
  'آمنة',
  'زينب',
  'هاجر',
  'رحمة',
  'نور',
  'إيمان',
  'سلمى',
  'ياسمين',
  'أسماء',
  'رقية',
  'هالة',
  'منى',
  'سندس',
  'بشرى',
];
const FAMILY_NAMES = [
  'الطرابلسي',
  'الحداد',
  'الزواري',
  'القاسمي',
  'المرزوقي',
  'الشابي',
  'الغربي',
  'العياري',
  'الجلاصي',
  'الهمامي',
  'الدريدي',
  'السويسي',
  'البجاوي',
  'الصفاقسي',
  'المستيري',
  'القفصي',
];

function isoDateYearsAgo(years, dayOffset) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setDate(d.getDate() - dayOffset);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/**
 * 120 students spread over every seeded age group:
 * 50 children (6-11), 12+12 youths (12-14), 8+8 young adults (15-17), 15 men and 15 women (18+).
 */
function buildStudents() {
  const next = rng(2026);
  const groups = [
    { count: 50, minAge: 7, maxAge: 10, gender: 'mixed', group: 'children' },
    { count: 12, minAge: 12, maxAge: 13, gender: 'Male', group: 'youth-boys' },
    { count: 12, minAge: 12, maxAge: 13, gender: 'Female', group: 'youth-girls' },
    { count: 8, minAge: 15, maxAge: 16, gender: 'Male', group: 'young-men' },
    { count: 8, minAge: 15, maxAge: 16, gender: 'Female', group: 'young-women' },
    { count: 15, minAge: 19, maxAge: 55, gender: 'Male', group: 'men' },
    { count: 15, minAge: 19, maxAge: 55, gender: 'Female', group: 'women' },
  ];
  const used = new Set();
  const students = [];
  let phone = 20000000;
  for (const g of groups) {
    for (let i = 0; i < g.count; i += 1) {
      const gender = g.gender === 'mixed' ? (i % 2 === 0 ? 'Male' : 'Female') : g.gender;
      const first = gender === 'Male' ? MALE_NAMES : FEMALE_NAMES;
      // Three-part names ("أحمد بن محمد الحداد"); no name may contain another, so
      // locator hasText (a substring match) can never hit the wrong student.
      let name;
      do {
        name = `${first[Math.floor(next() * first.length)]} ${gender === 'Male' ? 'بن' : 'بنت'} ${
          MALE_NAMES[Math.floor(next() * MALE_NAMES.length)]
        } ${FAMILY_NAMES[Math.floor(next() * FAMILY_NAMES.length)]}`;
      } while ([...used].some((u) => u.includes(name) || name.includes(u)));
      used.add(name);
      const age = g.minAge + Math.floor(next() * (g.maxAge - g.minAge + 1));
      phone += 1 + Math.floor(next() * 97);
      students.push({
        name,
        gender,
        genderAr: gender === 'Male' ? 'ذكر' : 'أنثى',
        dob: isoDateYearsAgo(age, Math.floor(next() * 200) + 1),
        age,
        phone: String(phone),
        group: g.group,
      });
    }
  }
  return students;
}

const TEACHERS = [
  { name: 'الشيخ عبد الرحمن القاسمي', phone: '98100001', gender: 'Male' },
  { name: 'الشيخ منير الحداد', phone: '98100002', gender: 'Male' },
  { name: 'الأستاذ سامي بن عمر', phone: '98100003', gender: 'Male' },
  { name: 'الأستاذ فتحي الزواري', phone: '98100004', gender: 'Male' },
  { name: 'الشيخ حاتم الغربي', phone: '98100005', gender: 'Male' },
  { name: 'الأستاذة نجلاء الشابي', phone: '98100006', gender: 'Female' },
  { name: 'الأستاذة سعاد المرزوقي', phone: '98100007', gender: 'Female' },
  { name: 'الأستاذة وفاء العياري', phone: '98100008', gender: 'Female' },
];

/** Age group names as seeded in src/db/schema.js; `enroll` = how many matching students to enroll. */
const CLASSES = [
  {
    name: 'حلقة البراعم أ',
    ageGroup: 'الأطفال',
    teacher: 0,
    group: 'children',
    enroll: 20,
    today: true,
  },
  {
    name: 'حلقة البراعم ب',
    ageGroup: 'الأطفال',
    teacher: 5,
    group: 'children',
    enroll: 20,
    today: true,
  },
  {
    name: 'حلقة الناشئين',
    ageGroup: 'الناشئون (ذكور)',
    teacher: 1,
    group: 'youth-boys',
    enroll: 10,
    today: true,
  },
  {
    name: 'حلقة الناشئات',
    ageGroup: 'الناشئون (إناث)',
    teacher: 6,
    group: 'youth-girls',
    enroll: 10,
  },
  { name: 'حلقة الشباب', ageGroup: 'الشباب (ذكور)', teacher: 2, group: 'young-men', enroll: 6 },
  { name: 'حلقة الشابات', ageGroup: 'الشباب (إناث)', teacher: 7, group: 'young-women', enroll: 6 },
  { name: 'حلقة الرجال', ageGroup: 'الرجال', teacher: 3, group: 'men', enroll: 12 },
  { name: 'حلقة النساء', ageGroup: 'النساء', teacher: 6, group: 'women', enroll: 12 },
  { name: 'حلقة التجويد المتقدم', ageGroup: 'الرجال', teacher: 4, status: 'pending', enroll: 0 },
];

const USERS = {
  finance: {
    username: 'amina',
    password: 'finance-2026',
    firstName: 'أمينة',
    lastName: 'المالية',
    nationalId: '08123456',
    phone: '55100001',
    role: 'FinanceManager',
  },
  supervisor: {
    username: 'karim',
    password: 'session-2026',
    firstName: 'كريم',
    lastName: 'المشرف',
    nationalId: '08123457',
    phone: '55100002',
    role: 'SessionSupervisor',
  },
  admin: {
    username: 'hedi',
    password: 'board-2026',
    firstName: 'الهادي',
    lastName: 'الإداري',
    nationalId: '08123458',
    phone: '55100003',
    role: 'Administrator',
  },
};

const INCOMES = [
  { voucher: 'RW-IN-001', amount: 250, receiptType: 'تبرع' },
  { voucher: 'RW-IN-002', amount: 120, receiptType: 'انخراط' },
  { voucher: 'RW-IN-003', amount: 80, receiptType: 'نشاط' },
  { voucher: 'RW-IN-004', amount: 400, receiptType: 'تبرع' },
  { voucher: 'RW-IN-005', amount: 60, receiptType: 'انخراط' },
  {
    voucher: 'RW-IN-006',
    amount: 1500,
    receiptType: 'تبرع',
    paymentMethod: 'CHECK',
    check: 'CHK-9001',
  },
];

const EXPENSES = [
  { voucher: 'RW-EX-001', amount: 300, category: 'كراء وفواتير' },
  { voucher: 'RW-EX-002', amount: 450, category: 'منح ومرتبات' },
  { voucher: 'RW-EX-003', amount: 75, category: 'نفقات متنوعة' },
  { voucher: 'RW-EX-004', amount: 120, category: 'كراء وفواتير' },
];

function writeManifest(manifest) {
  fs.mkdirSync(HANDOFF_DIR, { recursive: true });
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

function readManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    throw new Error(
      `No real-world handoff at ${MANIFEST_PATH}. Run the seed phase first: npm run test:e2e:realworld`,
    );
  }
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
}

module.exports = {
  HANDOFF_DIR,
  MANIFEST_PATH,
  buildStudents,
  TEACHERS,
  CLASSES,
  USERS,
  INCOMES,
  EXPENSES,
  writeManifest,
  readManifest,
};
