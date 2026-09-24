/**
 * Real-world scenario, phase 2: move the seeded branch to a new computer.
 * Restore the encrypted handoff backup into a fresh install, prove nothing was
 * lost, keep working as the real staff would, and check the results stay consistent.
 */
const fs = require('fs');
const path = require('path');
const {
  test,
  expect,
  launchApp,
  setupSuperadmin,
  login,
  logout,
  dismissOnboarding,
  navigate,
  modal,
  expectNoModal,
  expectToast,
} = require('../fixtures');
const { readManifest, HANDOFF_DIR } = require('./data');

const NEW_STUDENTS = [
  { name: 'سفيان بن عبد الكريم العودي', gender: 'Male', age: 25 },
  { name: 'إيناس بنت محمد الترتكي', gender: 'Female', age: 12 },
  { name: 'معز بن علي الجبالي', gender: 'Male', age: 30 },
  { name: 'وفاء بنت صالح الصغير', gender: 'Female', age: 10 },
  { name: 'كمال بن محمود النفزي', gender: 'Male', age: 22 },
];
const EDITED_PHONE = '99123456';
// The new computer's own first account. The restore must replace it with the branch's users.
const TEMP_ADMIN = { username: 'newpcadmin', password: 'new-pc-pass-1' };
const CLASS_STATUS_LABELS = { pending: 'قيد الانتظار', active: 'نشط', completed: 'منتهي' };
const NEW_EXPENSE_AMOUNT = 200;

function activePane(page) {
  return page.locator('.tab-pane.active');
}

function midMonthDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-15`;
}

function yearsAgo(years) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setDate(d.getDate() - 30);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

function todayLocalISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

function manifestDateLocal(isoString) {
  const d = new Date(isoString);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

function formatNumber(page, value) {
  return page.evaluate(
    (v) =>
      new Intl.NumberFormat('ar-TN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
        v,
      ),
    value,
  );
}

function summaryValue(page, title) {
  return activePane(page)
    .locator('.card-title', { hasText: title })
    .locator('xpath=following-sibling::h3');
}

async function openTab(page, title) {
  const tab = page.getByRole('tab', { name: title, exact: true });
  if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}

async function stubDialogs(electronApp, { saveTo, openFile, openDir }) {
  await electronApp.evaluate(
    ({ dialog }, target) => {
      if (target.saveTo) {
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: target.saveTo });
      }
      if (target.openFile || target.openDir) {
        dialog.showOpenDialog = async () => ({
          canceled: false,
          filePaths: [target.openFile || target.openDir],
        });
      }
    },
    { saveTo, openFile, openDir },
  );
}

async function stubRelaunch(electronApp) {
  await electronApp.evaluate(({ app: electronApp }) => {
    electronApp.relaunch = () => {};
    electronApp.exit = () => {};
  });
}

async function addStudent(page, s) {
  await navigate(page, 'شؤون الطلاب');
  await page.getByRole('button', { name: 'إضافة طالب' }).click();
  await modal(page).locator('#formStudentName').fill(s.name);
  await modal(page).locator('#formStudentDob').fill(yearsAgo(s.age));
  await modal(page).locator('#formStudentGender').selectOption(s.gender);
  await modal(page).getByRole('button', { name: 'إضافة الطالب' }).click();
  await expectToast(page, 'success', `تمت إضافة الطالب "${s.name}" بنجاح!`);
  await expectNoModal(page);
}

async function activateClass(page, className) {
  await navigate(page, 'الفصول الدراسية');
  const row = page.locator('tbody tr', { hasText: className });
  await row.getByRole('button', { name: 'تعديل الفصل' }).click();
  await expect(modal(page).locator('.modal-title')).toHaveText('تعديل الفصل الدراسي');
  await modal(page).locator('select[name="status"]').selectOption('active');
  await modal(page).getByRole('button', { name: 'حفظ التعديلات' }).click();
  await expectToast(page, 'success', `تم تحديث بيانات الفصل "${className}" بنجاح!`);
  await expectNoModal(page);
}

async function enrollInClass(page, className, names) {
  await navigate(page, 'الفصول الدراسية');
  await page
    .locator('tbody tr', { hasText: className })
    .locator('button.btn-outline-primary')
    .first()
    .click();
  await expect(modal(page).locator('.modal-title')).toContainText(className);
  const available = modal(page).locator('.enrollment-list').nth(1);
  for (const name of names) {
    await available
      .locator('.list-group-item', { hasText: name })
      .locator('input[type="checkbox"]')
      .check();
  }
  await modal(page)
    .getByRole('button', { name: `تسجيل (${names.length})` })
    .click();
  const enrolled = modal(page).locator('.enrollment-list').first();
  await expect(enrolled.locator('.list-group-item')).toHaveCount(names.length);
  await modal(page).getByRole('button', { name: 'حفظ التغييرات' }).click();
  await expectToast(page, 'success', 'تم تحديث قائمة الطلاب بنجاح!');
  await expectNoModal(page);
}

async function recordFeePayment(page, name, amount, receipt) {
  await openTab(page, 'رسوم الطلاب');
  const search = activePane(page).getByPlaceholder('البحث بالاسم...');
  await search.fill(name);
  const row = activePane(page).locator('tbody tr', { hasText: name });
  await expect(row).toHaveCount(1);
  await row.locator('button', { hasText: 'تسجيل دفعة' }).click();
  await expect(modal(page).locator('.modal-title')).toHaveText('تسجيل دفعة جديدة');
  await modal(page).locator('input[type="number"]').first().fill(String(amount));
  await modal(page).locator('input[placeholder="أدخل رقم الوصل"]').fill(receipt);
  await modal(page).getByRole('button', { name: 'تسجيل الدفعة' }).click();
  await expectToast(page, 'success', 'تم تسجيل الدفعة بنجاح');
  await expectNoModal(page);
  await search.clear();
}

async function addExpense(page, voucher, amount) {
  await openTab(page, 'المصاريف');
  await activePane(page).getByRole('button', { name: 'إضافة مصروف' }).click();
  await expect(modal(page).locator('.modal-title')).toHaveText('إضافة مصروف');
  await modal(page).locator('input[name="transaction_date"]').fill(midMonthDate());
  await modal(page).locator('select[name="category"]').selectOption('نفقات متنوعة');
  await modal(page).locator('input[name="voucher_number"]').fill(voucher);
  await modal(page).locator('input[name="amount"]').fill(String(amount));
  await modal(page).getByRole('button', { name: 'حفظ' }).click();
  await expectToast(page, 'success', 'تم إضافة المصروف بنجاح');
  await modal(page).getByRole('button', { name: 'إغلاق', exact: true }).click();
  await expectNoModal(page);
}

async function markAttendance(page, className, marks, date) {
  await navigate(page, 'الحضور والغياب');
  if (date) await page.locator('#dateSelect').fill(date);
  await page.locator('#classSelect').selectOption({ label: className });
  for (const [name, status] of marks) {
    await page.locator('tbody tr', { hasText: name }).getByRole('button', { name: status }).click();
  }
  await page.getByRole('button', { name: 'حفظ التغييرات' }).click();
  await expectToast(page, 'success', 'تم حفظ سجل الحضور بنجاح!');
  await expect(page.getByText('هذا السجل محفوظ ومغلق للتعديل')).toBeVisible();
}

async function expectAttendanceStatus(page, name, status) {
  const row = page.locator('tbody tr', { hasText: name });
  const expectedClass =
    status === 'حضور' ? 'btn-success' : status === 'غياب' ? 'btn-danger' : 'btn-warning';
  await expect(row.getByRole('button', { name: status })).toHaveClass(new RegExp(expectedClass));
}

async function relogin(page, user) {
  await logout(page);
  await login(page, user);
  await dismissOnboarding(page);
  await expect(page.locator('.topbar')).toBeVisible();
}

async function restoreHandoff() {
  const manifest = readManifest();
  const backupPath = path.join(HANDOFF_DIR, manifest.backupFile);
  expect(fs.existsSync(backupPath)).toBe(true);

  const launched = await launchApp();
  const app = launched.app;
  const userDataDir = launched.userDataDir;
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');

  await setupSuperadmin(page, TEMP_ADMIN);
  await login(page, TEMP_ADMIN);
  await dismissOnboarding(page);
  await expect(page.locator('.topbar')).toBeVisible();

  await stubDialogs(app, { openFile: backupPath });
  await stubRelaunch(app);

  await navigate(page, 'الإعدادات');
  await openTab(page, 'النسخ الاحتياطي');
  await activePane(page).getByRole('button', { name: 'استيراد قاعدة بيانات محلية' }).click();

  await expect(modal(page).locator('.modal-title')).toHaveText('الخطوة الأخيرة: تأكيد الهوية');
  await modal(page)
    .locator('input[placeholder="أدخل كلمة المرور الخاصة بك"]')
    .fill(TEMP_ADMIN.password);
  await modal(page)
    .locator('input[placeholder="رمز النسخة الاحتياطية (اتركه فارغاً إذا كان غير مطلوب)"]')
    .fill(manifest.transferKey);
  await modal(page).getByRole('button', { name: 'تأكيد' }).click();

  await expect(
    page
      .locator('.Toastify__toast--success', {
        hasText: 'تم استيراد قاعدة البيانات بنجاح!',
      })
      .first(),
  ).toBeVisible({ timeout: 120_000 });

  await app.close();

  const relaunched = await launchApp({ userDataDir });
  const app2 = relaunched.app;
  const page2 = await app2.firstWindow();
  await page2.waitForLoadState('domcontentloaded');
  // The new computer's account was replaced by the restored database.
  await login(page2, TEMP_ADMIN);
  await expect(page2.locator('.alert-danger')).toBeVisible();
  await expect(page2.locator('.topbar')).toHaveCount(0);

  await login(page2, manifest.superadmin);
  await dismissOnboarding(page2);
  await expect(page2.locator('.topbar')).toBeVisible();

  return { app: app2, page: page2, userDataDir, manifest };
}

async function assertSidebarForRole(page, role) {
  await expect(page.locator('a.nav-link', { hasText: 'الرئيسية' })).toBeVisible();
  const expected = [];
  const notExpected = [];
  if (role === 'Superadmin') {
    expected.push(
      'شؤون الطلاب',
      'شؤون المعلمين',
      'الفصول الدراسية',
      'الحضور والغياب',
      'الشؤون المالية',
      'إدارة المستخدمين',
      'الإعدادات',
    );
  } else if (role === 'Administrator') {
    expected.push(
      'شؤون الطلاب',
      'شؤون المعلمين',
      'الفصول الدراسية',
      'الحضور والغياب',
      'إدارة المستخدمين',
    );
    notExpected.push('الشؤون المالية', 'الإعدادات');
  } else if (role === 'FinanceManager') {
    expected.push('شؤون الطلاب', 'الشؤون المالية');
    notExpected.push('شؤون المعلمين', 'الفصول الدراسية', 'الحضور والغياب', 'إدارة المستخدمين');
  } else if (role === 'SessionSupervisor') {
    expected.push('شؤون الطلاب', 'الفصول الدراسية', 'الحضور والغياب');
    notExpected.push('شؤون المعلمين', 'الشؤون المالية', 'إدارة المستخدمين');
  }
  for (const label of expected) {
    await expect(page.locator('a.nav-link', { hasText: label })).toBeVisible();
  }
  for (const label of notExpected) {
    await expect(page.locator('a.nav-link', { hasText: label })).toHaveCount(0);
  }
}

// This test manages its own app launches (restore needs a relaunch on the same data),
// so it takes no app fixtures.
// eslint-disable-next-line no-empty-pattern
test('real-world continuation: restore, verify and keep working', async ({}, testInfo) => {
  test.setTimeout(30 * 60_000);

  const manifest = readManifest();

  const seedDate = manifestDateLocal(manifest.createdAt);
  const isToday = seedDate === todayLocalISO();

  const previousActiveClasses = manifest.classes.filter((c) => c.status === 'active').length;

  const expectedInitialPaid = manifest.fees.paidInFull.length;
  const expectedInitialPartial = manifest.fees.partial.length;
  const expectedInitialUnpaid = manifest.fees.unpaidCount;

  let app;
  let userDataDir;
  let page;

  try {
    await test.step('fresh install, temporary admin and restore', async () => {
      const restored = await restoreHandoff();
      app = restored.app;
      page = restored.page;
      userDataDir = restored.userDataDir;
    });

    await test.step('association settings survived in sidebar and settings page', async () => {
      await expect(page.locator('.sidebar .branch-name')).toHaveText(manifest.association.local);
      await expect(page.locator('.sidebar .national-name')).toHaveText(
        manifest.association.national,
      );
      await navigate(page, 'الإعدادات');
      await expect(page.locator('input[name="national_association_name"]')).toHaveValue(
        manifest.association.national,
      );
      await expect(page.locator('input[name="regional_association_name"]')).toHaveValue(
        manifest.association.regional,
      );
      await expect(page.locator('input[name="local_branch_name"]')).toHaveValue(
        manifest.association.local,
      );
      await expect(page.locator('input[name="president_full_name"]')).toHaveValue(
        manifest.association.president,
      );
      await openTab(page, 'إعدادات الرسوم');
      await expect(page.locator('input[name="annual_fee"]')).toHaveValue(
        String(manifest.settings.annualFee),
      );
    });

    await test.step('student list scale and search', async () => {
      await navigate(page, 'شؤون الطلاب');
      await expect(
        page.getByText(`عرض 1 إلى 25 من أصل ${manifest.students.total} عنصر`),
      ).toBeVisible();
      for (const name of manifest.students.sample) {
        await page.getByPlaceholder('البحث بالاسم أو الرقم التعريفي...').fill(name);
        await expect(page.locator('table.students-table tbody tr')).toHaveCount(1);
        await expect(page.locator('table.students-table tbody tr')).toContainText(name);
        await page.getByPlaceholder('البحث بالاسم أو الرقم التعريفي...').clear();
      }
    });

    await test.step('all teachers survived', async () => {
      await navigate(page, 'شؤون المعلمين');
      await expect(page.locator('tbody tr')).toHaveCount(manifest.teachers.length);
      for (const name of manifest.teachers) {
        await expect(page.locator('tbody tr', { hasText: name })).toBeVisible();
      }
    });

    await test.step('all classes survived with teacher and age group', async () => {
      await navigate(page, 'الفصول الدراسية');
      await expect(page.locator('tbody tr')).toHaveCount(manifest.classes.length);
      for (const c of manifest.classes) {
        const row = page.locator('tbody tr', { hasText: c.name });
        await expect(row).toBeVisible();
        await expect(row).toContainText(c.teacher);
        await expect(row).toContainText(c.ageGroup);
        await expect(row.locator('.badge')).toHaveText(CLASS_STATUS_LABELS[c.status]);
      }
    });

    await test.step('each class enrolled students survived', async () => {
      for (const c of manifest.classes.filter((x) => x.enrolled.length > 0)) {
        await navigate(page, 'الفصول الدراسية');
        await page
          .locator('tbody tr', { hasText: c.name })
          .locator('button.btn-outline-primary')
          .first()
          .click();
        await expect(modal(page).locator('.modal-title')).toContainText(c.name);
        const enrolled = modal(page).locator('.enrollment-list').first();
        await expect(enrolled.locator('.list-group-item')).toHaveCount(c.enrolled.length);
        for (const name of c.enrolled) {
          await expect(enrolled.locator('.list-group-item', { hasText: name })).toBeVisible();
        }
        await modal(page).getByRole('button', { name: 'إلغاء', exact: true }).click();
        await expectNoModal(page);
      }
    });

    await test.step('today attendance marks survived', async () => {
      await navigate(page, 'الحضور والغياب');
      if (!isToday) await page.locator('#dateSelect').fill(seedDate);

      for (const [className, record] of Object.entries(manifest.attendanceToday)) {
        await page.locator('#classSelect').selectOption({ label: className });
        for (const name of record.absent) {
          await expectAttendanceStatus(page, name, 'غياب');
        }
        for (const name of record.late) {
          await expectAttendanceStatus(page, name, 'تأخر');
        }
      }
    });

    await test.step('financial dashboard totals survived', async () => {
      await navigate(page, 'الشؤون المالية');
      await openTab(page, 'لوحة التحكم');
      await expect(summaryValue(page, 'إجمالي المداخيل')).toContainText(
        await formatNumber(page, manifest.finance.incomeTotal),
      );
      await expect(summaryValue(page, 'إجمالي المصاريف')).toContainText(
        await formatNumber(page, manifest.finance.expenseTotal),
      );
      await expect(summaryValue(page, 'الرصيد الصافي')).toContainText(
        await formatNumber(page, manifest.finance.incomeTotal - manifest.finance.expenseTotal),
      );
      await expect(summaryValue(page, 'عدد العمليات')).toContainText(
        await formatNumber(page, manifest.finance.transactionCount),
      );
    });

    await test.step('fee status summary survived', async () => {
      await openTab(page, 'رسوم الطلاب');
      await expect(summaryValue(page, 'عدد الطلاب المسددين')).toContainText(
        await formatNumber(page, expectedInitialPaid),
      );
      await expect(summaryValue(page, 'الطلاب الذين دفعوا جزئياً')).toContainText(
        await formatNumber(page, expectedInitialPartial),
      );
      await expect(summaryValue(page, 'الطلاب غير المسددين')).toContainText(
        await formatNumber(page, expectedInitialUnpaid),
      );
    });

    await test.step('inventory rows survived', async () => {
      await openTab(page, 'الجرد');
      const expectedInventoryRows = manifest.finance.inventory.length + 1;
      await expect(activePane(page).locator('tbody tr')).toHaveCount(expectedInventoryRows);
      for (const item of manifest.finance.inventory) {
        await expect(
          activePane(page).locator('tbody tr', { hasText: item.itemName }),
        ).toBeVisible();
      }
      await expect(
        activePane(page).locator('tbody tr', { hasText: manifest.finance.inKind.itemName }),
      ).toBeVisible();
    });

    await test.step('every staff user can log in and sees their role sidebar', async () => {
      for (const user of Object.values(manifest.users)) {
        await relogin(page, user);
        await assertSidebarForRole(page, user.role);
      }
      await relogin(page, manifest.superadmin);
    });

    const menToEnroll = NEW_STUDENTS.filter((s) => s.gender === 'Male').map((s) => s.name);

    await test.step('superadmin: add 5 new students', async () => {
      for (const s of NEW_STUDENTS) await addStudent(page, s);
      await navigate(page, 'شؤون الطلاب');
      await expect(
        page.getByText(`عرض 1 إلى 25 من أصل ${manifest.students.total + NEW_STUDENTS.length} عنصر`),
      ).toBeVisible();
    });

    await test.step('superadmin: activate pending class and enroll 3 men', async () => {
      const pendingClass = manifest.classes.find((c) => c.status === 'pending');
      expect(pendingClass).toBeDefined();
      await activateClass(page, pendingClass.name);
      await enrollInClass(page, pendingClass.name, menToEnroll);
    });

    await test.step('session supervisor: take attendance for another today class', async () => {
      const alreadyRecorded = Object.keys(manifest.attendanceToday);
      const todayClasses = manifest.classes.filter((c) => c.meetsToday).map((c) => c.name);
      const targetClass = todayClasses.find((name) => !alreadyRecorded.includes(name));
      expect(targetClass).toBeDefined();

      await relogin(page, manifest.users.supervisor);
      const enrolled = manifest.classes.find((c) => c.name === targetClass).enrolled;
      const marks = [
        [enrolled[0], 'غياب'],
        [enrolled[1], 'تأخر'],
      ];
      await markAttendance(page, targetClass, marks);
    });

    await test.step('finance manager: complete partial payers and add an expense', async () => {
      await relogin(page, manifest.users.finance);
      await navigate(page, 'الشؤون المالية');
      const remaining = manifest.settings.annualFee - manifest.fees.partialAmount;
      let receiptIndex = 1;
      for (const name of manifest.fees.partial) {
        await recordFeePayment(page, name, remaining, `RW-CONT-${receiptIndex++}`);
      }
      await addExpense(page, 'RW-CONT-EX-001', NEW_EXPENSE_AMOUNT);
    });

    await test.step('administrator: edit a student phone and verify', async () => {
      await relogin(page, manifest.users.admin);
      await navigate(page, 'شؤون الطلاب');
      const target = NEW_STUDENTS[0].name;
      await page.getByPlaceholder('البحث بالاسم أو الرقم التعريفي...').fill(target);
      await expect(page.locator('table.students-table tbody tr')).toHaveCount(1);
      await page
        .locator('table.students-table tbody tr')
        .getByRole('button', { name: 'تعديل الطالب' })
        .click();
      await expect(modal(page).locator('.modal-title')).toHaveText('تعديل بيانات الطالب');
      await modal(page).locator('input[name="contact_info"]').fill(EDITED_PHONE);
      await modal(page).getByRole('button', { name: 'حفظ التعديلات' }).click();
      await expectToast(page, 'success', `تم تحديث بيانات الطالب "${target}" بنجاح!`);
      await expectNoModal(page);

      await page.getByPlaceholder('البحث بالاسم أو الرقم التعريفي...').fill(target);
      await page
        .locator('table.students-table tbody tr')
        .getByRole('button', { name: 'عرض تفاصيل الطالب' })
        .click();
      await expect(modal(page).locator('.modal-title')).toContainText(target);
      await expect(modal(page).locator('.detail-item', { hasText: 'رقم الهاتف' })).toContainText(
        EDITED_PHONE,
      );
      await modal(page).getByRole('button', { name: 'إغلاق' }).click();
      await expectNoModal(page);
    });

    await test.step('consistency: dashboard stats after the new work', async () => {
      await relogin(page, manifest.superadmin);
      await navigate(page, 'الرئيسية');
      const stat = (title) => page.locator('.stat-card', { hasText: title }).locator('.card-text');
      await expect(stat('الطلاب النشطون')).toHaveText(
        String(manifest.students.total + NEW_STUDENTS.length),
      );
      await expect(stat('المعلمون')).toHaveText(String(manifest.teachers.length));
      await expect(stat('الفصول النشطة')).toHaveText(String(previousActiveClasses + 1));
    });
    await test.step('consistency: fee status summary moved partial to paid', async () => {
      await navigate(page, 'الشؤون المالية');
      await openTab(page, 'رسوم الطلاب');
      const expectedPaid = expectedInitialPaid + expectedInitialPartial;
      await expect(summaryValue(page, 'عدد الطلاب المسددين')).toContainText(
        await formatNumber(page, expectedPaid),
      );
      await expect(summaryValue(page, 'الطلاب الذين دفعوا جزئياً')).toContainText(
        await formatNumber(page, 0),
      );
      await expect(summaryValue(page, 'الطلاب غير المسددين')).toContainText(
        await formatNumber(page, expectedInitialUnpaid + NEW_STUDENTS.length),
      );
    });

    await test.step('consistency: financial totals include new payments and expense', async () => {
      await openTab(page, 'لوحة التحكم');
      const addedPayments =
        manifest.fees.partial.length * (manifest.settings.annualFee - manifest.fees.partialAmount);
      const expectedIncome = manifest.finance.incomeTotal + addedPayments;
      const expectedExpense = manifest.finance.expenseTotal + NEW_EXPENSE_AMOUNT;
      await expect(summaryValue(page, 'إجمالي المداخيل')).toContainText(
        await formatNumber(page, expectedIncome),
      );
      await expect(summaryValue(page, 'إجمالي المصاريف')).toContainText(
        await formatNumber(page, expectedExpense),
      );
      await expect(summaryValue(page, 'الرصيد الصافي')).toContainText(
        await formatNumber(page, expectedIncome - expectedExpense),
      );
      await expect(summaryValue(page, 'عدد العمليات')).toContainText(
        await formatNumber(
          page,
          manifest.finance.transactionCount + manifest.fees.partial.length + 1,
        ),
      );
    });

    await test.step('consistency: class counts after activation and enrollment', async () => {
      await navigate(page, 'الفصول الدراسية');
      await expect(page.locator('tbody tr')).toHaveCount(manifest.classes.length);
      const pendingClass = manifest.classes.find((c) => c.status === 'pending');
      const row = page.locator('tbody tr', { hasText: pendingClass.name });
      await row.getByRole('button', { name: 'تعديل الفصل' }).click();
      await expect(modal(page).locator('.modal-title')).toHaveText('تعديل الفصل الدراسي');
      await expect(modal(page).locator('select[name="status"]')).toHaveValue('active');
      await modal(page).getByRole('button', { name: 'إلغاء', exact: true }).click();
      await expectNoModal(page);

      await row.locator('button.btn-outline-primary').first().click();
      await expect(modal(page).locator('.modal-title')).toContainText(pendingClass.name);
      const enrolled = modal(page).locator('.enrollment-list').first();
      await expect(enrolled.locator('.list-group-item')).toHaveCount(menToEnroll.length);
      await modal(page).getByRole('button', { name: 'إلغاء', exact: true }).click();
      await expectNoModal(page);
    });

    await test.step('make a new backup and assert a non-empty .qdb', async () => {
      const backupDir = testInfo.outputPath('final-backup');
      fs.mkdirSync(backupDir, { recursive: true });
      await stubDialogs(app, { openDir: backupDir });

      await navigate(page, 'الإعدادات');
      await openTab(page, 'النسخ الاحتياطي');
      await activePane(page).getByRole('button', { name: 'اختيار...' }).click();
      await activePane(page)
        .locator('input[name="association_transfer_key"]')
        .fill(manifest.transferKey);
      await activePane(page).getByRole('button', { name: 'نسخ احتياطي الآن' }).click();
      await expectToast(page, 'success', /تم إنشاء النسخة الاحتياطية بنجاح/);

      const backups = fs.readdirSync(backupDir).filter((f) => f.endsWith('.qdb'));
      expect(backups).toHaveLength(1);
      const backupFilePath = path.join(backupDir, backups[0]);
      const stats = fs.statSync(backupFilePath);
      expect(stats.size).toBeGreaterThan(0);
    });
  } finally {
    if (app) await app.close().catch(() => {});
    if (userDataDir) fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});
