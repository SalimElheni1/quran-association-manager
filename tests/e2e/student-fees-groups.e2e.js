const { test, expect, navigate, modal, expectNoModal, expectToast } = require('./fixtures');

const BRANCH = { annual: 30, monthly: 20 };
const KIDS_GROUP = 'الأطفال';
const KIDS_FEES = { annual: 25, monthly: 15 };
const INTENSIVE_GROUP = 'حلقات مكثفة';
const INTENSIVE_MONTHLY = 40;

function activePane(page) {
  return page.locator('.tab-pane.active');
}

// Clicking an already-selected Bootstrap tab hangs on Playwright's stability
// check; only click unselected tabs.
async function openTab(page, title) {
  const tab = page.getByRole('tab', { name: title, exact: true });
  if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}

function yearsAgo(years) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setDate(d.getDate() - 30);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

function groupRow(page, name) {
  return activePane(page).locator('tbody tr', {
    has: page.locator('td:first-child', { hasText: new RegExp(`^${name}$`) }),
  });
}

async function setBranchFees(page) {
  await navigate(page, 'الإعدادات');
  await openTab(page, 'إعدادات الرسوم');
  await page.locator('input[name="annual_fee"]').fill(String(BRANCH.annual));
  await page.locator('input[name="standard_monthly_fee"]').fill(String(BRANCH.monthly));
  await page.getByRole('button', { name: 'حفظ جميع التغييرات' }).click();
  await expectToast(page, 'success', /تم تحديث الإعدادات بنجاح/);
}

async function setGroupFees(page, name, { annual, monthly }) {
  await navigate(page, 'الإعدادات');
  await openTab(page, 'فئات عمرية');
  await groupRow(page, name).getByRole('button', { name: 'تعديل' }).click();
  await modal(page).locator('input[name="annual_fee"]').fill(String(annual));
  await modal(page).locator('input[name="monthly_fee"]').fill(String(monthly));
  await modal(page).getByRole('button', { name: 'حفظ' }).click();
  await expectToast(page, 'success', 'تم تحديث الفئة العمرية بنجاح.');
  await expectNoModal(page);
}

/** A second group for the children's ages with its own monthly fee (annual fee left to the branch). */
async function addIntensiveGroup(page) {
  await navigate(page, 'الإعدادات');
  await openTab(page, 'فئات عمرية');
  await activePane(page).getByRole('button', { name: 'إضافة فئة جديدة' }).click();
  await modal(page).locator('input[name="name"]').fill(INTENSIVE_GROUP);
  await modal(page).locator('select[name="gender"]').selectOption('any');
  await modal(page).locator('input[name="min_age"]').fill('6');
  await modal(page).locator('input[name="max_age"]').fill('11');
  await modal(page).locator('input[name="monthly_fee"]').fill(String(INTENSIVE_MONTHLY));
  await modal(page).getByRole('button', { name: 'حفظ' }).click();
  await expectToast(page, 'success', 'تم إنشاء الفئة العمرية بنجاح.');
  await expectNoModal(page);
}

async function addStudent(page, name, age) {
  await navigate(page, 'شؤون الطلاب');
  await page.getByRole('button', { name: 'إضافة طالب' }).click();
  await modal(page).locator('#formStudentName').fill(name);
  await modal(page).locator('#formStudentDob').fill(yearsAgo(age));
  await modal(page).locator('#formStudentGender').selectOption('Male');
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

async function generateCharges(page) {
  await navigate(page, 'الشؤون المالية');
  await openTab(page, 'رسوم الطلاب');
  await activePane(page).getByRole('button', { name: 'توليد الرسوم' }).click();
  await modal(page).getByRole('button', { name: 'توليد الرسوم' }).click();
  await expectToast(page, 'success', 'تم إنشاء جميع الرسوم بنجاح');
  await expectNoModal(page);
}

function feeRow(page, name) {
  return activePane(page).locator('tbody tr', { hasText: name });
}

async function expectDue(page, name, due) {
  await expect(feeRow(page, name).locator('td').nth(1)).toHaveText(`${due.toFixed(2)} د.ت`);
}

test.describe('fees per age group', () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await setBranchFees(page);
    await setGroupFees(page, KIDS_GROUP, KIDS_FEES);
  });

  test("a group's own fees replace the branch fees; other groups keep the branch fees", async ({
    authedPage: page,
  }) => {
    // Columns: name | ages | gender | payment system | annual | monthly | description | actions
    await expect(groupRow(page, KIDS_GROUP).locator('td').nth(4)).toHaveText('25.00');
    await expect(groupRow(page, KIDS_GROUP).locator('td').nth(5)).toHaveText('15.00');
    await expect(groupRow(page, 'الرجال').locator('td').nth(4)).toHaveText('30.00 (افتراضي)');
    await expect(groupRow(page, 'الرجال').locator('td').nth(5)).toHaveText('20.00 (افتراضي)');

    const kid = 'كريم بن سالم العياري';
    const man = 'منير بن رضا الحامدي';
    await addStudent(page, kid, 9);
    await addStudent(page, man, 35);
    await addClass(page, 'حلقة البراعم', KIDS_GROUP);
    await addClass(page, 'حلقة الرجال', 'الرجال');
    await enroll(page, 'حلقة البراعم', [kid]);
    await enroll(page, 'حلقة الرجال', [man]);

    await generateCharges(page);

    await expectDue(page, kid, KIDS_FEES.annual + KIDS_FEES.monthly);
    await expectDue(page, man, BRANCH.annual + BRANCH.monthly);
  });

  test('a student in two groups with different fees pays the higher fee until a group is chosen', async ({
    authedPage: page,
  }) => {
    const both = 'ياسين بن عادل الزواري';
    const kid = 'سامي بن فتحي الغربي';
    await addIntensiveGroup(page);
    await addStudent(page, both, 9);
    await addStudent(page, kid, 9);
    await addClass(page, 'حلقة البراعم', KIDS_GROUP);
    await addClass(page, 'حلقة المكثف', INTENSIVE_GROUP);
    await enroll(page, 'حلقة البراعم', [both, kid]);
    await enroll(page, 'حلقة المكثف', [both]);

    await generateCharges(page);

    // The higher of each fee: the branch annual fee (30 > 25) and the intensive monthly fee.
    await expectDue(page, both, BRANCH.annual + INTENSIVE_MONTHLY);
    await expect(feeRow(page, both).locator('td').first()).toContainText('اختر فئة الرسوم');
    await expect(feeRow(page, kid).locator('td').first()).not.toContainText('اختر فئة الرسوم');
    await activePane(page).locator('select.filter-select').selectOption('FEE_GROUP');
    await expect(activePane(page).locator('tbody tr')).toHaveCount(1);
    await expect(activePane(page).locator('tbody tr')).toContainText(both);
    await activePane(page).locator('select.filter-select').selectOption('ALL');

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

    // The unpaid bills of the year are redone at the chosen group's fees.
    await expectDue(page, both, KIDS_FEES.annual + KIDS_FEES.monthly);
    await expect(feeRow(page, both).locator('td').first()).not.toContainText('اختر فئة الرسوم');
  });
});
