/**
 * Video guide: a guided tour of the app, recorded as a video with Arabic explanations on screen.
 *
 * It sets up a branch from a fresh install, the way a new administrator would: first login,
 * then every setting (association details, branding, fees and age groups, backup), users and
 * roles, teachers, students, classes, attendance, student fees, income, expenses and inventory,
 * the financial dashboard and reports, the profile, About and logout. Each step is explained
 * before it happens, and every step is still checked like any other e2e test, so the guide
 * can't silently drift from the app. Steps the video does not do (they need a file or a printer,
 * or would undo the demo) are only highlighted, with a «للاطلاع فقط» badge (guide.show).
 *
 * How steps are explained (QBM_GUIDE_MODE):
 * - captions (default): Arabic captions on screen.
 * - audio: a spoken Arabic narration instead (text-to-speech, see narrator.js for the engines).
 * - both: captions and narration.
 *
 * Run it with `npm run docs:guide` (or docs:guide:audio); the video, Arabic subtitles
 * (captions.vtt), chapter timings, the narration track and the written guide (guide.md) go to
 * guide-output/. `npm run docs:guide:mp4` then makes MP4 files (the full guide and one per
 * chapter, with the narration) when ffmpeg is available; `npm run docs:guide:mp4 -- --single`
 * makes only the full guide.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  test,
  expect,
  launchApp,
  modal,
  expectNoModal,
  expectToast,
  SUPERADMIN,
} = require('../fixtures');
const { Guide, chapterNarration } = require('./guideKit');
const { Narrator, extractNarration } = require('./narrator');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const OUT_DIR = process.env.QBM_GUIDE_OUT || path.join(ROOT, 'guide-output');
const SIZE = { width: 1280, height: 800 };
// QBM_GUIDE_PACE=0.5 makes a quicker (half-length) run, e.g. to check the guide still passes.
const PACE = Number(process.env.QBM_GUIDE_PACE) || 1;
// captions | audio | both
const MODE = process.env.QBM_GUIDE_MODE || 'captions';
// Moves the narration against the picture if a machine records with a different delay
// (positive: later).
const AV_SHIFT_MS = Number(process.env.QBM_GUIDE_AV_SHIFT_MS) || 0;

/** The narrator for audio modes, with every sentence of this script synthesized up front. */
function prepareNarrator() {
  if (MODE === 'captions') return null;
  const narrator = new Narrator({ cacheDir: path.join(OUT_DIR, 'tts-cache') });
  narrator.prefetch(extractNarration(fs.readFileSync(__filename, 'utf8'), chapterNarration));
  return narrator;
}

const TEACHER = { name: 'الشيخ عبد الرحمن', phone: '22334455' };
const STUDENTS = [
  { name: 'يوسف بن أحمد', age: 9, gender: 'ذكر' },
  { name: 'مريم بنت سالم', age: 10, gender: 'أنثى' },
  { name: 'عمر بن خالد', age: 8, gender: 'ذكر' },
];
const CLASS_NAME = 'فصل الحفظ - الأطفال';
const ASSOCIATION = {
  regional: 'الرابطة الجهوية بصفاقس',
  local: 'فرع ساقية الزيت',
  president: 'محمد بن علي الشريف',
};
const FINANCE_USER = {
  username: 'amina',
  password: 'Amina#Ledger-2026',
  firstName: 'أمينة',
  lastName: 'بن صالح',
  nationalId: '08123456',
  phone: '55100001',
};
const INVENTORY_ITEM = {
  name: 'مصحف مجلد',
  category: 'كتب ومراجع',
  quantity: '20',
  unitValue: '15',
};

function yearsAgo(years) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

function activePane(page) {
  return page.locator('.tab-pane.active');
}

function sidebar(page, label) {
  return page.locator('a.nav-link', { hasText: label });
}

/** Clicks a tab unless it is already selected (clicking the selected tab never settles). */
async function openTab(guide, title) {
  const tab = guide.page.getByRole('tab', { name: title, exact: true });
  if ((await tab.getAttribute('aria-selected')) !== 'true') await guide.click(tab);
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}

test.setTimeout(40 * 60 * 1000);

test('video guide: set up and run a branch from a fresh install', async () => {
  const narrator = prepareNarrator();
  const videoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qbm-guide-video-'));
  const { app, userDataDir } = await launchApp({ recordVideo: { dir: videoDir, size: SIZE } });
  let guide;
  try {
    const page = await app.firstWindow();
    // The video starts with the window.
    const windowAt = Date.now();
    await page.waitForLoadState('domcontentloaded');
    await app.evaluate(({ BrowserWindow }, size) => {
      const win = BrowserWindow.getAllWindows()[0];
      win.setSize(size.width, size.height);
      win.center();
    }, SIZE);
    await page.setViewportSize(SIZE).catch(() => {});

    guide = new Guide(page, { pace: PACE, mode: MODE, narrator });
    guide.windowAt = windowAt;

    // ------------------------------------------------------------------ 1. Welcome
    await guide.chapter(
      'دليل استخدام برنامج إدارة الفرع',
      'نبدأ بإعداد البرنامج كاملاً، ثم المستخدمين والمعلمين والطلاب والفصول، ثم الحضور والشؤون المالية.',
    );

    // ------------------------------------------------------------------ 2. First run
    await guide.chapter(
      'البداية: إنشاء حساب المدير وتسجيل الدخول',
      'أول ما تقوم به بعد تثبيت البرنامج على جهاز الفرع.',
    );
    await expect(page.getByRole('heading', { name: 'إنشاء مدير النظام' })).toBeVisible();
    await guide.say(
      'عند فتح البرنامج لأول مرة، يطلب منك إنشاء حساب «مدير النظام» الذي يملك كل الصلاحيات.',
    );
    await guide.say('اكتب اسم المستخدم الذي ستدخل به إلى البرنامج.');
    await guide.type(page.locator('#setup-username'), SUPERADMIN.username);
    await guide.say('اختر كلمة مرور قوية، ثم أعد كتابتها للتأكيد. احتفظ بها في مكان آمن.');
    await guide.type(page.locator('input[name="setup-password"]'), SUPERADMIN.password);
    await guide.type(page.locator('input[name="setup-confirm-password"]'), SUPERADMIN.password);
    await guide.say(
      'اختر «رمز حماية النسخ الاحتياطية»: تُشفَّر به النسخ الاحتياطية فتُسترجع على أي جهاز من أجهزة الجمعية. إن كانت جمعيتك تستعمل رمزاً على جهاز آخر فأدخل نفس الرمز.',
    );
    await guide.type(page.locator('input[name="setup-transfer-key"]'), SUPERADMIN.transferKey);
    await guide.type(
      page.locator('input[name="setup-confirm-transfer-key"]'),
      SUPERADMIN.transferKey,
    );
    await guide.say('اضغط «إنشاء مدير النظام» لحفظ الحساب.');
    await guide.click(page.getByRole('button', { name: 'إنشاء مدير النظام' }));

    await expect(page.getByRole('heading', { name: 'تسجيل الدخول' })).toBeVisible();
    await guide.say('تظهر شاشة تسجيل الدخول. أدخل اسم المستخدم وكلمة المرور.');
    await guide.type(page.locator('#username'), SUPERADMIN.username);
    await guide.type(page.locator('input[name="password"]'), SUPERADMIN.password);
    await guide.click(page.getByRole('button', { name: 'تسجيل الدخول' }));

    const stopTour = page.getByRole('button', { name: 'إيقاف العرض' });
    await stopTour.waitFor({ state: 'visible', timeout: 10000 });
    await guide.say(
      'عند أول دخول يظهر دليل تعريفي بأقسام البرنامج. يمكنك متابعته، أو إيقافه والعودة إليه لاحقاً.',
    );
    await guide.click(stopTour);
    await expect(page.locator('.onboarding-guide')).toBeHidden();

    await expect(page.locator('h1', { hasText: 'لوحة التحكم الرئيسية' })).toBeVisible();
    await guide.say('هذه هي الصفحة الرئيسية: إحصائيات الفرع، والاختصارات السريعة، وحصص اليوم.');
    await guide.say(
      'القائمة الجانبية تنقلك بين أقسام البرنامج: الطلاب، المعلمون، الفصول، الحضور، الشؤون المالية والإعدادات.',
    );
    await guide.point(page.locator('.sidebar, nav').first(), 1800);
    await guide.say('قبل تسجيل أي بيانات، نبدأ بإعداد البرنامج من صفحة «الإعدادات».');

    // ------------------------------------------------------------------ 3. Association details
    await guide.chapter(
      'الإعدادات: بيانات الجمعية والفرع',
      'تظهر هذه البيانات في الوصولات والتقارير المطبوعة.',
    );
    await guide.say('افتح «الإعدادات» من القائمة الجانبية.');
    await guide.click(sidebar(page, 'الإعدادات'));
    await expect(
      page.getByRole('heading', { name: 'إعدادات النظام والنسخ الاحتياطي' }),
    ).toBeVisible();
    await openTab(guide, 'بيانات الجمعية/الفرع');
    await guide.say('اسم الجمعية الوطنية مكتوب مسبقاً. أكمل اسم الفرع الجهوي والفرع المحلي.');
    await guide.type(
      activePane(page).locator('input[name="regional_association_name"]'),
      ASSOCIATION.regional,
    );
    await guide.type(
      activePane(page).locator('input[name="local_branch_name"]'),
      ASSOCIATION.local,
    );
    await guide.say('اكتب الاسم الكامل لرئيس الفرع: يظهر في الوثائق التي تتطلب إمضاءه.');
    await guide.type(
      activePane(page).locator('input[name="president_full_name"]'),
      ASSOCIATION.president,
    );
    await guide.say('اضغط «حفظ جميع التغييرات» أسفل الصفحة.');
    await guide.click(page.getByRole('button', { name: 'حفظ جميع التغييرات' }));
    await expectToast(page, 'success', /تم تحديث الإعدادات بنجاح/);

    // ------------------------------------------------------------------ 4. Branding
    await guide.chapter('الإعدادات: الهوية البصرية', 'شعار الجمعية وشعار الفرع على الوثائق.');
    await guide.say('اختر تبويب «الهوية البصرية».');
    await openTab(guide, 'الهوية البصرية');
    await guide.show(
      activePane(page).getByRole('button', { name: 'تحميل...' }).first(),
      'زر «تحميل...» يفتح نافذة لاختيار صورة الشعار من جهازك. شعار الجمعية الوطنية موجود مسبقاً.',
    );
    await guide.show(
      activePane(page).getByRole('button', { name: 'تحميل...' }).nth(1),
      'وبنفس الطريقة تضيف شعار الفرع المحلي، ثم تضغط «حفظ جميع التغييرات».',
    );

    // ------------------------------------------------------------------ 5. Fees & age groups
    await guide.chapter('الإعدادات: الرسوم والفئات العمرية', 'حدد الرسوم قبل تسجيل الطلاب.');
    await guide.say('اختر تبويب «إعدادات الرسوم».');
    await openTab(guide, 'إعدادات الرسوم');
    await guide.say('الرسوم السنوية (معلوم الترسيم) تُطلب مرة واحدة في كل سنة دراسية.');
    await guide.type(activePane(page).locator('input[name="annual_fee"]'), '30');
    await guide.say('الرسوم الشهرية تُطلب في بداية كل شهر من الطلاب الذين يدفعون شهرياً.');
    await guide.type(activePane(page).locator('input[name="standard_monthly_fee"]'), '20');
    await guide.say('اضغط «حفظ جميع التغييرات».');
    await guide.click(page.getByRole('button', { name: 'حفظ جميع التغييرات' }));
    await expectToast(page, 'success', /تم تحديث الإعدادات بنجاح/);

    await guide.say(
      'في تبويب «فئات عمرية» تجد فئات الفرع. لكل فئة نظام دفع (شهري أو سنوي) ويمكن أن تكون لها رسوم خاصة بها.',
    );
    await openTab(guide, 'فئات عمرية');
    await expect(activePane(page).locator('tbody tr').first()).toBeVisible();
    await guide.point(activePane(page).locator('table'), 1800);
    await guide.show(
      activePane(page).getByRole('button', { name: 'إضافة فئة جديدة' }),
      'زر «إضافة فئة جديدة» يضيف فئة بنطاقها العمري وجنسها ونظام دفعها.',
    );
    await guide.show(
      activePane(page).locator('tbody tr').first().getByRole('button', { name: 'تعديل' }),
      'زر «تعديل» يغيّر فئة موجودة، مثلاً لتحديد رسوم خاصة بها.',
    );

    // ------------------------------------------------------------------ 6. Backup
    await guide.chapter('الإعدادات: النسخ الاحتياطي', 'احمِ بيانات الفرع بنسخة احتياطية منتظمة.');
    const backupDir = path.join(videoDir, 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    await app.evaluate(({ dialog }, dir) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] });
    }, backupDir);
    await guide.say('اختر تبويب «النسخ الاحتياطي».');
    await openTab(guide, 'النسخ الاحتياطي');
    const keyCard = page.locator('[data-section="backup-key"]');
    await guide.say(
      '«رمز حماية النسخ الاحتياطية» اخترته عند إنشاء مدير النظام. يبقى مخفياً حتى لا يراه أحد إن تُرك البرنامج مفتوحاً.',
    );
    await guide.point(keyCard, 1500);
    await guide.show(
      keyCard.getByRole('button', { name: 'عرض الرمز' }),
      'زر «عرض الرمز» يعرضه لمدة 30 ثانية بعد إدخال كلمة مرورك.',
    );
    await guide.show(
      keyCard.getByRole('button', { name: 'تغيير الرمز' }),
      'زر «تغيير الرمز» يغيّره بعد إدخال كلمة مرورك. أعطِ الرمز الجديد لكل أجهزة الجمعية.',
    );
    await guide.say('اختر المجلد الذي تُحفظ فيه النسخ، ويفضل أن يكون على قرص خارجي أو مفتاح USB.');
    await guide.click(activePane(page).getByRole('button', { name: 'اختيار...' }));
    await guide.say('اضغط «نسخ احتياطي الآن» لإنشاء نسخة فوراً.');
    await guide.click(activePane(page).getByRole('button', { name: 'نسخ احتياطي الآن' }));
    await expectToast(page, 'success', /تم إنشاء النسخة الاحتياطية بنجاح/);
    expect(fs.readdirSync(backupDir).filter((f) => f.endsWith('.qdb'))).toHaveLength(1);

    await guide.say(
      'ليتم النسخ تلقائياً، فعّل «النسخ التلقائي» واختر التكرار والتوقيت. يعمل النسخ عندما يكون البرنامج مفتوحاً.',
    );
    await guide.click(activePane(page).locator('#backup-enabled-switch'));
    await guide.select(activePane(page).locator('select[name="backup_frequency"]'), 'weekly');
    await guide.fill(activePane(page).locator('input[name="backup_time"]'), '18:00');
    await guide.click(activePane(page).getByRole('button', { name: 'حفظ إعدادات النسخ التلقائي' }));
    await expectToast(page, 'success', /تم تحديث الإعدادات بنجاح/);
    await guide.show(
      activePane(page).getByRole('button', { name: 'استرجاع من نسخة احتياطية...' }),
      'عند تعطّل الجهاز، يسترجع زر «استرجاع من نسخة احتياطية...» كل البيانات من ملف النسخة، على هذا الجهاز أو على جهاز جديد.',
    );

    // ------------------------------------------------------------------ 7. Users
    await guide.chapter('المستخدمون والصلاحيات', 'أنشئ حساباً لكل عضو يعمل على البرنامج.');
    await guide.say('افتح «إدارة المستخدمين».');
    await guide.click(sidebar(page, 'إدارة المستخدمين'));
    await guide.say(
      'لكل مستخدم دور: «الهيئة المديرة» تدير الفرع كاملاً، «مسؤول مالي» للشؤون المالية، و«مشرف حصص» للحضور.',
    );
    await guide.say('اضغط «إضافة مستخدم جديد». سننشئ حساباً لأمينة المال.');
    await guide.click(page.getByRole('button', { name: 'إضافة مستخدم جديد' }));
    await expect(modal(page).locator('.modal-title')).toHaveText('إضافة مستخدم جديد');
    await guide.say('أدخل اسم المستخدم وكلمة المرور التي سيدخل بها.');
    await guide.type(modal(page).locator('input[name="username"]'), FINANCE_USER.username);
    await guide.type(modal(page).locator('input[name="password"]'), FINANCE_USER.password);
    await guide.say('ثم الاسم واللقب، ورقم بطاقة التعريف، ورقم الهاتف.');
    await guide.type(modal(page).locator('input[name="first_name"]'), FINANCE_USER.firstName);
    await guide.type(modal(page).locator('input[name="last_name"]'), FINANCE_USER.lastName);
    await guide.type(modal(page).locator('input[name="national_id"]'), FINANCE_USER.nationalId);
    await guide.type(modal(page).locator('input[name="phone_number"]'), FINANCE_USER.phone);
    await guide.say('اختر الدور «مسؤول مالي» وألغِ «الهيئة المديرة».');
    await guide.click(modal(page).locator('#role-Administrator'));
    await guide.click(modal(page).locator('#role-FinanceManager'));
    await expect(modal(page).locator('#role-FinanceManager')).toBeChecked();
    await expect(modal(page).locator('#role-Administrator')).not.toBeChecked();
    await guide.say('اضغط «إضافة المستخدم».');
    await guide.click(modal(page).getByRole('button', { name: 'إضافة المستخدم' }));
    await expectNoModal(page);
    const userRow = page.locator('tbody tr', { hasText: FINANCE_USER.username });
    await expect(userRow).toBeVisible();
    await guide.show(
      userRow.getByRole('button', { name: 'تعديل' }),
      'زر «تعديل» يغيّر بيانات المستخدم أو دوره أو كلمة مروره، أو يوقف حسابه.',
    );

    // ------------------------------------------------------------------ 8. Teachers
    await guide.chapter('إضافة معلم', 'سجّل معلمي الفرع لتسند إليهم الفصول.');
    await guide.say('افتح «شؤون المعلمين».');
    await guide.click(sidebar(page, 'شؤون المعلمين'));
    await guide.say('اضغط «إضافة معلم».');
    await guide.click(page.getByRole('button', { name: 'إضافة معلم' }));
    await expect(modal(page).locator('.modal-title', { hasText: 'إضافة معلم جديد' })).toBeVisible();
    await guide.say('أدخل اسم المعلم ورقم هاتفه (8 أرقام)، ثم اختر الجنس.');
    await guide.type(modal(page).locator('input[name="name"]'), TEACHER.name);
    await guide.type(modal(page).locator('input[name="contact_info"]'), TEACHER.phone);
    await guide.select(modal(page).locator('select[name="gender"]'), 'Male');
    await guide.say('اضغط «إضافة المعلم» للحفظ.');
    await guide.click(modal(page).getByRole('button', { name: 'إضافة المعلم' }));
    await expectToast(page, 'success', `تمت إضافة المعلم "${TEACHER.name}" بنجاح!`);
    await expectNoModal(page);
    await guide.say('يظهر المعلم في الجدول، ويمكن تعديل بياناته أو حذفه من أزرار السطر.');
    await guide.show(
      page.getByRole('button', { name: 'استيراد البيانات' }),
      'إن كانت قائمة المعلمين في ملف Excel، استوردها كاملة بزر «استيراد البيانات»، وصدّرها بزر «تصدير البيانات».',
    );

    // ------------------------------------------------------------------ 9. Students
    await guide.chapter('تسجيل الطلاب', 'أضف طلاب الفرع مع تاريخ الميلاد والجنس.');
    await guide.say('افتح «شؤون الطلاب».');
    await guide.click(sidebar(page, 'شؤون الطلاب'));
    await expect(page.getByRole('heading', { name: 'شؤون الطلاب' })).toBeVisible();
    for (const [index, student] of STUDENTS.entries()) {
      if (index === 0) await guide.say('اضغط «إضافة طالب» لفتح استمارة التسجيل.');
      await guide.click(page.getByRole('button', { name: 'إضافة طالب' }));
      await expect(modal(page).locator('.modal-title')).toHaveText('إضافة طالب جديد');
      if (index === 0) {
        await guide.say('اكتب الاسم واللقب كاملاً.');
        await guide.type(modal(page).locator('#formStudentName'), student.name);
        await guide.say('أدخل تاريخ الميلاد: يحدد البرنامج من خلاله عمر الطالب وفئته العمرية.');
        await guide.fill(modal(page).locator('#formStudentDob'), yearsAgo(student.age));
        await guide.say('اختر الجنس. بقية الحقول (الهاتف، ولي الأمر، الملاحظات...) اختيارية.');
        await guide.select(modal(page).locator('#formStudentGender'), { label: student.gender });
        await guide.say('اضغط «إضافة الطالب». يحصل كل طالب تلقائياً على رقم تعريفي.');
      } else {
        await guide.type(modal(page).locator('#formStudentName'), student.name, { delay: 30 });
        await guide.fill(modal(page).locator('#formStudentDob'), yearsAgo(student.age));
        await guide.select(modal(page).locator('#formStudentGender'), { label: student.gender });
      }
      await guide.click(modal(page).getByRole('button', { name: 'إضافة الطالب' }));
      await expectToast(page, 'success', `تمت إضافة الطالب "${student.name}" بنجاح!`);
      await expectNoModal(page);
      if (index === 0) await guide.say('نضيف بنفس الطريقة بقية الطلاب.');
    }
    await expect(page.locator('table.students-table tbody tr')).toHaveCount(STUDENTS.length);
    await guide.say('للبحث عن طالب، اكتب جزءاً من اسمه أو رقمه التعريفي في خانة البحث.');
    const search = page.getByPlaceholder('البحث بالاسم أو الرقم التعريفي...');
    await guide.type(search, 'مريم');
    await expect(page.locator('table.students-table tbody tr')).toHaveCount(1);
    await guide.pause(1200);
    await search.clear();
    await expect(page.locator('table.students-table tbody tr')).toHaveCount(STUDENTS.length);
    await guide.say('زر «عرض التفاصيل» في سطر الطالب يعرض كل بياناته في نافذة واحدة.');
    await guide.click(
      page
        .locator('table.students-table tbody tr', { hasText: STUDENTS[0].name })
        .getByRole('button', { name: 'عرض تفاصيل الطالب' }),
    );
    await expect(modal(page).locator('.modal-title')).toContainText('تفاصيل الطالب');
    await guide.pause(2500);
    await guide.click(modal(page).getByRole('button', { name: 'إغلاق', exact: true }));
    await expectNoModal(page);
    await guide.show(
      page.getByRole('button', { name: 'استيراد البيانات' }),
      'لتسجيل قائمة طلاب كاملة دفعة واحدة، استوردها من ملف Excel بزر «استيراد البيانات».',
    );

    // ------------------------------------------------------------------ 10. Classes
    await guide.chapter(
      'إنشاء فصل وتسجيل الطلاب فيه',
      'الفصل يجمع الطلاب مع معلمهم ومواعيد الحصص.',
    );
    await guide.say('افتح «الفصول الدراسية» واضغط «إضافة فصل».');
    await guide.click(sidebar(page, 'الفصول الدراسية'));
    await guide.click(page.getByRole('button', { name: 'إضافة فصل' }));
    await expect(modal(page).locator('.modal-title')).toHaveText('إضافة فصل جديد');
    await guide.say('اكتب اسم الفصل.');
    await guide.type(modal(page).locator('input[name="name"]'), CLASS_NAME);
    await guide.say('اختر المعلم المسؤول عن الفصل.');
    await guide.select(modal(page).locator('select[name="teacher_id"]'), { label: TEACHER.name });
    await guide.say('اجعل حالة الفصل «نشط» حتى يظهر في الحضور والرسوم.');
    await guide.select(modal(page).locator('select[name="status"]'), 'active');
    await guide.say('اختر الفئة العمرية: منها يأخذ الفصل نظام الدفع ومبالغ الرسوم.');
    const ageValue = await modal(page)
      .locator('select[name="age_group_id"] option', { hasText: 'الأطفال' })
      .first()
      .getAttribute('value');
    await guide.select(modal(page).locator('select[name="age_group_id"]'), ageValue);
    await guide.say('حدد يوم الحصة ووقتها، ثم اضغط «إضافة الفصل».');
    const days = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    await guide.select(
      modal(page).locator('label', { hasText: 'اليوم' }).locator('..').locator('select'),
      days[new Date().getDay()],
    );
    await guide.click(modal(page).locator('button:has-text("بعد صلاة الفجر")').first());
    await guide.click(modal(page).getByRole('button', { name: 'إضافة الفصل' }));
    await expectToast(page, 'success', `تمت إضافة الفصل "${CLASS_NAME}" بنجاح!`);
    await expectNoModal(page);

    await guide.say('لتسجيل الطلاب في الفصل، اضغط زر «إدارة الطلاب» في سطر الفصل.');
    const classRow = page.locator('table tbody tr', { hasText: CLASS_NAME });
    await guide.click(classRow.locator('button.btn-outline-primary').first());
    await expect(modal(page).locator('.modal-title')).toContainText(
      `إدارة الطلاب في فصل: ${CLASS_NAME}`,
    );
    await guide.say(
      'في عمود «الطلاب المتاحون» اضغط زر الإضافة بجانب كل طالب، فينتقل إلى «الطلاب المسجلون».',
    );
    const available = modal(page).locator('.enrollment-list').nth(1);
    const enrolled = modal(page).locator('.enrollment-list').first();
    for (const student of STUDENTS) {
      await guide.click(
        available
          .locator('.list-group-item', { hasText: student.name })
          .locator('button.text-success'),
        { after: 400 },
      );
      await expect(enrolled.locator('.list-group-item', { hasText: student.name })).toBeVisible();
    }
    await guide.say('اضغط «حفظ التغييرات». تُحسب رسوم الشهر الحالي للطلاب عند تسجيلهم.');
    await guide.click(modal(page).getByRole('button', { name: 'حفظ التغييرات' }));
    await expectToast(page, 'success', 'تم تحديث قائمة الطلاب بنجاح!');
    await expectNoModal(page);

    // ------------------------------------------------------------------ 11. Attendance
    await guide.chapter('تسجيل الحضور والغياب', 'سجّل حضور طلاب كل حصة في دقيقة.');
    await guide.say('افتح «الحضور والغياب».');
    await guide.click(sidebar(page, 'الحضور والغياب'));
    await expect(page.getByRole('heading', { name: 'تسجيل الحضور والغياب' })).toBeVisible();
    await guide.say('اختر الفصل. التاريخ هو تاريخ اليوم، ويمكن تغييره لتسجيل حصة سابقة.');
    const classSelect = page.locator('select#classSelect');
    await expect(classSelect).not.toBeDisabled();
    await guide.select(classSelect, { label: CLASS_NAME });
    const absent = page.locator('table tbody tr', { hasText: STUDENTS[2].name });
    await expect(absent).toBeVisible();
    await guide.say('حدد حالة كل طالب. هنا نسجل غياب طالب واحد.');
    await guide.click(absent.getByRole('button', { name: 'غياب' }));
    await guide.say('اضغط «حفظ التغييرات». يُحفظ السجل ويُغلق للتعديل حمايةً للبيانات.');
    await guide.click(page.getByRole('button', { name: 'حفظ التغييرات' }));
    await expectToast(page, 'success', 'تم حفظ سجل الحضور بنجاح!');
    await expect(page.locator('.alert-info')).toContainText('هذا السجل محفوظ ومغلق للتعديل');
    await guide.say('تظهر الحصص المسجلة في قائمة جانبية، ويمكن فتحها للمراجعة.');

    // ------------------------------------------------------------------ 12. Student fees
    await guide.chapter('رسوم الطلاب', 'متابعة ما على كل طالب وتسجيل الدفعات وطباعة الوصل.');
    await guide.say('افتح «الشؤون المالية» ثم تبويب «رسوم الطلاب».');
    await guide.click(sidebar(page, 'الشؤون المالية'));
    await openTab(guide, 'رسوم الطلاب');
    await guide.say(
      'زر «توليد الرسوم» يُنشئ الرسوم المستحقة لكل الطلاب. يقوم البرنامج بذلك تلقائياً كل شهر، ويمكنك تشغيله يدوياً.',
    );
    await guide.click(page.getByRole('button', { name: 'توليد الرسوم' }).first());
    await expect(modal(page).locator('.modal-title')).toHaveText('توليد رسوم الطلاب');
    await guide.click(modal(page).getByRole('button', { name: 'توليد الرسوم' }));
    await expectToast(page, 'success', 'تم إنشاء جميع الرسوم بنجاح');
    await expectNoModal(page);

    const payer = STUDENTS[0].name;
    const payerRow = activePane(page).locator('tbody tr', { hasText: payer });
    await expect(payerRow).toBeVisible();
    await guide.say('يعرض الجدول لكل طالب: المبلغ المطلوب، المدفوع، المتبقي، وحالة الدفع.');
    await guide.point(payerRow, 2000);
    await guide.say('لتسجيل دفعة، اضغط الزر الأخضر في سطر الطالب.');
    await guide.click(payerRow.locator('button.btn-success'));
    await expect(modal(page).locator('.modal-title')).toHaveText('تسجيل دفعة جديدة');
    await guide.say('أدخل المبلغ المدفوع. يُسدَّد به الأقدم فالأقدم، وما زاد يُحفظ رصيداً للطالب.');
    await guide.type(modal(page).locator('input[type="number"]').first(), '50');
    await guide.say('أدخل رقم الوصل. لا يمكن استعمال نفس الرقم مرتين.');
    await guide.type(modal(page).getByPlaceholder('أدخل رقم الوصل'), 'R-0001');
    await guide.say('اضغط «تسجيل الدفعة». تُضاف الدفعة تلقائياً إلى مداخيل الفرع.');
    await guide.click(modal(page).getByRole('button', { name: 'تسجيل الدفعة' }));
    await expectToast(page, 'success', 'تم تسجيل الدفعة بنجاح');
    await expectNoModal(page);
    await guide.say(
      'يتحدث رصيد الطالب فوراً. في نافذة الدفع تجد سجل دفعاته مع إمكانية الطباعة أو الحذف أو الاسترجاع.',
    );
    await guide.point(payerRow, 1800);

    // ------------------------------------------------------------------ 13. Income, expenses, inventory
    await guide.chapter(
      'المداخيل والمصاريف والجرد',
      'سجّل كل عملية مالية بوصلها، وكل ما يملكه الفرع من معدات.',
    );
    await guide.say('في تبويب «المداخيل» اضغط «إضافة مدخول» لتسجيل تبرع أو أي مدخول آخر.');
    await openTab(guide, 'المداخيل');
    await guide.click(activePane(page).getByRole('button', { name: 'إضافة مدخول' }));
    await expect(modal(page).locator('.modal-title')).toHaveText('إضافة مدخول');
    await guide.say('أدخل التاريخ ورقم الوصل ونوع المدخول والمبلغ.');
    await guide.fill(modal(page).locator('input[name="transaction_date"]'), today());
    await guide.type(modal(page).locator('input[name="voucher_number"]'), 'D-0001');
    await guide.select(modal(page).locator('select[name="receipt_type"]'), 'تبرع');
    await guide.type(modal(page).locator('input[name="amount"]'), '250');
    await guide.say('اضغط «حفظ». يظهر وصل الاستلام جاهزاً للطباعة.');
    await guide.click(modal(page).getByRole('button', { name: 'حفظ' }));
    await expectToast(page, 'success', 'تم إضافة المدخول بنجاح');
    await expect(modal(page).locator('.modal-title')).toHaveText('وصل استلام');
    await guide.pause(2200);
    await guide.click(modal(page).getByRole('button', { name: 'إغلاق', exact: true }));
    await expectNoModal(page);

    await guide.say('بنفس الطريقة تُسجَّل المصاريف في تبويب «المصاريف» مع إذن بالدفع.');
    await openTab(guide, 'المصاريف');
    await guide.click(activePane(page).getByRole('button', { name: 'إضافة مصروف' }));
    await expect(modal(page).locator('.modal-title')).toHaveText('إضافة مصروف');
    await guide.fill(modal(page).locator('input[name="transaction_date"]'), today());
    await guide.select(modal(page).locator('select[name="category"]'), 'نفقات متنوعة');
    await guide.type(modal(page).locator('input[name="voucher_number"]'), 'P-0001');
    await guide.type(modal(page).locator('input[name="amount"]'), '80');
    await guide.click(modal(page).getByRole('button', { name: 'حفظ' }));
    await expectToast(page, 'success', 'تم إضافة المصروف بنجاح');
    await expect(modal(page).locator('.modal-title')).toHaveText('إذن بالدفع');
    await guide.pause(1500);
    await guide.click(modal(page).getByRole('button', { name: 'إغلاق', exact: true }));
    await expectNoModal(page);

    await guide.say(
      'تبويب «إدارة الفئات» يحتوي أصناف المعدات المستعملة في الجرد والتبرعات العينية.',
    );
    await openTab(guide, 'إدارة الفئات');
    await guide.show(
      page.getByRole('button', { name: '+ إضافة فئة' }),
      'زر «إضافة فئة» يضيف صنفاً جديداً، مثلاً «أثاث».',
    );

    await guide.say('في تبويب «الجرد» تسجّل ما يملكه الفرع. اضغط «إضافة صنف جديد».');
    await openTab(guide, 'الجرد');
    await guide.click(activePane(page).getByRole('button', { name: 'إضافة صنف جديد' }));
    await expect(modal(page).locator('.modal-title')).toHaveText('إضافة صنف جديد');
    await guide.say('أدخل اسم الصنف وفئته والكمية وقيمة الوحدة، ثم اضغط «إضافة الصنف».');
    await guide.type(modal(page).locator('input[name="item_name"]'), INVENTORY_ITEM.name);
    await guide.select(modal(page).locator('select[name="category"]'), INVENTORY_ITEM.category);
    await guide.type(modal(page).locator('input[name="quantity"]'), INVENTORY_ITEM.quantity);
    await guide.type(modal(page).locator('input[name="unit_value"]'), INVENTORY_ITEM.unitValue);
    await guide.click(modal(page).getByRole('button', { name: 'إضافة الصنف' }));
    await expectToast(page, 'success', 'تمت إضافة الصنف بنجاح.');
    await expectNoModal(page);
    await guide.point(activePane(page).locator('tbody tr', { hasText: INVENTORY_ITEM.name }), 1500);

    // ------------------------------------------------------------------ 14. Dashboard & reports
    await guide.chapter('لوحة التحكم المالية والتقارير', 'تابع وضع الفرع وصدّر تقاريره.');
    await guide.say(
      'في «لوحة التحكم» ترى مجموع المداخيل والمصاريف والرصيد للفترة المختارة، مع التوزيع حسب الأصناف.',
    );
    await openTab(guide, 'لوحة التحكم');
    await expect(
      activePane(page).locator('.card-body', { hasText: 'إجمالي المداخيل' }),
    ).toBeVisible();
    await guide.pause(2500);
    await guide.say('في تبويب «التقارير المالية» اختر الفترة، ثم صدّر التقرير المالي بصيغة Word.');
    await openTab(guide, 'التقارير المالية');
    const reportPath = path.join(videoDir, 'financial-report.docx');
    await app.evaluate(({ dialog }, target) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
    }, reportPath);
    await guide.click(
      activePane(page).getByRole('button', { name: 'تصدير التقرير المالي (Word)' }),
    );
    await expect(activePane(page).locator('.alert-success').first()).toContainText(
      'تم تصدير التقرير المالي بنجاح!',
    );
    expect(fs.existsSync(reportPath)).toBe(true);
    await guide.show(
      activePane(page).getByRole('button', { name: 'تصدير سجل المحاسبة (Excel)' }),
      'وبنفس الطريقة تصدّر سجل المحاسبة الشهري وسجل الجرد بصيغة Excel.',
    );

    // ------------------------------------------------------------------ 15. Profile, about, logout
    await guide.chapter('حسابي، حول التطبيق، والخروج', 'إدارة حسابك الشخصي وإنهاء العمل.');
    await guide.say('في «ملفي الشخصي» تعدّل بياناتك الشخصية.');
    await guide.click(sidebar(page, 'ملفي الشخصي'));
    await guide.show(
      page.getByRole('button', { name: 'تغيير كلمة المرور' }),
      'ومن هنا تغيّر كلمة مرورك: اكتب كلمة المرور الحالية ثم الجديدة مرتين.',
    );
    await guide.say('صفحة «حول التطبيق» تعرض نسخة البرنامج وطرق الحصول على الدعم.');
    await guide.click(sidebar(page, 'حول التطبيق'));
    await expect(page.getByRole('heading', { name: 'حول التطبيق' })).toBeVisible();
    await guide.pause(2000);
    await guide.say(
      'في نهاية العمل، أنشئ نسخة احتياطية إن لم يكن النسخ التلقائي مفعّلاً، ثم اضغط «خروج» حتى لا يبقى البرنامج مفتوحاً.',
    );
    await guide.click(page.locator('button.logout-btn'));
    await expect(page.getByRole('heading', { name: 'تسجيل الدخول' })).toBeVisible();
    await guide.say('تم إعداد الفرع بنجاح. شكراً لمتابعتك هذا الدليل.', { hold: 1500 });
    await guide.finish();
  } finally {
    const video = (await app.windows())[0]?.video();
    await app.close().catch(() => {});
    fs.rmSync(userDataDir, { recursive: true, force: true });

    if (guide && video) {
      fs.mkdirSync(OUT_DIR, { recursive: true });
      const target = path.join(OUT_DIR, 'guide.webm');
      await video.saveAs(target);
      // The video starts with the window; the guide clock starts once the window is ready.
      guide.writeTimeline(OUT_DIR, {
        offsetMs: Math.max(0, guide.start - guide.windowAt + AV_SHIFT_MS),
        videoFile: 'guide.webm',
      });
    }
    fs.rmSync(videoDir, { recursive: true, force: true });
  }
});
