const { test, expect, navigate, modal, expectNoModal, expectToast } = require('./fixtures');

const ANNUAL_FEE = 40;
const MONTHLY_FEE = 20;

function yearsAgo(years) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  d.setDate(d.getDate() - 30);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

function money(amount) {
  return `${amount.toFixed(2)} د.ت`;
}

async function setFees(page, { annual, monthly }) {
  await navigate(page, 'الإعدادات');
  await page.getByRole('tab', { name: 'إعدادات الرسوم' }).click();
  await page.locator('input[name="annual_fee"]').fill(String(annual));
  await page.locator('input[name="standard_monthly_fee"]').fill(String(monthly));
  await page.getByRole('button', { name: 'حفظ جميع التغييرات' }).click();
  await expectToast(page, 'success', /تم تحديث الإعدادات بنجاح/);
}

/**
 * Adds a 9-year-old student.
 * @param {{ feeCategory?: 'CAN_PAY'|'EXEMPT'|'SPONSORED', discount?: number, sponsor?: string }} [options]
 */
async function addStudent(page, name, { feeCategory, discount, sponsor } = {}) {
  await navigate(page, 'شؤون الطلاب');
  await page.getByRole('button', { name: 'إضافة طالب' }).click();
  const form = modal(page);
  await form.locator('#formStudentName').fill(name);
  await form.locator('#formStudentDob').fill(yearsAgo(9));
  if (feeCategory) await form.locator('select[name="fee_category"]').selectOption(feeCategory);
  if (sponsor) await form.locator('input[name="sponsor_name"]').fill(sponsor);
  if (discount) {
    await form.locator('input[name="discount_percentage"]').fill(String(discount));
    await form.locator('textarea[name="discount_reason"]').fill('خصم عائلي');
  }
  await form.getByRole('button', { name: 'إضافة الطالب' }).click();
  await expectToast(page, 'success', `تمت إضافة الطالب "${name}" بنجاح!`);
  await expectNoModal(page);
}

async function openFeesTab(page) {
  await navigate(page, 'الشؤون المالية');
  await page.getByRole('tab', { name: 'رسوم الطلاب' }).click();
}

async function generateCharges(page, { force = false } = {}) {
  await openFeesTab(page);
  await page.locator('.tab-pane.active').getByRole('button', { name: 'توليد الرسوم' }).click();
  if (force) {
    // The checkbox has no id, so its label is not linked to it.
    await modal(page)
      .locator('.form-check', { hasText: 'إعادة التوليد حتى لو كانت الرسوم موجودة مسبقاً' })
      .locator('input[type="checkbox"]')
      .check();
  }
  await modal(page).getByRole('button', { name: 'توليد الرسوم' }).click();
  await expectToast(page, 'success', 'تم إنشاء جميع الرسوم بنجاح');
  await expectNoModal(page);
}

function feeRow(page, name) {
  return page.locator('.tab-pane.active tbody tr', { hasText: name });
}

/** Columns: name | total due | total paid | remaining | status | actions */
async function expectFeeRow(page, name, { due, paid, remaining, status }) {
  const cells = feeRow(page, name).locator('td');
  await expect(cells.nth(1)).toHaveText(money(due));
  await expect(cells.nth(2)).toHaveText(money(paid));
  await expect(cells.nth(3)).toHaveText(money(remaining));
  await expect(cells.nth(4)).toHaveText(status);
}

async function pay(page, name, amount, receipt) {
  await feeRow(page, name).locator('button.btn-success').click();
  await modal(page).locator('input[type="number"]').first().fill(String(amount));
  await modal(page).getByPlaceholder('أدخل رقم الوصل').fill(receipt);
  await modal(page).getByRole('button', { name: 'تسجيل الدفعة' }).click();
  await expectToast(page, 'success', 'تم تسجيل الدفعة بنجاح');
  await expectNoModal(page);
}

test.describe('student fee categories', () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await setFees(page, { annual: ANNUAL_FEE, monthly: MONTHLY_FEE });
  });

  test('exempt students owe nothing and cannot be charged; sponsored students are billed', async ({
    authedPage: page,
  }) => {
    const paying = 'هالة بنت منصف الورتاني';
    const exempt = 'يوسف بن عادل الشابي';
    const sponsored = 'آمنة بنت كمال الزواري';
    await addStudent(page, paying);
    await addStudent(page, exempt, { feeCategory: 'EXEMPT' });
    await addStudent(page, sponsored, { feeCategory: 'SPONSORED', sponsor: 'جمعية البر' });

    await generateCharges(page);

    const full = ANNUAL_FEE + MONTHLY_FEE;
    await expectFeeRow(page, paying, { due: full, paid: 0, remaining: full, status: 'غير مدفوع' });
    await expectFeeRow(page, sponsored, {
      due: full,
      paid: 0,
      remaining: full,
      status: 'غير مدفوع',
    });
    await expectFeeRow(page, exempt, { due: 0, paid: 0, remaining: 0, status: 'معفى' });
    await expect(feeRow(page, exempt).locator('button.btn-success')).toBeDisabled();
  });

  test('a discount lowers the monthly fee only, not the annual fee', async ({
    authedPage: page,
  }) => {
    const discounted = 'سيرين بنت نبيل القروي';
    const regular = 'إلياس بن حاتم البجاوي';
    await addStudent(page, discounted, { discount: 50 });
    await addStudent(page, regular);

    await generateCharges(page);

    const discountedDue = ANNUAL_FEE + MONTHLY_FEE / 2;
    await expectFeeRow(page, discounted, {
      due: discountedDue,
      paid: 0,
      remaining: discountedDue,
      status: 'غير مدفوع',
    });
    const full = ANNUAL_FEE + MONTHLY_FEE;
    await expectFeeRow(page, regular, { due: full, paid: 0, remaining: full, status: 'غير مدفوع' });
  });

  test('resetting fees rebills unpaid charges at the current fee and keeps paid ones', async ({
    authedPage: page,
  }) => {
    const paid = 'رحاب بنت فتحي المرزوقي';
    const unpaid = 'أنس بن رضا الجلاصي';
    await addStudent(page, paid);
    await addStudent(page, unpaid);
    await generateCharges(page);
    const oldFull = ANNUAL_FEE + MONTHLY_FEE;
    await pay(page, paid, oldFull, 'RESET-001');

    const newMonthly = 30;
    await setFees(page, { annual: ANNUAL_FEE, monthly: newMonthly });
    await openFeesTab(page);
    // Changing the fee setting alone leaves this year's bills as they are.
    await expectFeeRow(page, unpaid, {
      due: oldFull,
      paid: 0,
      remaining: oldFull,
      status: 'غير مدفوع',
    });

    await page
      .locator('.tab-pane.active')
      .getByRole('button', { name: 'إعادة ضبط الرسوم' })
      .click();
    await expect(modal(page).locator('.modal-title')).toHaveText('تأكيد إعادة ضبط الرسوم');
    await modal(page).getByRole('button', { name: 'تأكيد إعادة الضبط' }).click();
    await expectToast(page, 'success', /تم إعادة ضبط الرسوم بنجاح \(تم حذف 2 رسم/);
    await expectNoModal(page);

    const newFull = ANNUAL_FEE + newMonthly;
    await expectFeeRow(page, unpaid, {
      due: newFull,
      paid: 0,
      remaining: newFull,
      status: 'غير مدفوع',
    });
    await expectFeeRow(page, paid, { due: oldFull, paid: oldFull, remaining: 0, status: 'مدفوع' });
  });

  test("forced regeneration rebills this month's unpaid charge at the current fee", async ({
    authedPage: page,
  }) => {
    const student = 'منى بنت الحبيب الرياحي';
    await addStudent(page, student);
    await generateCharges(page);
    const oldFull = ANNUAL_FEE + MONTHLY_FEE;
    await expectFeeRow(page, student, {
      due: oldFull,
      paid: 0,
      remaining: oldFull,
      status: 'غير مدفوع',
    });

    const newMonthly = 35;
    await setFees(page, { annual: ANNUAL_FEE, monthly: newMonthly });
    // Without the option, an existing month is left as it is.
    await generateCharges(page);
    await expectFeeRow(page, student, {
      due: oldFull,
      paid: 0,
      remaining: oldFull,
      status: 'غير مدفوع',
    });

    await generateCharges(page, { force: true });
    const newFull = ANNUAL_FEE + newMonthly;
    await expectFeeRow(page, student, {
      due: newFull,
      paid: 0,
      remaining: newFull,
      status: 'غير مدفوع',
    });
  });
});
