const { test, expect, navigate, modal, expectNoModal, expectToast } = require('./fixtures');

const ANNUAL_FEE = 120;
const STUDENT = 'مريم بنت سالم';

function yearsAgo(years) {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().split('T')[0];
}

/** Annual fee only: the monthly fee stays empty, so no monthly charges are generated. */
async function configureAnnualFee(page) {
  await navigate(page, 'الإعدادات');
  await page.getByRole('tab', { name: 'إعدادات الرسوم' }).click();
  await page.locator('input[name="annual_fee"]').fill(String(ANNUAL_FEE));
  await page.getByRole('button', { name: 'حفظ جميع التغييرات' }).click();
  await expectToast(page, 'success', 'تم تحديث الإعدادات بنجاح.');
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

async function openFeesTab(page) {
  await navigate(page, 'الشؤون المالية');
  await page.getByRole('tab', { name: 'رسوم الطلاب' }).click();
}

async function generateCharges(page) {
  await page.getByRole('button', { name: 'توليد الرسوم' }).first().click();
  await expect(modal(page).locator('.modal-title')).toHaveText('توليد رسوم الطلاب');
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
  await expect(cells.nth(1)).toHaveText(`${due.toFixed(2)} د.ت`);
  await expect(cells.nth(2)).toHaveText(`${paid.toFixed(2)} د.ت`);
  await expect(cells.nth(3)).toHaveText(`${remaining.toFixed(2)} د.ت`);
  await expect(cells.nth(4)).toHaveText(status);
}

async function openPaymentModal(page, name) {
  await feeRow(page, name).locator('button.btn-success').click();
  await expect(modal(page).locator('.modal-title')).toHaveText('تسجيل دفعة جديدة');
}

async function recordPayment(page, name, { amount, receipt }) {
  await openPaymentModal(page, name);
  await modal(page).locator('input[type="number"]').first().fill(String(amount));
  await modal(page).getByPlaceholder('أدخل رقم الوصل').fill(receipt);
  await modal(page).getByRole('button', { name: 'تسجيل الدفعة' }).click();
  await expectToast(page, 'success', 'تم تسجيل الدفعة بنجاح');
  await expectNoModal(page);
}

/**
 * Delete/refund confirmations open on top of the payment modal. Confirm, then close
 * the payment modal underneath.
 */
async function confirmPaymentAction(page, title, confirmText) {
  const dialog = page.locator('.modal.show', {
    has: page.locator('.modal-title', { hasText: title }),
  });
  await dialog.getByRole('button', { name: confirmText }).click();
  await expect(dialog).toHaveCount(0);
  await modal(page).getByRole('button', { name: 'إلغاء', exact: true }).click();
  await expectNoModal(page);
}

test.describe('student fees', () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await configureAnnualFee(page);
    await addStudent(page, STUDENT);
    await openFeesTab(page);
    await generateCharges(page);
  });

  test('generating charges bills the annual fee as unpaid', async ({ authedPage: page }) => {
    await expectFeeRow(page, STUDENT, {
      due: ANNUAL_FEE,
      paid: 0,
      remaining: ANNUAL_FEE,
      status: 'غير مدفوع',
    });
  });

  test('a partial then a full payment settle the balance', async ({ authedPage: page }) => {
    await recordPayment(page, STUDENT, { amount: 50, receipt: 'FEE-001' });
    await expectFeeRow(page, STUDENT, {
      due: ANNUAL_FEE,
      paid: 50,
      remaining: 70,
      status: 'جزئياً مدفوع',
    });

    await recordPayment(page, STUDENT, { amount: 70, receipt: 'FEE-002' });
    await expectFeeRow(page, STUDENT, {
      due: ANNUAL_FEE,
      paid: ANNUAL_FEE,
      remaining: 0,
      status: 'مدفوع',
    });
  });

  test('voiding a payment restores the balance and keeps it in the history', async ({
    authedPage: page,
  }) => {
    await recordPayment(page, STUDENT, { amount: 50, receipt: 'FEE-DEL' });

    await openPaymentModal(page, STUDENT);
    const payment = modal(page).locator('tbody tr', { hasText: 'FEE-DEL' });
    await payment.getByRole('button', { name: 'إلغاء الدفعة' }).click();
    await confirmPaymentAction(page, 'تأكيد إلغاء الدفعة', 'نعم، إلغاء');
    await expectToast(page, 'success', 'تم إلغاء الدفعة بنجاح');

    await expectFeeRow(page, STUDENT, {
      due: ANNUAL_FEE,
      paid: 0,
      remaining: ANNUAL_FEE,
      status: 'غير مدفوع',
    });

    await openPaymentModal(page, STUDENT);
    const voided = modal(page).locator('tbody tr', { hasText: 'FEE-DEL' });
    await expect(voided).toContainText('ملغاة');
    await expect(voided.getByRole('button', { name: 'إلغاء الدفعة' })).toBeDisabled();
    await expect(voided.getByRole('button', { name: 'استرجاع الدفعة' })).toBeDisabled();
    await modal(page).getByRole('button', { name: 'إلغاء', exact: true }).click();
    await expectNoModal(page);

    // The voided receipt number is free again for the corrected payment
    await recordPayment(page, STUDENT, { amount: 50, receipt: 'FEE-DEL' });
    await expectFeeRow(page, STUDENT, {
      due: ANNUAL_FEE,
      paid: 50,
      remaining: ANNUAL_FEE - 50,
      status: 'جزئياً مدفوع',
    });
  });

  test('a refunded payment no longer counts and cannot be refunded twice', async ({
    authedPage: page,
  }) => {
    await recordPayment(page, STUDENT, { amount: 50, receipt: 'FEE-REF' });

    await openPaymentModal(page, STUDENT);
    const payment = modal(page).locator('tbody tr', { hasText: 'FEE-REF' });
    await payment.getByRole('button', { name: 'استرجاع الدفعة' }).click();
    await confirmPaymentAction(page, 'تأكيد استرجاع الدفعة', 'نعم، استرجاع');
    await expectToast(page, 'success', 'تم استرجاع الدفعة بنجاح');

    await expectFeeRow(page, STUDENT, {
      due: ANNUAL_FEE,
      paid: 0,
      remaining: ANNUAL_FEE,
      status: 'غير مدفوع',
    });

    await openPaymentModal(page, STUDENT);
    const refunded = modal(page).locator('tbody tr', { hasText: 'FEE-REF' });
    await expect(refunded.getByRole('button', { name: 'استرجاع الدفعة' })).toBeDisabled();
    await expect(refunded.getByRole('button', { name: 'إلغاء الدفعة' })).toBeDisabled();
  });

  test('a fee payment voided from the income list reverses the charge; its amount stays locked', async ({
    authedPage: page,
  }) => {
    await recordPayment(page, STUDENT, { amount: 50, receipt: 'FEE-INCOME' });

    await page.getByRole('tab', { name: 'المداخيل' }).click();
    const row = page.locator('.tab-pane.active tbody tr', { hasText: 'FEE-INCOME' });

    // Changing its amount here would leave the student's charges out of step: refused
    await row.getByRole('button', { name: 'تعديل العملية' }).click();
    await modal(page).locator('input[name="amount"]').fill('80');
    await modal(page).getByRole('button', { name: 'حفظ' }).click();
    await expectToast(page, 'error', 'مرتبطة برسوم الطلاب');
    await modal(page).getByRole('button', { name: 'إلغاء', exact: true }).click();
    await expectNoModal(page);

    // Voiding it here reverses the payment the way the fees tab does
    await row.getByRole('button', { name: 'إلغاء العملية' }).click();
    await modal(page).getByRole('button', { name: 'نعم، إلغاء' }).click();
    await expectNoModal(page);
    await expectToast(page, 'success', 'تم إلغاء المدخول بنجاح');
    await expect(row).toHaveCount(0);

    await page.getByRole('tab', { name: 'رسوم الطلاب' }).click();
    await expectFeeRow(page, STUDENT, {
      due: ANNUAL_FEE,
      paid: 0,
      remaining: ANNUAL_FEE,
      status: 'غير مدفوع',
    });
    await openPaymentModal(page, STUDENT);
    await expect(modal(page).locator('tbody tr', { hasText: 'FEE-INCOME' })).toContainText('ملغاة');
  });

  test('a student fee payment counts as income on the financial dashboard', async ({
    authedPage: page,
  }) => {
    await recordPayment(page, STUDENT, { amount: 50, receipt: 'FEE-INC' });

    await page.getByRole('tab', { name: 'لوحة التحكم' }).click();
    const income = page
      .locator('.tab-pane.active .card-body', { hasText: 'إجمالي المداخيل' })
      .locator('h3');
    const expected = await page.evaluate(() =>
      new Intl.NumberFormat('ar-TN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
        50,
      ),
    );
    await expect(income).toContainText(expected);
  });
});
