// What the desktop does with file dialogs, done the web way: exports and templates download,
// the logo and Excel files upload, a backup downloads and restores.

const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const PizZip = require('pizzip');
const {
  test,
  expect,
  navigate,
  modal,
  expectToast,
  expectNoModal,
  login,
  dismissOnboarding,
  SUPERADMIN,
} = require('./fixtures');

async function addStudent(page, name) {
  await page.getByRole('button', { name: 'إضافة طالب' }).click();
  await modal(page).locator('#formStudentName').fill(name);
  await modal(page).getByRole('button', { name: 'إضافة الطالب' }).click();
  await expectToast(page, 'success', `تمت إضافة الطالب "${name}" بنجاح!`);
  await expectNoModal(page);
}

async function readSheet(filePath, sheetName) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.getWorksheet(sheetName);
  const values = [];
  sheet.eachRow((row) => values.push(...row.values.filter((v) => v !== undefined).map(String)));
  return values;
}

test.describe('downloads', () => {
  test('student exports download as Excel and Word files', async ({
    authedPage: page,
  }, testInfo) => {
    await navigate(page, 'شؤون الطلاب');
    await addStudent(page, 'يوسف بن علي');

    await page.getByRole('button', { name: 'تصدير البيانات' }).click();
    const [xlsx] = await Promise.all([
      page.waitForEvent('download'),
      modal(page).getByRole('button', { name: 'تصدير إلى Excel' }).click(),
    ]);
    const xlsxPath = testInfo.outputPath(xlsx.suggestedFilename());
    await xlsx.saveAs(xlsxPath);
    expect(xlsx.suggestedFilename()).toMatch(/\.xlsx$/);
    expect(await readSheet(xlsxPath, 'الطلاب')).toContain('يوسف بن علي');

    const [docx] = await Promise.all([
      page.waitForEvent('download'),
      modal(page).getByRole('button', { name: 'تصدير إلى DOCX' }).click(),
    ]);
    const docxPath = testInfo.outputPath('students.docx');
    await docx.saveAs(docxPath);
    const documentXml = new PizZip(fs.readFileSync(docxPath)).file('word/document.xml').asText();
    expect(documentXml).toContain('يوسف بن علي');
  });

  test('the import template downloads, and an Excel file imports students', async ({
    authedPage: page,
  }, testInfo) => {
    await navigate(page, 'شؤون الطلاب');
    await page.getByRole('button', { name: 'استيراد البيانات' }).click();
    const [template] = await Promise.all([
      page.waitForEvent('download'),
      modal(page).getByRole('button', { name: 'إنشاء قالب Excel' }).click(),
    ]);
    expect(template.suggestedFilename()).toMatch(/\.xlsx$/);
    const templatePath = testInfo.outputPath('template.xlsx');
    await template.saveAs(templatePath);
    expect(await readSheet(templatePath, 'الطلاب')).toContain('الاسم واللقب');

    // The same workbook shape the desktop import test uses.
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('الطلاب');
    sheet.addRow(['⚠️ لا تعدل عناوين الأعمدة']);
    sheet.addRow(['الاسم واللقب', 'تاريخ الميلاد', 'الجنس', 'رقم الهاتف', 'الحالة']);
    sheet.addRow(['آمنة المستوردة', '2010-05-15', 'أنثى', '55223344', 'نشط']);
    sheet.addRow(['عمر المستورد', '2011-02-01', 'ذكر', '55223345', 'نشط']);
    const importPath = testInfo.outputPath('students.xlsx');
    await workbook.xlsx.writeFile(importPath);

    await modal(page).getByRole('button', { name: 'بدء معالج الاستيراد' }).click();
    const wizard = page.locator('.modal.show').last();
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      wizard.getByRole('button', { name: 'تصفح الملفات' }).click(),
    ]);
    await chooser.setFiles(importPath);
    const successCard = wizard.locator('.card', { hasText: 'سجل ناجح' });
    await expect(successCard.locator('.display-4')).toHaveText('2', { timeout: 20_000 });
    await wizard.getByRole('button', { name: 'إغلاق' }).click();
    await modal(page).getByRole('button', { name: 'إغلاق' }).click();
    await expectNoModal(page);
    await expect(page.locator('tbody tr', { hasText: 'آمنة المستوردة' })).toBeVisible();
    await expect(page.locator('tbody tr', { hasText: 'عمر المستورد' })).toBeVisible();
  });
});

test.describe('uploads and backups', () => {
  test('a new branch shows the bundled national logo in the sidebar', async ({
    authedPage: page,
    branch,
  }) => {
    const logo = page.locator('.sidebar .brand-logo');
    await expect(logo).toHaveAttribute('src', `/api/b/${branch.slug}/images/g247.png`);
    await expect.poll(() => logo.evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);
  });

  test('a branch logo uploads and is shown', async ({ authedPage: page }) => {
    await navigate(page, 'الإعدادات');
    await page.getByRole('tab', { name: 'الهوية البصرية' }).click();
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: 'تحميل...' }).nth(1).click(),
    ]);
    await chooser.setFiles(path.join(__dirname, '..', '..', '..', 'public', 'g247.png'));
    await expectToast(page, 'success', 'تم تحميل الشعار بنجاح.');
    const logo = page.locator('img[src*="/images/assets/logos/"]').first();
    await expect(logo).toBeVisible();
    expect(await logo.evaluate((img) => img.naturalWidth)).toBeGreaterThan(0);
  });

  test('a backup downloads, and restoring it brings the data back', async ({
    authedPage: page,
    branch,
  }, testInfo) => {
    await navigate(page, 'شؤون الطلاب');
    await addStudent(page, 'قبل النسخة');

    await navigate(page, 'الإعدادات');
    await page.getByRole('tab', { name: 'النسخ الاحتياطي' }).click();
    const [backup] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'تنزيل نسخة احتياطية الآن' }).click(),
    ]);
    expect(backup.suggestedFilename()).toMatch(new RegExp(`^backup-${branch.slug}-.*\\.qdb$`));
    const backupPath = testInfo.outputPath('branch.qdb');
    await backup.saveAs(backupPath);
    await expect(page.locator('[data-section="last-backup"]')).toContainText('ناجحة');

    await navigate(page, 'شؤون الطلاب');
    await addStudent(page, 'بعد النسخة');

    await navigate(page, 'الإعدادات');
    await page.getByRole('tab', { name: 'النسخ الاحتياطي' }).click();
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: 'استرجاع من نسخة احتياطية...' }).click(),
    ]);
    await chooser.setFiles(backupPath);
    await modal(page).locator('input[type="password"]').first().fill(SUPERADMIN.password);
    await modal(page).getByRole('button', { name: 'تأكيد' }).click();
    await expectToast(page, 'success', 'تم استيراد البيانات بنجاح');

    // Every session of the branch ended: sign in again.
    await page.reload();
    await login(page);
    await dismissOnboarding(page);
    await navigate(page, 'شؤون الطلاب');
    await expect(page.getByText('قبل النسخة')).toBeVisible();
    await expect(page.getByText('بعد النسخة')).toHaveCount(0);
  });
});
