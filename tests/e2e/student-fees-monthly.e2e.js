const { test, expect, navigate, modal, expectNoModal, expectToast } = require('./fixtures');

const MONTHLY_FEE = 15;
const SPECIAL_FEE = 25;

const IN_STANDARD_CLASS = 'سلمى بنت رياض الخميري';
const NOT_ENROLLED = 'زكرياء بن فوزي العكرمي';
const IN_SPECIAL_CLASS = 'أروى بنت منير الدهماني';

function yearsAgo(years) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setDate(d.getDate() - 30);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

async function setMonthlyFee(page, amount) {
  await navigate(page, 'الإعدادات');
  await page.getByRole('tab', { name: 'إعدادات الرسوم' }).click();
  await page.locator('input[name="standard_monthly_fee"]').fill(String(amount));
  await page.getByRole('button', { name: 'حفظ جميع التغييرات' }).click();
  await expectToast(page, 'success', /تم تحديث الإعدادات بنجاح/);
}

async function addStudent(page, name) {
  await navigate(page, 'شؤون الطلاب');
  await page.getByRole('button', { name: 'إضافة طالب' }).click();
  await modal(page).locator('#formStudentName').fill(name);
  await modal(page).locator('#formStudentDob').fill(yearsAgo(9));
  await modal(page).getByRole('button', { name: 'إضافة الطالب' }).click();
  await expectToast(page, 'success', `تمت إضافة الطالب "${name}" بنجاح!`);
  await expectNoModal(page);
}

/** An active children's class; `specialFee` makes it a class with its own monthly fee. */
async function addClass(page, name, specialFee) {
  await navigate(page, 'الفصول الدراسية');
  await page.getByRole('button', { name: 'إضافة فصل' }).click();
  const form = modal(page);
  await form.locator('input[name="name"]').fill(name);
  const option = form.locator('select[name="age_group_id"] option', { hasText: 'الأطفال' });
  await form
    .locator('select[name="age_group_id"]')
    .selectOption(await option.getAttribute('value'));
  await form.locator('select[name="status"]').selectOption('active');
  if (specialFee) {
    await form.locator('#customMonthlyFee').check();
    await form.locator('input[name="monthly_fee"]').fill(String(specialFee));
  }
  await form.getByRole('button', { name: 'إضافة الفصل' }).click();
  await expectToast(page, 'success', `تمت إضافة الفصل "${name}" بنجاح!`);
  await expectNoModal(page);
}

async function enroll(page, className, studentName) {
  await navigate(page, 'الفصول الدراسية');
  await page
    .locator('tbody tr', { hasText: className })
    .locator('button.btn-outline-primary')
    .first()
    .click();
  await modal(page)
    .locator('.enrollment-list')
    .nth(1)
    .locator('.list-group-item', { hasText: studentName })
    .locator('button.text-success')
    .click();
  await modal(page).getByRole('button', { name: 'حفظ التغييرات' }).click();
  await expectToast(page, 'success', 'تم تحديث قائمة الطلاب بنجاح!');
  await expectNoModal(page);
}

async function generateCharges(page) {
  await navigate(page, 'الشؤون المالية');
  await page.getByRole('tab', { name: 'رسوم الطلاب' }).click();
  await page.locator('.tab-pane.active').getByRole('button', { name: 'توليد الرسوم' }).click();
  await modal(page).getByRole('button', { name: 'توليد الرسوم' }).click();
  await expectToast(page, 'success', 'تم إنشاء جميع الرسوم بنجاح');
  await expectNoModal(page);
}

/** Fees table columns: name | total due | total paid | remaining | status | actions */
function dueCell(page, name) {
  return page.locator('.tab-pane.active tbody tr', { hasText: name }).locator('td').nth(1);
}

test.describe('monthly student fees', () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await setMonthlyFee(page, MONTHLY_FEE);
    for (const name of [IN_STANDARD_CLASS, NOT_ENROLLED, IN_SPECIAL_CLASS]) {
      await addStudent(page, name);
    }
    await addClass(page, 'حلقة الحفظ العادية');
    await addClass(page, 'حلقة التجويد الخاصة', SPECIAL_FEE);
    await enroll(page, 'حلقة الحفظ العادية', IN_STANDARD_CLASS);
    await enroll(page, 'حلقة التجويد الخاصة', IN_SPECIAL_CLASS);
  });

  test('bills the standard fee, or the special class fee, for the current month', async ({
    authedPage: page,
  }) => {
    await generateCharges(page);

    await expect(dueCell(page, IN_STANDARD_CLASS)).toHaveText(`${MONTHLY_FEE.toFixed(2)} د.ت`);
    // Active paying students not enrolled in any class still pay the standard monthly fee.
    await expect(dueCell(page, NOT_ENROLLED)).toHaveText(`${MONTHLY_FEE.toFixed(2)} د.ت`);
    // A class with its own monthly fee replaces the standard fee.
    await expect(dueCell(page, IN_SPECIAL_CLASS)).toHaveText(`${SPECIAL_FEE.toFixed(2)} د.ت`);
  });

  test('generating again does not bill the same month twice', async ({ authedPage: page }) => {
    await generateCharges(page);
    await generateCharges(page);

    await expect(dueCell(page, IN_STANDARD_CLASS)).toHaveText(`${MONTHLY_FEE.toFixed(2)} د.ت`);
    await expect(dueCell(page, IN_SPECIAL_CLASS)).toHaveText(`${SPECIAL_FEE.toFixed(2)} د.ت`);
  });

  test('paying the monthly fee settles it', async ({ authedPage: page }) => {
    await generateCharges(page);
    const row = page.locator('.tab-pane.active tbody tr', { hasText: IN_STANDARD_CLASS });
    await row.locator('button.btn-success').click();
    await modal(page).locator('input[type="number"]').first().fill(String(MONTHLY_FEE));
    await modal(page).getByPlaceholder('أدخل رقم الوصل').fill('MONTH-001');
    await modal(page).getByRole('button', { name: 'تسجيل الدفعة' }).click();
    await expectToast(page, 'success', 'تم تسجيل الدفعة بنجاح');
    await expectNoModal(page);

    await expect(row.locator('td').nth(3)).toHaveText('0.00 د.ت');
    await expect(row.locator('td').nth(4)).toHaveText('مدفوع');
  });

  test('classes whose age group pays annually get no monthly charge', async ({
    authedPage: page,
  }) => {
    const student = 'منصور بن طه القلعي';
    await navigate(page, 'الإعدادات');
    await page.getByRole('tab', { name: 'فئات عمرية' }).click();
    const pane = page.locator('.tab-pane.active');
    await pane.getByRole('button', { name: 'إضافة فئة جديدة' }).click();
    await modal(page).locator('input[name="name"]').fill('حفظة سنوي');
    await modal(page).locator('select[name="gender"]').selectOption('any');
    await modal(page).locator('input[name="min_age"]').fill('6');
    await modal(page).locator('input[name="max_age"]').fill('11');
    await modal(page).locator('select[name="payment_frequency"]').selectOption('ANNUAL');
    await modal(page).getByRole('button', { name: 'حفظ' }).click();
    await expectToast(page, 'success', 'تم إنشاء الفئة العمرية بنجاح.');
    await expectNoModal(page);

    await addStudent(page, student);
    await navigate(page, 'الفصول الدراسية');
    await page.getByRole('button', { name: 'إضافة فصل' }).click();
    const form = modal(page);
    await form.locator('input[name="name"]').fill('حلقة الدفع السنوي');
    const option = form.locator('select[name="age_group_id"] option', { hasText: 'حفظة سنوي' });
    await form
      .locator('select[name="age_group_id"]')
      .selectOption(await option.getAttribute('value'));
    await form.locator('select[name="status"]').selectOption('active');
    await form.getByRole('button', { name: 'إضافة الفصل' }).click();
    await expectToast(page, 'success', 'تمت إضافة الفصل "حلقة الدفع السنوي" بنجاح!');
    await expectNoModal(page);
    await enroll(page, 'حلقة الدفع السنوي', student);

    await generateCharges(page);

    // No annual fee is configured in this test, so nothing is owed.
    await expect(dueCell(page, student)).toHaveText('0.00 د.ت');
    // The students on monthly billing are still charged.
    await expect(dueCell(page, IN_STANDARD_CLASS)).toHaveText(`${MONTHLY_FEE.toFixed(2)} د.ت`);
  });
});
