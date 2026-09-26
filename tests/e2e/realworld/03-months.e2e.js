/**
 * Real-world scenario, months: run the financial module of one branch from September to
 * January (and across an academic-year rollover) with the app's clock moved forward, the
 * way a branch would open the app day after day. Every expected amount below is worked out
 * from the plan in PLAN, so a wrong charge, a missed month or a double bill fails the test.
 *
 * Kept for inspection in e2e-artifacts/months/: the app data at the end (open it with
 * `npm run e2e:open-data -- months`), the monthly Word report and a summary.
 */
const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');
const {
  test,
  expect,
  launchApp,
  setAppDate,
  setupSuperadmin,
  login,
  dismissOnboarding,
  navigate,
  modal,
  expectNoModal,
  expectToast,
  logout,
  SUPERADMIN,
} = require('../fixtures');

const ARTIFACTS = path.resolve(__dirname, '..', '..', '..', 'e2e-artifacts', 'months');

const ANNUAL_FEE = 30;
const MONTHLY_FEE = 20;
const RENT = 150;
const DONATION = 100;
const SALARIES = 400; // December only

const KIDS = {
  A: { name: 'سامي بن هشام التونسي', habit: 'pays every month' },
  B: { name: 'رنا بنت فريد القصري', habit: 'pays every other month' },
  C: { name: 'وسيم بن نبيل الساحلي', habit: 'never pays' },
  D: { name: 'لينة بنت كمال البنزرتي', habit: 'pays the annual fee, then a lump sum in November' },
  E: { name: 'ياسر بن عادل الكافي', habit: 'pays 10 each month' },
  F: { name: 'دعاء بنت سليم النابلي', habit: 'prepays 150 in September' },
};
const MEN = {
  G: { name: 'عماد بن رشيد الصفاقسي', habit: 'annual payer, pays in September' },
  H: { name: 'فتحي بن عمار القابسي', habit: 'annual payer, pays in November' },
};

/**
 * One entry per simulated month: when the app is opened (billing that month, or the next
 * one from the generation day), the fee payments made, and the month's other money.
 */
const PLAN = [
  {
    month: 'سبتمبر 2026',
    period: '2026-09',
    payDate: '2026-09-05T10:00:00',
    payments: { A: 50, B: 50, D: 30, E: 10, F: 150, G: 30 },
    expenses: [{ amount: RENT, category: 'كراء وفواتير' }],
  },
  {
    month: 'أكتوبر 2026',
    period: '2026-10',
    // Opening the app on the 26th bills October early (generation day 25).
    openOn: '2026-09-26T08:30:00',
    payDate: '2026-10-05T10:00:00',
    payments: { A: 20, E: 10 },
    expenses: [{ amount: RENT, category: 'كراء وفواتير' }],
  },
  {
    month: 'نوفمبر 2026',
    period: '2026-11',
    openOn: '2026-11-02T08:30:00',
    payDate: '2026-11-03T10:00:00',
    payments: { A: 20, B: 40, D: 60, E: 10, H: 30 },
    expenses: [{ amount: RENT, category: 'كراء وفواتير' }],
  },
  {
    month: 'ديسمبر 2026',
    period: '2026-12',
    openOn: '2026-12-01T08:30:00',
    payDate: '2026-12-02T10:00:00',
    payments: { A: 20, E: 10 },
    expenses: [
      { amount: RENT, category: 'كراء وفواتير' },
      { amount: SALARIES, category: 'منح ومرتبات' },
    ],
  },
  {
    month: 'جانفي 2027',
    period: '2027-01',
    openOn: '2027-01-04T08:30:00',
    payDate: '2027-01-05T10:00:00',
    payments: { A: 20, B: 40, E: 10 },
    expenses: [{ amount: RENT, category: 'كراء وفواتير' }],
  },
];

const studentName = (key) => (KIDS[key] || MEN[key]).name;

function yearsBefore(dateIso, years) {
  const d = new Date(dateIso);
  d.setFullYear(d.getFullYear() - years);
  d.setDate(d.getDate() - 40);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

const activePane = (page) => page.locator('.tab-pane.active');

async function openTab(page, title) {
  const tab = page.getByRole('tab', { name: title, exact: true });
  if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
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

/** Closes the app and opens it again on the same data at `now`, like a new working day. */
async function openAppOn(state, now) {
  await state.app.close();
  const { app } = await launchApp({ userDataDir: state.userDataDir, now });
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  await setAppDate(app, page, now);
  await login(page, SUPERADMIN);
  await dismissOnboarding(page);
  await expect(page.locator('.topbar')).toBeVisible();
  Object.assign(state, { app, page });
}

async function addStudent(page, { name, dob, gender }) {
  await navigate(page, 'شؤون الطلاب');
  await page.getByRole('button', { name: 'إضافة طالب' }).click();
  await modal(page).locator('#formStudentName').fill(name);
  await modal(page).locator('#formStudentDob').fill(dob);
  await modal(page).locator('#formStudentGender').selectOption(gender);
  await modal(page).getByRole('button', { name: 'إضافة الطالب' }).click();
  await expectToast(page, 'success', `تمت إضافة الطالب "${name}" بنجاح!`);
  await expectNoModal(page);
}

async function addClass(page, name, ageGroup) {
  await navigate(page, 'الفصول الدراسية');
  await page.getByRole('button', { name: 'إضافة فصل' }).click();
  const form = modal(page);
  await form.locator('input[name="name"]').fill(name);
  const option = form.locator('select[name="age_group_id"] option', { hasText: ageGroup });
  await form
    .locator('select[name="age_group_id"]')
    .selectOption(await option.getAttribute('value'));
  await form.locator('select[name="status"]').selectOption('active');
  await form.getByRole('button', { name: 'إضافة الفصل' }).click();
  await expectToast(page, 'success', `تمت إضافة الفصل "${name}" بنجاح!`);
  await expectNoModal(page);
}

async function enroll(page, className, names) {
  await navigate(page, 'الفصول الدراسية');
  await page
    .locator('tbody tr', { hasText: className })
    .locator('button.btn-outline-primary')
    .first()
    .click();
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
  await modal(page).getByRole('button', { name: 'حفظ التغييرات' }).click();
  await expectToast(page, 'success', 'تم تحديث قائمة الطلاب بنجاح!');
  await expectNoModal(page);
}

async function openFeesTab(page) {
  await navigate(page, 'الشؤون المالية');
  await openTab(page, 'رسوم الطلاب');
}

function feeRow(page, name) {
  return activePane(page).locator('tbody tr', { hasText: name });
}

async function payFee(page, name, amount, receipt) {
  const search = activePane(page).getByPlaceholder('البحث بالاسم...');
  await search.fill(name);
  await expect(activePane(page).locator('tbody tr')).toHaveCount(1);
  await feeRow(page, name).locator('button.btn-success').click();
  await expect(modal(page).locator('.modal-title')).toHaveText('تسجيل دفعة جديدة');
  await modal(page).locator('input[type="number"]').first().fill(String(amount));
  await modal(page).getByPlaceholder('أدخل رقم الوصل').fill(receipt);
  await modal(page).getByRole('button', { name: 'تسجيل الدفعة' }).click();
  await expectToast(page, 'success', 'تم تسجيل الدفعة بنجاح');
  await expectNoModal(page);
  await search.clear();
}

/**
 * Fees table columns: name | total due | total paid | remaining | status | actions.
 * "Total paid" is what was applied to charges; an overpayment is kept as credit and only
 * reduces "remaining" (shown as "+X" when the student is in credit).
 */
async function expectBalance(page, name, { due, paid, credit = 0 }) {
  const cells = feeRow(page, name).locator('td');
  const remaining = due - paid - credit;
  await expect(cells.nth(1)).toHaveText(`${due.toFixed(2)} د.ت`);
  await expect(cells.nth(2)).toHaveText(`${paid.toFixed(2)} د.ت`);
  await expect(cells.nth(3)).toHaveText(
    remaining >= 0 ? `${remaining.toFixed(2)} د.ت` : `+${Math.abs(remaining).toFixed(2)} د.ت`,
  );
}

async function expectDashboardPeriod(page, preset, from, to) {
  const pane = activePane(page);
  await expect(pane.getByLabel('الفترة')).toHaveValue(preset);
  const dates = pane.locator('input[type="date"]');
  await expect(dates.nth(0)).toHaveValue(from);
  await expect(dates.nth(1)).toHaveValue(to);
}

async function openDashboard(page) {
  await navigate(page, 'الشؤون المالية');
  await openTab(page, 'لوحة التحكم');
  // Tab panes fade; wait until the active pane is the dashboard.
  await expect(
    activePane(page).getByRole('heading', { name: 'لوحة التحكم المالية' }),
  ).toBeVisible();
}

async function addTransaction(page, kind, { date, voucher, amount, category }) {
  await openTab(page, kind === 'income' ? 'المداخيل' : 'المصاريف');
  await activePane(page)
    .getByRole('button', { name: kind === 'income' ? 'إضافة مدخول' : 'إضافة مصروف' })
    .click();
  const form = modal(page);
  await form.locator('input[name="transaction_date"]').fill(date);
  if (kind === 'expense') await form.locator('select[name="category"]').selectOption(category);
  await form.locator('input[name="voucher_number"]').fill(voucher);
  if (kind === 'income') await form.locator('select[name="receipt_type"]').selectOption('تبرع');
  await form.locator('input[name="amount"]').fill(String(amount));
  await form.getByRole('button', { name: 'حفظ' }).click();
  await expectToast(
    page,
    'success',
    kind === 'income' ? 'تم إضافة المدخول بنجاح' : 'تم إضافة المصروف بنجاح',
  );
  await modal(page).getByRole('button', { name: 'إغلاق', exact: true }).click();
  await expectNoModal(page);
}

// This test manages its own launches (it reopens the app on later dates), so no app fixtures.
// eslint-disable-next-line no-empty-pattern
test('months: a branch runs its finances from September to January', async ({}, testInfo) => {
  test.setTimeout(45 * 60_000);
  fs.rmSync(ARTIFACTS, { recursive: true, force: true });
  fs.mkdirSync(ARTIFACTS, { recursive: true });

  const start = '2026-09-01T08:30:00';
  const launched = await launchApp({ now: start });
  const state = { ...launched, page: await launched.app.firstWindow() };
  await state.page.waitForLoadState('domcontentloaded');
  await setAppDate(state.app, state.page, start);

  // Running totals, updated as each month's plan is applied.
  const ledger = {};
  const all = { ...KIDS, ...MEN };
  for (const key of Object.keys(all)) {
    ledger[key] = { due: ANNUAL_FEE + (KIDS[key] ? MONTHLY_FEE : 0), paid: 0, credit: 0 };
  }
  const monthly = []; // per month: fee income, other income, expenses
  let receipt = 1;

  try {
    await test.step('1 September: set up the branch, its fees and its students', async () => {
      const { page } = state;
      await setupSuperadmin(page);
      await login(page);
      await dismissOnboarding(page);

      await navigate(page, 'الإعدادات');
      await openTab(page, 'إعدادات الرسوم');
      await page.locator('input[name="annual_fee"]').fill(String(ANNUAL_FEE));
      await page.locator('input[name="standard_monthly_fee"]').fill(String(MONTHLY_FEE));
      await page.getByRole('button', { name: 'حفظ جميع التغييرات' }).click();
      await expectToast(page, 'success', /تم تحديث الإعدادات بنجاح/);

      // Men pay once a year: set the men's age group to annual.
      await openTab(page, 'فئات عمرية');
      await activePane(page)
        .locator('tbody tr', { hasText: 'الرجال' })
        .getByRole('button', { name: 'تعديل' })
        .click();
      await modal(page).locator('select[name="payment_frequency"]').selectOption('ANNUAL');
      await modal(page).getByRole('button', { name: 'حفظ' }).click();
      await expectToast(page, 'success', 'تم تحديث الفئة العمرية بنجاح.');
      await expectNoModal(page);

      for (const { name } of Object.values(KIDS)) {
        await addStudent(page, { name, dob: yearsBefore(start, 9), gender: 'Male' });
      }
      for (const { name } of Object.values(MEN)) {
        await addStudent(page, { name, dob: yearsBefore(start, 35), gender: 'Male' });
      }
      await addClass(page, 'حلقة البراعم', 'الأطفال');
      await addClass(page, 'حلقة الرجال', 'الرجال');
      await enroll(
        page,
        'حلقة البراعم',
        Object.values(KIDS).map((s) => s.name),
      );
      await enroll(
        page,
        'حلقة الرجال',
        Object.values(MEN).map((s) => s.name),
      );

      // Generating again on the same day must not bill anything twice.
      await openFeesTab(page);
      await activePane(page).getByRole('button', { name: 'توليد الرسوم' }).click();
      await modal(page).getByRole('button', { name: 'توليد الرسوم' }).click();
      await expectToast(page, 'success', 'تم إنشاء جميع الرسوم بنجاح');
      await expectNoModal(page);

      for (const key of Object.keys(all)) await expectBalance(page, studentName(key), ledger[key]);
    });

    for (const [index, month] of PLAN.entries()) {
      await test.step(`${month.month}: bill, collect, spend, and check the month`, async () => {
        if (month.openOn) {
          await openAppOn(state, month.openOn);
          // The month is billed on opening: every active child owes one more monthly fee.
          for (const key of Object.keys(KIDS)) ledger[key].due += MONTHLY_FEE;
          await openFeesTab(state.page);
          for (const key of Object.keys(all)) {
            await expectBalance(state.page, studentName(key), ledger[key]);
          }
        }

        // Payments on the payment date: a new working day, so log in again.
        const { page } = state;
        await setAppDate(state.app, page, month.payDate);
        await logout(page);
        await login(page, SUPERADMIN);
        await expect(page.locator('.topbar')).toBeVisible();
        await openFeesTab(page);
        let feeIncome = 0;
        for (const [key, amount] of Object.entries(month.payments)) {
          await payFee(page, studentName(key), amount, `M-${receipt++}`);
          // The app applies existing credit plus the payment to outstanding charges and keeps
          // any excess as credit.
          const entry = ledger[key];
          const available = amount + entry.credit;
          const applied = Math.min(available, entry.due - entry.paid);
          entry.paid += applied;
          entry.credit = available - applied;
          feeIncome += amount;
        }
        for (const key of Object.keys(all))
          await expectBalance(page, studentName(key), ledger[key]);

        // The month's other money, dated inside the month.
        const date = `${month.period}-15`;
        await addTransaction(page, 'income', {
          date,
          voucher: `M-IN-${month.period}`,
          amount: DONATION,
        });
        let expenses = 0;
        for (const [i, expense] of month.expenses.entries()) {
          await addTransaction(page, 'expense', {
            date,
            voucher: `M-EX-${month.period}-${i + 1}`,
            ...expense,
          });
          expenses += expense.amount;
        }
        monthly[index] = { month: month.month, feeIncome, income: feeIncome + DONATION, expenses };

        // This month's financial dashboard: it opens on the current month by itself.
        await openTab(page, 'لوحة التحكم');
        // Tab panes fade; wait until the active pane is the dashboard (the income and expense
        // tabs have the same date filters).
        await expect(
          activePane(page).getByRole('heading', { name: 'لوحة التحكم المالية' }),
        ).toBeVisible();
        const [year, mm] = month.period.split('-').map(Number);
        const lastDay = new Date(year, mm, 0).getDate();
        await expectDashboardPeriod(
          page,
          'month',
          `${month.period}-01`,
          `${month.period}-${String(lastDay).padStart(2, '0')}`,
        );
        const { income } = monthly[index];
        await expect(summaryValue(page, 'إجمالي المداخيل')).toContainText(
          await formatNumber(page, income),
        );
        await expect(summaryValue(page, 'إجمالي المصاريف')).toContainText(
          await formatNumber(page, expenses),
        );
        await expect(summaryValue(page, 'الرصيد الصافي')).toContainText(
          await formatNumber(page, income - expenses),
        );
      });
    }

    await test.step('January: arrears, credit and fee status across the five months', async () => {
      const { page } = state;
      await openFeesTab(page);
      // Worked out from PLAN: A and B are settled, C owes everything, D and E are behind,
      // F's September prepayment of 150 covered September (50) and left 100 of credit, which
      // outweighs the four later months (80); G and H paid their annual fee only.
      const expected = {
        A: { due: 130, paid: 130, credit: 0 },
        B: { due: 130, paid: 130, credit: 0 },
        C: { due: 130, paid: 0, credit: 0 },
        D: { due: 130, paid: 90, credit: 0 },
        E: { due: 130, paid: 50, credit: 0 },
        F: { due: 130, paid: 50, credit: 100 },
        G: { due: 30, paid: 30, credit: 0 },
        H: { due: 30, paid: 30, credit: 0 },
      };
      for (const [key, balance] of Object.entries(expected)) {
        expect(ledger[key]).toEqual(balance);
        await expectBalance(page, studentName(key), balance);
      }
      await expect(summaryValue(page, 'عدد الطلاب المسددين')).toContainText(
        await formatNumber(page, 5),
      );
      await expect(summaryValue(page, 'الطلاب الذين دفعوا جزئياً')).toContainText(
        await formatNumber(page, 2),
      );
      await expect(summaryValue(page, 'الطلاب غير المسددين')).toContainText(
        await formatNumber(page, 1),
      );
    });

    await test.step('home dashboard chart shows each month of fees collected', async () => {
      const { page } = state;
      await navigate(page, 'الرئيسية');
      const bars = page.locator('.chart-card rect.ftn-chart-bar title');
      await expect(bars).toHaveCount(12);
      // The last five bars are September to January.
      for (const [i, m] of monthly.entries()) {
        await expect(bars.nth(7 + i)).toContainText(`: ${m.feeIncome} `);
      }
    });

    await test.step("November's Word report has November's totals", async () => {
      const { page } = state;
      const reportPath = path.join(ARTIFACTS, 'financial-report-november-2026.docx');
      await state.app.evaluate(({ dialog }, target) => {
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
      }, reportPath);
      await navigate(page, 'الشؤون المالية');
      await openTab(page, 'التقارير المالية');
      const pane = activePane(page);
      // The Word report section comes first; its month select is 0-based (10 = November).
      await pane
        .locator('select', { has: page.locator('option[value="10"]') })
        .first()
        .selectOption('10');
      await pane
        .locator('select', { has: page.locator('option[value="2026"]') })
        .first()
        .selectOption('2026');
      await pane.getByRole('button', { name: 'تصدير التقرير المالي (Word)' }).click();
      await expect(
        pane.locator('.alert-success', { hasText: 'تم تصدير التقرير المالي بنجاح!' }),
      ).toBeVisible();
      const xml = new PizZip(fs.readFileSync(reportPath)).file('word/document.xml').asText();
      const november = monthly[2];
      expect(xml).toContain(`${november.income.toFixed(3)}`);
      expect(xml).toContain(`${november.expenses.toFixed(3)}`);
    });

    fs.writeFileSync(
      path.join(ARTIFACTS, 'README.md'),
      [
        '# Months scenario — artifacts',
        '',
        'A branch run from September 2026 to January 2027 with the app clock moved forward.',
        '',
        '- `app-data/`: the app data as of January 2027. Open it with `npm run e2e:open-data -- months`',
        `  and log in as \`${SUPERADMIN.username}\` / \`${SUPERADMIN.password}\`.`,
        '  It opens on 5 January 2027; use the dashboard period picker to look at earlier months.',
        '- `financial-report-november-2026.docx`: the Word report for November 2026.',
        '- `summary.json`: the plan, each student and their final balance, and each month’s totals.',
        '',
      ].join('\n'),
    );
    fs.writeFileSync(
      path.join(ARTIFACTS, 'summary.json'),
      JSON.stringify({ plan: PLAN, students: all, balances: ledger, months: monthly }, null, 2),
    );
    await test.step('preserve the app data for inspection', async () => {
      const userDataDir = await state.app.evaluate(({ app }) => app.getPath('userData'));
      await state.app.close();
      fs.cpSync(userDataDir, path.join(ARTIFACTS, 'app-data'), { recursive: true });
    });
    testInfo.annotations.push({ type: 'artifacts', description: ARTIFACTS });
  } finally {
    await state.app.close().catch(() => {});
    fs.rmSync(state.userDataDir, { recursive: true, force: true });
  }
});

// This test manages its own launches too.
// eslint-disable-next-line no-empty-pattern
test('months: the academic year rolls over in September and keeps last year’s arrears apart', async ({}) => {
  test.setTimeout(10 * 60_000);
  const august = '2027-08-20T08:30:00';
  const launched = await launchApp({ now: august });
  const state = { ...launched, page: await launched.app.firstWindow() };
  await state.page.waitForLoadState('domcontentloaded');
  await setAppDate(state.app, state.page, august);
  const name = 'حمزة بن يونس الرقيق';

  try {
    await test.step('August 2027: a child is billed for 2026-2027 and pays the annual fee only', async () => {
      const { page } = state;
      await setupSuperadmin(page);
      await login(page);
      await dismissOnboarding(page);
      await navigate(page, 'الإعدادات');
      await openTab(page, 'إعدادات الرسوم');
      await page.locator('input[name="annual_fee"]').fill(String(ANNUAL_FEE));
      await page.locator('input[name="standard_monthly_fee"]').fill(String(MONTHLY_FEE));
      await page.getByRole('button', { name: 'حفظ جميع التغييرات' }).click();
      await expectToast(page, 'success', /تم تحديث الإعدادات بنجاح/);
      await addStudent(page, { name, dob: yearsBefore(august, 9), gender: 'Male' });
      await addClass(page, 'حلقة الصيف', 'الأطفال');
      await enroll(page, 'حلقة الصيف', [name]);

      await openFeesTab(page);
      await expectBalance(page, name, { due: ANNUAL_FEE + MONTHLY_FEE, paid: 0 });
      await payFee(page, name, ANNUAL_FEE, 'R-2027-1');
      await expectBalance(page, name, { due: ANNUAL_FEE + MONTHLY_FEE, paid: ANNUAL_FEE });
    });

    await test.step('the dashboard left open moves from August to September', async () => {
      const { app, page } = state;
      await openDashboard(page);
      await expectDashboardPeriod(page, 'month', '2027-08-01', '2027-08-31');
      // Midnight passes with the app open; the dashboard catches up when the window is used again.
      await setAppDate(app, page, '2027-09-01T08:00:00');
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
      await expectDashboardPeriod(page, 'month', '2027-09-01', '2027-09-30');
      // The current month can be switched to the current year.
      const periodSelect = activePane(page).getByLabel('الفترة');
      await periodSelect.selectOption('year');
      await expectDashboardPeriod(page, 'year', '2027-01-01', '2027-12-31');
      await periodSelect.selectOption('academicYear');
      await expectDashboardPeriod(page, 'academicYear', '2027-09-01', '2028-08-31');
      // Editing a date makes it a custom period, which no longer moves with the date.
      await activePane(page).locator('input[type="date"]').nth(0).fill('2027-06-01');
      await expect(periodSelect).toHaveValue('custom');
    });

    await test.step('2 September 2027: opening the app starts 2027-2028', async () => {
      await openAppOn(state, '2027-09-02T08:30:00');
      const { page } = state;
      await openFeesTab(page);
      // The fees list shows the current academic year: the new annual fee and September.
      await expectBalance(page, name, { due: ANNUAL_FEE + MONTHLY_FEE, paid: 0 });

      // Last year's unpaid August is kept apart: flagged on the row, not counted in this year.
      await expect(feeRow(page, name).locator('td').first()).toContainText(
        `متخلدات سابقة: ${MONTHLY_FEE.toFixed(2)} د.ت`,
      );
      await activePane(page).locator('select.filter-select').selectOption('ARREARS');
      await expect(activePane(page).locator('tbody tr')).toHaveCount(1);
      await activePane(page).locator('select.filter-select').selectOption('ALL');

      // The details show this year's charges and, separately, last year's arrears.
      await feeRow(page, name).locator('button[title="عرض التفاصيل"]').click();
      const details = modal(page);
      await expect(details.locator('.modal-title')).toHaveText('تفاصيل الرسوم');
      await expect(details).toContainText(
        `المبلغ المستحق (2027-2028): ${(ANNUAL_FEE + MONTHLY_FEE).toFixed(2)} د.ت`,
      );
      await expect(details).toContainText('رسوم سنوية - 2027-2028');
      await expect(details).toContainText('رسوم شهرية سبتمبر - 2027-2028');
      const arrears = details.locator('[data-section="previous-years-arrears"]');
      await expect(arrears).toContainText(`متخلدات السنوات السابقة: ${MONTHLY_FEE.toFixed(2)} د.ت`);
      await expect(
        arrears.locator('tr', { hasText: 'رسوم شهرية أغسطس - 2026-2027' }),
      ).toContainText(`${MONTHLY_FEE.toFixed(2)}`);
      await expect(arrears).not.toContainText('2027-2028');
      await details.getByRole('button', { name: 'إغلاق', exact: true }).click();
      await expectNoModal(page);
    });

    await test.step('a payment this year settles this year, not last year', async () => {
      const { page } = state;
      await payFee(page, name, ANNUAL_FEE, 'R-2027-2');
      await expectBalance(page, name, { due: ANNUAL_FEE + MONTHLY_FEE, paid: ANNUAL_FEE });
      await expect(feeRow(page, name).locator('td').first()).toContainText(
        `متخلدات سابقة: ${MONTHLY_FEE.toFixed(2)} د.ت`,
      );
    });

    await test.step("last year's arrears are paid from the details", async () => {
      const { page } = state;
      await feeRow(page, name).locator('button[title="عرض التفاصيل"]').click();
      await modal(page).getByRole('button', { name: 'تسديد متخلدات 2026-2027' }).click();
      const pay = modal(page);
      await expect(pay.locator('.modal-title')).toHaveText('تسجيل دفعة جديدة');
      await expect(pay).toContainText('السنة الدراسية: 2026-2027');
      await expect(pay).toContainText(`المبلغ المستحق: ${MONTHLY_FEE.toFixed(2)} د.ت`);
      await pay.locator('input[type="number"]').first().fill(String(MONTHLY_FEE));
      await pay.getByPlaceholder('أدخل رقم الوصل').fill('R-2027-3');
      await pay.getByRole('button', { name: 'تسجيل الدفعة' }).click();
      await expectToast(page, 'success', 'تم تسجيل الدفعة بنجاح');
      await expectNoModal(page);

      // This year is unchanged and the arrears flag is gone.
      await expectBalance(page, name, { due: ANNUAL_FEE + MONTHLY_FEE, paid: ANNUAL_FEE });
      await expect(feeRow(page, name).locator('td').first()).not.toContainText('متخلدات سابقة');
      await feeRow(page, name).locator('button[title="عرض التفاصيل"]').click();
      await expect(modal(page).locator('[data-section="previous-years-arrears"]')).toHaveCount(0);
      await modal(page).getByRole('button', { name: 'إغلاق', exact: true }).click();
      await expectNoModal(page);
    });
  } finally {
    await state.app.close().catch(() => {});
    fs.rmSync(state.userDataDir, { recursive: true, force: true });
  }
});

// This test manages its own launches too.
// eslint-disable-next-line no-empty-pattern
test('months: each age group has its own fees, and a student in two groups is billed by the chosen one', async ({}) => {
  test.setTimeout(10 * 60_000);
  const september = '2026-09-10T08:30:00';
  const launched = await launchApp({ now: september });
  const state = { ...launched, page: await launched.app.firstWindow() };
  await state.page.waitForLoadState('domcontentloaded');
  await setAppDate(state.app, state.page, september);

  const KIDS_GROUP = 'الأطفال';
  const MEN_GROUP = 'الرجال';
  const INTENSIVE_GROUP = 'حلقات مكثفة';
  const kid = 'كريم بن سالم العياري'; // children's group only
  const both = 'ياسين بن عادل الزواري'; // children's group and the intensive group
  const man = 'منير بن رضا الحامدي'; // men's group, which keeps the branch fees
  const kidsFees = { annual: 25, monthly: 15 };
  const intensiveMonthly = 40;

  const groupRow = (page, name) =>
    activePane(page).locator('tbody tr', {
      has: page.locator('td:first-child', { hasText: new RegExp(`^${name}$`) }),
    });
  async function editGroupFees(page, name, { annual, monthly }) {
    await groupRow(page, name).getByRole('button', { name: 'تعديل' }).click();
    await modal(page).locator('input[name="annual_fee"]').fill(String(annual));
    await modal(page).locator('input[name="monthly_fee"]').fill(String(monthly));
    await modal(page).getByRole('button', { name: 'حفظ' }).click();
    await expectToast(page, 'success', 'تم تحديث الفئة العمرية بنجاح.');
    await expectNoModal(page);
  }

  try {
    await test.step('September: branch fees, and fees for two age groups', async () => {
      const { page } = state;
      await setupSuperadmin(page);
      await login(page);
      await dismissOnboarding(page);
      await navigate(page, 'الإعدادات');
      await openTab(page, 'إعدادات الرسوم');
      await page.locator('input[name="annual_fee"]').fill(String(ANNUAL_FEE));
      await page.locator('input[name="standard_monthly_fee"]').fill(String(MONTHLY_FEE));
      await page.getByRole('button', { name: 'حفظ جميع التغييرات' }).click();
      await expectToast(page, 'success', /تم تحديث الإعدادات بنجاح/);

      await openTab(page, 'فئات عمرية');
      await editGroupFees(page, KIDS_GROUP, kidsFees);
      // Columns: name | ages | gender | payment system | annual | monthly | description | actions
      await expect(groupRow(page, KIDS_GROUP).locator('td').nth(4)).toHaveText('25.00');
      await expect(groupRow(page, KIDS_GROUP).locator('td').nth(5)).toHaveText('15.00');
      await expect(groupRow(page, MEN_GROUP).locator('td').nth(4)).toHaveText('30.00 (افتراضي)');
      await expect(groupRow(page, MEN_GROUP).locator('td').nth(5)).toHaveText('20.00 (افتراضي)');

      // A second group for the same ages, with a higher monthly fee and the branch annual fee.
      await activePane(page).getByRole('button', { name: 'إضافة فئة جديدة' }).click();
      await modal(page).locator('input[name="name"]').fill(INTENSIVE_GROUP);
      await modal(page).locator('select[name="gender"]').selectOption('any');
      await modal(page).locator('input[name="min_age"]').fill('6');
      await modal(page).locator('input[name="max_age"]').fill('11');
      await modal(page).locator('input[name="monthly_fee"]').fill(String(intensiveMonthly));
      await modal(page).getByRole('button', { name: 'حفظ' }).click();
      await expectToast(page, 'success', 'تم إنشاء الفئة العمرية بنجاح.');
      await expectNoModal(page);
      await expect(groupRow(page, INTENSIVE_GROUP).locator('td').nth(4)).toHaveText(
        '30.00 (افتراضي)',
      );

      await addStudent(page, { name: kid, dob: yearsBefore(september, 9), gender: 'Male' });
      await addStudent(page, { name: both, dob: yearsBefore(september, 9), gender: 'Male' });
      await addStudent(page, { name: man, dob: yearsBefore(september, 35), gender: 'Male' });
      await addClass(page, 'حلقة البراعم', 'الأطفال');
      await addClass(page, 'حلقة المكثف', INTENSIVE_GROUP);
      await addClass(page, 'حلقة الرجال', 'الرجال');
      await enroll(page, 'حلقة البراعم', [kid, both]);
      await enroll(page, 'حلقة المكثف', [both]);
      await enroll(page, 'حلقة الرجال', [man]);
    });

    await test.step('each student is billed by their age group', async () => {
      const { page } = state;
      await openFeesTab(page);
      await expectBalance(page, kid, { due: kidsFees.annual + kidsFees.monthly, paid: 0 });
      await expectBalance(page, man, { due: ANNUAL_FEE + MONTHLY_FEE, paid: 0 });
      // In two groups with different fees: the higher one until a group is chosen.
      await expectBalance(page, both, { due: ANNUAL_FEE + intensiveMonthly, paid: 0 });
      await expect(feeRow(page, both).locator('td').first()).toContainText('اختر فئة الرسوم');
      await expect(feeRow(page, kid).locator('td').first()).not.toContainText('اختر فئة الرسوم');
      await activePane(page).locator('select.filter-select').selectOption('FEE_GROUP');
      await expect(activePane(page).locator('tbody tr')).toHaveCount(1);
      await expect(activePane(page).locator('tbody tr')).toContainText(both);
      await activePane(page).locator('select.filter-select').selectOption('ALL');
    });

    await test.step('the admin chooses the children’s group for the student in two groups', async () => {
      const { page } = state;
      await feeRow(page, both).locator('button[title="عرض التفاصيل"]').click();
      const chooser = modal(page).locator('[data-section="fee-group"]');
      await expect(chooser).toContainText('تطبق الرسوم الأعلى حتى تختار الفئة');
      const select = chooser.getByLabel('فئة الرسوم');
      const option = select.locator('option', { hasText: KIDS_GROUP });
      await expect(option).toContainText('سنوي 25.00 / شهري 15.00');
      await select.selectOption(await option.getAttribute('value'));
      await chooser.getByRole('button', { name: 'حفظ فئة الرسوم' }).click();
      await expectToast(page, 'success', 'تم حفظ فئة الرسوم وتحديث رسوم السنة غير المدفوعة');
      await expect(chooser).toContainText(`يدفع الطالب رسوم فئة "${KIDS_GROUP}".`);
      await modal(page).getByRole('button', { name: 'إغلاق', exact: true }).click();
      await expectNoModal(page);

      await expectBalance(page, both, { due: kidsFees.annual + kidsFees.monthly, paid: 0 });
      await expect(feeRow(page, both).locator('td').first()).not.toContainText('اختر فئة الرسوم');
      await payFee(page, kid, kidsFees.annual + kidsFees.monthly, 'G-2026-1');
      await expectBalance(page, kid, {
        due: kidsFees.annual + kidsFees.monthly,
        paid: kidsFees.annual + kidsFees.monthly,
      });
    });

    const newKidsMonthly = 18;
    await test.step('a new monthly fee for the children applies from next month', async () => {
      const { page } = state;
      await navigate(page, 'الإعدادات');
      await openTab(page, 'فئات عمرية');
      await editGroupFees(page, KIDS_GROUP, { annual: kidsFees.annual, monthly: newKidsMonthly });
      // September's bills are unchanged.
      await openFeesTab(page);
      await expectBalance(page, both, { due: kidsFees.annual + kidsFees.monthly, paid: 0 });
    });

    await test.step('October: the month is billed at each group’s fee', async () => {
      await openAppOn(state, '2026-10-03T08:30:00');
      const { page } = state;
      await openFeesTab(page);
      const kidsDue = kidsFees.annual + kidsFees.monthly + newKidsMonthly;
      await expectBalance(page, kid, { due: kidsDue, paid: kidsFees.annual + kidsFees.monthly });
      await expectBalance(page, both, { due: kidsDue, paid: 0 });
      await expectBalance(page, man, { due: ANNUAL_FEE + 2 * MONTHLY_FEE, paid: 0 });

      await feeRow(page, both).locator('button[title="عرض التفاصيل"]').click();
      const details = modal(page);
      await expect(
        details.locator('tr', { hasText: 'رسوم شهرية سبتمبر - 2026-2027' }),
      ).toContainText(`${kidsFees.monthly.toFixed(2)} د.ت`);
      await expect(
        details.locator('tr', { hasText: 'رسوم شهرية أكتوبر - 2026-2027' }),
      ).toContainText(`${newKidsMonthly.toFixed(2)} د.ت`);
      await expect(details.locator('tr', { hasText: 'رسوم سنوية - 2026-2027' })).toContainText(
        `${kidsFees.annual.toFixed(2)} د.ت`,
      );
      await details.getByRole('button', { name: 'إغلاق', exact: true }).click();
      await expectNoModal(page);
    });
  } finally {
    await state.app.close().catch(() => {});
    fs.rmSync(state.userDataDir, { recursive: true, force: true });
  }
});
