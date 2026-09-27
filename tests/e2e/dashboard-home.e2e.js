const {
  test,
  expect,
  navigate,
  modal,
  expectNoModal,
  expectToast,
  createUser,
  logout,
  login,
  dismissOnboarding,
} = require('./fixtures');

function yearsAgoISODate(years) {
  const date = new Date();
  date.setFullYear(date.getFullYear() - years);
  return date.toISOString().split('T')[0];
}

function randomPhone() {
  return String(10000000 + Math.floor(Math.random() * 90000000));
}

async function addStudent(page, { name, dob, gender = 'Male' }) {
  await page.getByRole('button', { name: 'إضافة طالب' }).click();
  await expect(modal(page).locator('.modal-title')).toHaveText('إضافة طالب جديد');

  await modal(page).locator('input[name="name"]').fill(name);
  if (dob) {
    await modal(page).locator('input[name="date_of_birth"]').fill(dob);
  }
  await modal(page).locator('select[name="gender"]').selectOption(gender);
  await modal(page).getByRole('button', { name: 'إضافة الطالب' }).click();

  await expectToast(page, 'success', `تمت إضافة الطالب "${name}" بنجاح!`);
  await expect(modal(page)).toHaveCount(0);
}

async function addTeacher(page, { name, phone, gender = 'Male' }) {
  await page.getByRole('button', { name: 'إضافة معلم' }).click();
  await expect(modal(page)).toBeVisible();
  await expect(modal(page).locator('.modal-title', { hasText: 'إضافة معلم جديد' })).toBeVisible();

  await modal(page).locator('input[name="name"]').fill(name);
  await modal(page).locator('input[name="contact_info"]').fill(phone);
  await modal(page).locator('select[name="gender"]').selectOption(gender);

  await modal(page).getByRole('button', { name: 'إضافة المعلم' }).click();

  await expectToast(page, 'success', `تمت إضافة المعلم "${name}" بنجاح!`);
  await expectNoModal(page);
}

async function addClass(page, name, status = 'active', ageGroup = 'الأطفال', teacherName = null) {
  await navigate(page, 'الفصول الدراسية');
  await page.getByRole('button', { name: 'إضافة فصل' }).click();
  await expect(modal(page).locator('.modal-title')).toHaveText('إضافة فصل جديد');
  await modal(page).locator('input[name="name"]').fill(name);

  const ageOption = modal(page).locator('select[name="age_group_id"] option', {
    hasText: ageGroup,
  });
  const ageGroupValue = await ageOption.getAttribute('value');
  await modal(page).locator('select[name="age_group_id"]').selectOption(ageGroupValue);

  if (status !== 'pending') {
    await modal(page).locator('select[name="status"]').selectOption(status);
  }

  if (teacherName) {
    await modal(page).locator('select[name="teacher_id"]').selectOption({ label: teacherName });
  }

  // Add a schedule row for today's weekday
  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const todayEn = daysOfWeek[new Date().getDay()];
  const dayMap = {
    Sunday: 'الأحد',
    Monday: 'الإثنين',
    Tuesday: 'الثلاثاء',
    Wednesday: 'الأربعاء',
    Thursday: 'الخميس',
    Friday: 'الجمعة',
    Saturday: 'السبت',
  };
  const todayAr = dayMap[todayEn];

  // The schedule day select doesn't have a name attribute; find it by its label "اليوم"
  await modal(page)
    .locator('label', { hasText: 'اليوم' })
    .locator('..')
    .locator('select')
    .selectOption(todayAr);
  await modal(page).locator('button:has-text("بعد صلاة الفجر")').first().click();

  await modal(page).getByRole('button', { name: 'إضافة الفصل' }).click();
  await expectToast(page, 'success', `تمت إضافة الفصل "${name}" بنجاح!`);
  await expect(modal(page)).toHaveCount(0);
}

test.describe('Dashboard home page', () => {
  test('stat cards start at 0 and reflect created data after returning home', async ({
    authedPage: page,
  }) => {
    // Ensure we're on the dashboard
    await expect(page.locator('h1', { hasText: 'لوحة التحكم الرئيسية' })).toBeVisible();

    // Stat cards should start at 0 (or '...' while loading, then 0)
    // Find each card by its title and check the .card-text value
    const studentCard = page.locator('.stat-card', { hasText: 'الطلاب النشطون' });
    const teacherCard = page.locator('.stat-card', { hasText: 'المعلمون' });
    const classCard = page.locator('.stat-card', { hasText: 'الفصول النشطة' });

    await expect(studentCard.locator('.card-text')).toHaveText('0');
    await expect(teacherCard.locator('.card-text')).toHaveText('0');
    await expect(classCard.locator('.card-text')).toHaveText('0');

    // Create 2 active students
    const student1 = `طالب أول ${Date.now()}`;
    const student2 = `طالب ثاني ${Date.now() + 1}`;
    await navigate(page, 'شؤون الطلاب');
    await addStudent(page, { name: student1, dob: yearsAgoISODate(10), gender: 'Male' });
    await addStudent(page, { name: student2, dob: yearsAgoISODate(11), gender: 'Female' });

    // Create 1 teacher (contact_info exactly 8 digits)
    const teacherName = `معلم اختبار ${Date.now()}`;
    const teacherPhone = randomPhone();
    await navigate(page, 'شؤون المعلمين');
    await addTeacher(page, { name: teacherName, phone: teacherPhone, gender: 'Male' });

    // Create 1 active class with today's schedule
    const className = `فصل اختبار ${Date.now()}`;
    await addClass(page, className, 'active', 'الأطفال', teacherName);

    // Return to dashboard
    await navigate(page, 'الرئيسية');
    await expect(page.locator('h1', { hasText: 'لوحة التحكم الرئيسية' })).toBeVisible();

    // Verify stat cards updated
    await expect(studentCard.locator('.card-text')).toHaveText('2');
    await expect(teacherCard.locator('.card-text')).toHaveText('1');
    await expect(classCard.locator('.card-text')).toHaveText('1');
  });

  test('quick actions panel navigates to students, teachers and classes pages', async ({
    authedPage: page,
  }) => {
    await expect(page.locator('h1', { hasText: 'لوحة التحكم الرئيسية' })).toBeVisible();
    await expect(page.locator('text=إجراءات سريعة')).toBeVisible();

    // Click "إضافة طالب جديد" -> navigates to students page
    await page.getByRole('button', { name: 'إضافة طالب جديد' }).click();
    await expect(page.getByRole('heading', { name: 'شؤون الطلاب' })).toBeVisible();
    expect(page.url()).toContain('#/students');

    // Back to dashboard
    await navigate(page, 'الرئيسية');
    await expect(page.locator('h1', { hasText: 'لوحة التحكم الرئيسية' })).toBeVisible();

    // Click "إضافة معلم جديد" -> navigates to teachers page
    await page.getByRole('button', { name: 'إضافة معلم جديد' }).click();
    await expect(page.getByRole('heading', { name: 'شؤون المعلمين' })).toBeVisible();
    expect(page.url()).toContain('#/teachers');

    // Back to dashboard
    await navigate(page, 'الرئيسية');
    await expect(page.locator('h1', { hasText: 'لوحة التحكم الرئيسية' })).toBeVisible();

    // Click "إنشاء فصل جديد" -> navigates to classes page
    await page.getByRole('button', { name: 'إنشاء فصل جديد' }).click();
    await expect(page.getByRole('heading', { name: 'الفصول الدراسية' })).toBeVisible();
    expect(page.url()).toContain('#/classes');
  });

  test("today's classes lists a class whose schedule includes today's weekday", async ({
    authedPage: page,
  }) => {
    await expect(page.locator('h1', { hasText: 'لوحة التحكم الرئيسية' })).toBeVisible();
    await expect(page.locator('text=فصول اليوم')).toBeVisible();

    // Initially no classes for today
    await expect(page.locator('text=لا توجد فصول مجدولة لهذا اليوم')).toBeVisible();

    // Create a teacher first
    const teacherName = `معلم اليوم ${Date.now()}`;
    const teacherPhone = randomPhone();
    await navigate(page, 'شؤون المعلمين');
    await addTeacher(page, { name: teacherName, phone: teacherPhone, gender: 'Male' });

    // Create an active class with today's weekday in schedule
    const className = `فصل اليوم ${Date.now()}`;
    await addClass(page, className, 'active', 'الأطفال', teacherName);

    // Return to dashboard
    await navigate(page, 'الرئيسية');
    await expect(page.locator('h1', { hasText: 'لوحة التحكم الرئيسية' })).toBeVisible();

    // The class should now appear in "فصول اليوم"
    await expect(
      page.locator('.todays-classes-list .list-group-item', { hasText: className }),
    ).toBeVisible();
    await expect(
      page.locator('.todays-classes-list .list-group-item', { hasText: teacherName }),
    ).toBeVisible();
  });

  test('onboarding restart: button opens modal, "البدء من البداية" shows guide, "إيقاف العرض" closes it', async ({
    authedPage: page,
  }) => {
    await expect(page.locator('h1', { hasText: 'لوحة التحكم الرئيسية' })).toBeVisible();

    // Click "تشغيل دليل الإعداد" button
    await page.getByRole('button', { name: 'تشغيل دليل الإعداد' }).click();

    // Modal should open
    await expect(modal(page)).toBeVisible();
    await expect(
      modal(page).locator('.modal-title', { hasText: 'تشغيل دليل الإعداد' }),
    ).toBeVisible();

    // Click "البدء من البداية"
    await modal(page).getByRole('button', { name: 'البدء من البداية' }).click();

    // Modal closes, onboarding guide appears
    await expectNoModal(page);
    await expect(page.locator('.onboarding-guide')).toBeVisible();
    await expect(page.locator('.onboarding-guide .card-title')).toBeVisible();

    // Click "إيقاف العرض" in the guide
    await page.locator('.onboarding-guide').getByRole('button', { name: 'إيقاف العرض' }).click();

    // Guide should close
    await expect(page.locator('.onboarding-guide')).toBeHidden();
    await expect(page.locator('.onboarding-overlay')).toBeHidden();
  });

  test("fee chart shows this month's net fees and drops refunds", async ({ authedPage: page }) => {
    const chart = page.locator('.chart-card', { hasText: 'الإيرادات الشهرية' });
    await expect(chart).toBeVisible();
    const currentMonthBar = chart.locator('rect.ftn-chart-bar title').last();
    await expect(currentMonthBar).toContainText(': 0 ');

    // Annual fee, one student, generated charge, a 50 payment.
    await navigate(page, 'الإعدادات');
    await page.getByRole('tab', { name: 'إعدادات الرسوم' }).click();
    await page.locator('input[name="annual_fee"]').fill('120');
    await page.getByRole('button', { name: 'حفظ جميع التغييرات' }).click();
    await expectToast(page, 'success', /تم تحديث الإعدادات بنجاح/);
    await navigate(page, 'شؤون الطلاب');
    await addStudent(page, { name: 'رامي بن نبيل الفرجاني', dob: yearsAgoISODate(9) });
    await navigate(page, 'الشؤون المالية');
    await page.getByRole('tab', { name: 'رسوم الطلاب' }).click();
    const pane = page.locator('.tab-pane.active');
    await pane.getByRole('button', { name: 'توليد الرسوم' }).click();
    await modal(page).getByRole('button', { name: 'توليد الرسوم' }).click();
    await expectToast(page, 'success', 'تم إنشاء جميع الرسوم بنجاح');
    await expectNoModal(page);
    const feeRow = pane.locator('tbody tr', { hasText: 'رامي بن نبيل الفرجاني' });
    await feeRow.locator('button.btn-success').click();
    await modal(page).locator('input[type="number"]').first().fill('50');
    await modal(page).getByPlaceholder('أدخل رقم الوصل').fill('CHART-001');
    await modal(page).getByRole('button', { name: 'تسجيل الدفعة' }).click();
    await expectToast(page, 'success', 'تم تسجيل الدفعة بنجاح');
    await expectNoModal(page);

    await navigate(page, 'الرئيسية');
    await expect(currentMonthBar).toContainText(': 50 ');

    // Refund it: the bar goes back to 0.
    await navigate(page, 'الشؤون المالية');
    await page.getByRole('tab', { name: 'رسوم الطلاب' }).click();
    await feeRow.locator('button.btn-success').click();
    await modal(page)
      .locator('tbody tr', { hasText: 'CHART-001' })
      .getByRole('button', { name: 'استرجاع الدفعة' })
      .click();
    const confirm = page.locator('.modal.show', {
      has: page.locator('.modal-title', { hasText: 'تأكيد استرجاع الدفعة' }),
    });
    await confirm.getByRole('button', { name: 'نعم، استرجاع' }).click();
    await expectToast(page, 'success', 'تم استرجاع الدفعة بنجاح');
    await modal(page).getByRole('button', { name: 'إلغاء', exact: true }).click();
    await expectNoModal(page);

    await navigate(page, 'الرئيسية');
    await expect(currentMonthBar).toContainText(': 0 ');
  });

  test('fee chart is hidden from roles without access to finances', async ({
    authedPage: page,
  }) => {
    const supervisor = {
      username: 'chartsupervisor',
      password: 'supervisor-pass-1',
      firstName: 'وليد',
      lastName: 'المشرف',
      nationalId: '41234567',
      phone: '93234567',
    };
    await createUser(page, supervisor, 'SessionSupervisor');
    await logout(page);
    await login(page, supervisor);
    await dismissOnboarding(page);

    await expect(page.locator('h1', { hasText: 'لوحة التحكم الرئيسية' })).toBeVisible();
    await expect(page.locator('.stat-card').first()).toBeVisible();
    await expect(page.locator('.chart-card')).toHaveCount(0);
  });
});
