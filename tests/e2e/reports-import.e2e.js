const fs = require('fs');
const ExcelJS = require('exceljs');
const PizZip = require('pizzip');
const { test, expect, navigate, modal, expectToast, expectNoModal } = require('./fixtures');

const INCOME_VOUCHER = 'E2E-RPT-001';
const INCOME_AMOUNT = 150;
const IMPORTED_STUDENTS = ['ليلى بنت يوسف', 'عمر بن سعيد'];

/**
 * Replaces the native save dialog in the main process so exports write to
 * `filePath` without any OS dialog.
 */
async function stubSaveDialog(electronApp, filePath) {
  await electronApp.evaluate(({ dialog }, target) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
  }, filePath);
}

/**
 * Replaces the native open dialog in the main process so the import wizard
 * receives `filePath` when it calls dialog.showOpenDialog.
 */
async function stubOpenDialog(electronApp, filePath) {
  await electronApp.evaluate(({ dialog }, target) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [target] });
  }, filePath);
}

function midMonthDate() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${now.getFullYear()}-${month}-15`;
}

function activePane(page) {
  return page.locator('.tab-pane.active');
}

// The active tab's animated indicator never settles, so only click unselected tabs.
async function openTab(page, title) {
  const tab = page.getByRole('tab', { name: title, exact: true });
  if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}

async function fillTransaction(page, { voucher, amount, receiptType, category, paymentMethod }) {
  const form = modal(page);
  await form.locator('input[name="transaction_date"]').fill(midMonthDate());
  if (category) await form.locator('select[name="category"]').selectOption(category);
  await form.locator('input[name="voucher_number"]').fill(voucher);
  if (receiptType) await form.locator('select[name="receipt_type"]').selectOption(receiptType);
  await form.locator('input[name="amount"]').fill(String(amount));
  if (paymentMethod)
    await form.locator('select[name="payment_method"]').selectOption(paymentMethod);
}

async function addIncome(page, { voucher, amount }) {
  await openTab(page, 'المداخيل');
  await activePane(page).getByRole('button', { name: 'إضافة مدخول' }).click();
  await expect(modal(page).locator('.modal-title')).toHaveText('إضافة مدخول');
  await fillTransaction(page, { voucher, amount, receiptType: 'تبرع' });
  await modal(page).getByRole('button', { name: 'حفظ' }).click();
  await expectToast(page, 'success', 'تم إضافة المدخول بنجاح');
  await closeVoucherModal(page, 'وصل استلام');
}

// A print-preview modal opens after every new transaction. Close it; never click طباعة.
async function closeVoucherModal(page, title) {
  await expect(modal(page).locator('.modal-title')).toHaveText(title);
  await modal(page).getByRole('button', { name: 'إغلاق', exact: true }).click();
  await expect(modal(page)).toHaveCount(0);
}

async function docxText(filePath) {
  return new PizZip(fs.readFileSync(filePath)).file('word/document.xml').asText();
}

async function buildStudentImportXlsx(filePath, names) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('الطلاب');
  worksheet.views = [{ rightToLeft: true }];
  // Row 1 can be a warning/header spacer; the importer reads headers from row 2.
  worksheet.addRow(['⚠️ لا تعدل عناوين الأعمدة']);
  worksheet.addRow(['الاسم واللقب', 'تاريخ الميلاد', 'الجنس', 'رقم الهاتف', 'الحالة']);
  names.forEach((name) => {
    worksheet.addRow([name, '2010-05-15', 'ذكر', '55223344', 'نشط']);
  });
  await workbook.xlsx.writeFile(filePath);
}

function ledgerSheetText(filePath) {
  const workbook = new ExcelJS.Workbook();
  return workbook.xlsx.readFile(filePath).then(() => {
    const sheet = workbook.worksheets[0];
    const values = [];
    sheet.eachRow((row) => values.push(...row.values.filter((v) => v !== undefined).map(String)));
    return values;
  });
}

test.describe('financial reports exports', () => {
  test.beforeEach(async ({ authedPage }) => {
    await navigate(authedPage, 'الشؤون المالية');
    await expect(authedPage.getByRole('tab', { name: 'لوحة التحكم' })).toBeVisible();
  });

  test('Word financial report export for the current month contains the income amount', async ({
    authedPage: page,
    electronApp,
  }, testInfo) => {
    await addIncome(page, { voucher: INCOME_VOUCHER, amount: INCOME_AMOUNT });

    await openTab(page, 'التقارير المالية');
    const filePath = testInfo.outputPath('financial-report.docx');
    await stubSaveDialog(electronApp, filePath);

    await activePane(page).getByRole('button', { name: 'تصدير التقرير المالي (Word)' }).click();

    await expect(activePane(page).locator('.alert-success')).toContainText(
      'تم تصدير التقرير المالي بنجاح!',
    );
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.statSync(filePath).size).toBeGreaterThan(0);

    const text = await docxText(filePath);
    expect(text).toContain(`${INCOME_AMOUNT.toFixed(3)} دينار`);
  });

  test('cash ledger export writes an Excel file with the income row', async ({
    authedPage: page,
    electronApp,
  }, testInfo) => {
    await addIncome(page, { voucher: INCOME_VOUCHER, amount: INCOME_AMOUNT });

    await openTab(page, 'التقارير المالية');
    const filePath = testInfo.outputPath('cash-ledger.xlsx');
    await stubSaveDialog(electronApp, filePath);

    await activePane(page).getByRole('button', { name: 'تصدير سجل المحاسبة (Excel)' }).click();

    await expect(activePane(page).locator('.alert-success')).toContainText(
      'تم تصدير سجل المحاسبة بنجاح!',
    );
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.statSync(filePath).size).toBeGreaterThan(0);

    const text = await ledgerSheetText(filePath);
    expect(text).toContain(String(INCOME_AMOUNT));
    expect(text).toContain('مداخيل');
  });
});

test.describe('student import', () => {
  test('importing students from an Excel file adds them to the students page', async ({
    authedPage: page,
    electronApp,
  }, testInfo) => {
    const importPath = testInfo.outputPath('students-import.xlsx');
    await buildStudentImportXlsx(importPath, IMPORTED_STUDENTS);

    await navigate(page, 'شؤون الطلاب');
    await expect(page.locator('h1')).toHaveText('شؤون الطلاب');

    await stubOpenDialog(electronApp, importPath);

    await page.getByRole('button', { name: 'استيراد البيانات' }).click();
    const importModal = modal(page);
    await expect(importModal.locator('.modal-title')).toContainText('استيراد بيانات الطلاب');
    await importModal.getByRole('button', { name: 'بدء معالج الاستيراد' }).click();

    // The ImportModal stays open behind the wizard, so target the topmost modal.
    const wizard = page.locator('.modal.show').last();
    await expect(wizard.locator('.modal-title')).toContainText('استيراد البيانات من Excel');
    await wizard.getByRole('button', { name: 'تصفح الملفات' }).click();

    // The wizard auto-imports after selection and shows the result cards.
    const successCard = wizard.locator('.card', { hasText: 'سجل ناجح' });
    await expect(successCard.locator('.display-4')).toHaveText(String(IMPORTED_STUDENTS.length));
    await expect(wizard.locator('.text-success', { hasText: 'تم الاستيراد بنجاح' })).toBeVisible();

    await wizard.getByRole('button', { name: 'إغلاق' }).click();
    // Close the original ImportModal that remains open underneath.
    await modal(page).getByRole('button', { name: 'إغلاق' }).click();
    await expectNoModal(page);

    // The page refreshes automatically after a student import.
    await expectToast(page, 'info', 'تم تحديث قائمة الطلاب بعد الاستيراد.');

    for (const name of IMPORTED_STUDENTS) {
      await expect(page.locator('tbody tr', { hasText: name })).toBeVisible();
    }
  });
});
