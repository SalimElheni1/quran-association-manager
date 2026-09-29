/**
 * Video guide: a guided tour of the app, recorded as a video with Arabic explanations on screen.
 *
 * It sets up a branch from a fresh install, the way a new administrator would: first login,
 * fees, teachers, students, classes, attendance, student fees, income and expenses, backup.
 * Each step is explained before it happens, and every step is still checked like any other
 * e2e test, so the guide can't silently drift from the app.
 *
 * How steps are explained (QBM_GUIDE_MODE):
 * - captions (default): Arabic captions on screen.
 * - audio: a spoken Arabic narration instead (text-to-speech, see narrator.js for the engines).
 * - both: captions and narration.
 *
 * Run it with `npm run docs:guide` (or docs:guide:audio); the video, Arabic subtitles
 * (captions.vtt), chapter timings, the narration track and the written guide (guide.md) go to
 * guide-output/. `npm run docs:guide:mp4` then makes MP4 files (the full guide and one per
 * chapter, with the narration) when ffmpeg is available.
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

test.setTimeout(20 * 60 * 1000);

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

    // ------------------------------------------------------------------ 1. First run
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

    // ------------------------------------------------------------------ 2. Fee settings
    await guide.chapter('إعداد الرسوم', 'حدد مبلغ الرسوم السنوية والشهرية قبل تسجيل الطلاب.');
    await guide.say('افتح «الإعدادات» من القائمة الجانبية.');
    await guide.click(sidebar(page, 'الإعدادات'));
    await expect(
      page.getByRole('heading', { name: 'إعدادات النظام والنسخ الاحتياطي' }),
    ).toBeVisible();
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
    await guide.pause(2500);

    // ------------------------------------------------------------------ 3. Teachers
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

    // ------------------------------------------------------------------ 4. Students
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
    await guide.say('يمكنك أيضاً استيراد قائمة طلاب كاملة من ملف Excel بزر «استيراد البيانات».');

    // ------------------------------------------------------------------ 5. Classes
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

    // ------------------------------------------------------------------ 6. Attendance
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

    // ------------------------------------------------------------------ 7. Student fees
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

    // ------------------------------------------------------------------ 8. Income & expenses
    await guide.chapter(
      'المداخيل والمصاريف',
      'سجّل كل عملية مالية بوصلها، وتابع وضع الفرع في لوحة التحكم.',
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
      'في «لوحة التحكم» ترى مجموع المداخيل والمصاريف والرصيد للفترة المختارة، مع التوزيع حسب الأصناف.',
    );
    await openTab(guide, 'لوحة التحكم');
    await expect(
      activePane(page).locator('.card-body', { hasText: 'إجمالي المداخيل' }),
    ).toBeVisible();
    await guide.pause(2500);
    await guide.say(
      'من تبويب «التقارير المالية» يمكنك تصدير التقرير المالي (Word) وسجل المحاسبة (Excel).',
    );
    await openTab(guide, 'التقارير المالية');
    await guide.pause(2000);

    // ------------------------------------------------------------------ 9. Backup
    await guide.chapter('النسخ الاحتياطي', 'احمِ بيانات الفرع بنسخة احتياطية منتظمة.');
    const backupDir = path.join(videoDir, 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    await app.evaluate(({ dialog }, dir) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] });
    }, backupDir);
    await guide.say('افتح «الإعدادات» ثم تبويب «النسخ الاحتياطي».');
    await guide.click(sidebar(page, 'الإعدادات'));
    await openTab(guide, 'النسخ الاحتياطي');
    await guide.say(
      '«مفتاح نقل الجمعية» يسمح بفتح النسخة الاحتياطية على جهاز آخر. استعمل نفس المفتاح في كل أجهزة الجمعية.',
    );
    await guide.type(
      activePane(page).locator('input[name="association_transfer_key"]'),
      'my-branch-key-2026',
    );
    await guide.click(page.getByRole('button', { name: 'حفظ جميع التغييرات' }));
    await expectToast(page, 'success', /تم تحديث الإعدادات بنجاح/);
    await guide.say('اختر المجلد الذي تُحفظ فيه النسخ، ويفضل أن يكون على قرص خارجي أو مفتاح USB.');
    await guide.click(activePane(page).getByRole('button', { name: 'اختيار...' }));
    await guide.say(
      'اضغط «نسخ احتياطي الآن». يمكنك أيضاً تفعيل النسخ التلقائي اليومي أو الأسبوعي.',
    );
    await guide.click(activePane(page).getByRole('button', { name: 'نسخ احتياطي الآن' }));
    await expectToast(page, 'success', /تم إنشاء النسخة الاحتياطية بنجاح/);
    expect(fs.readdirSync(backupDir).filter((f) => f.endsWith('.qdb'))).toHaveLength(1);

    await guide.say(
      'تم إعداد الفرع بنجاح. الصفحة الرئيسية تعرض الآن طلاب الفرع وفصوله وحصص اليوم.',
      {
        hold: 500,
      },
    );
    await guide.click(sidebar(page, 'الرئيسية'));
    await expect(page.locator('h1', { hasText: 'لوحة التحكم الرئيسية' })).toBeVisible();
    await guide.pause(3000);
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
