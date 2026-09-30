const ExcelJS = require('exceljs');
const { test, expect, navigate, modal, expectToast, expectNoModal } = require('./fixtures');

async function stubSaveDialog(electronApp, filePath) {
  await electronApp.evaluate(({ dialog }, target) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
  }, filePath);
}

async function stubOpenDialog(electronApp, filePath) {
  await electronApp.evaluate(({ dialog }, target) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [target] });
  }, filePath);
}

/**
 * Reads a generated template: row 1 is the warning, row 2 the headers, then the example rows.
 * @returns {Promise<{ sheetName: string, headers: string[], names: string[] }>}
 */
async function readTemplate(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  expect(workbook.worksheets).toHaveLength(1);
  const sheet = workbook.worksheets[0];
  const headers = sheet.getRow(2).values.filter(Boolean).map(String);
  const nameColumn = sheet.getRow(2).values.indexOf('الاسم واللقب');
  const names = [];
  sheet.eachRow((row, number) => {
    if (number > 2 && row.getCell(nameColumn).value)
      names.push(String(row.getCell(nameColumn).value));
  });
  return { sheetName: sheet.name, headers, names };
}

const CASES = [
  {
    what: 'students',
    page: 'شؤون الطلاب',
    modalTitle: 'استيراد بيانات الطلاب',
    sheetName: 'الطلاب',
    refreshToast: 'تم تحديث قائمة الطلاب بعد الاستيراد.',
  },
  {
    what: 'teachers',
    page: 'شؤون المعلمين',
    modalTitle: 'استيراد بيانات المعلمين',
    sheetName: 'المعلمون',
    refreshToast: 'تم تحديث قائمة المعلمين بعد الاستيراد.',
  },
];

test.describe('import templates', () => {
  for (const c of CASES) {
    test(`the ${c.what} template imports as it is and adds its example rows`, async ({
      authedPage: page,
      electronApp,
    }, testInfo) => {
      await navigate(page, c.page);
      await page.getByRole('button', { name: 'استيراد البيانات' }).click();
      const importModal = modal(page);
      await expect(importModal.locator('.modal-title')).toContainText(c.modalTitle);

      const templatePath = testInfo.outputPath(`${c.what}-template.xlsx`);
      await stubSaveDialog(electronApp, templatePath);
      await importModal.getByRole('button', { name: 'إنشاء قالب Excel' }).click();
      await expect(importModal.locator('.alert-success')).toHaveText('تم إنشاء القالب بنجاح!');

      const template = await readTemplate(templatePath);
      expect(template.sheetName).toBe(c.sheetName);
      expect(template.headers).toContain('الاسم واللقب');
      expect(template.names.length).toBeGreaterThan(0);

      await stubOpenDialog(electronApp, templatePath);
      await importModal.getByRole('button', { name: 'بدء معالج الاستيراد' }).click();
      // The ImportModal stays open behind the wizard, so target the topmost modal.
      const wizard = page.locator('.modal.show').last();
      await expect(wizard.locator('.modal-title')).toContainText('استيراد البيانات من Excel');
      await wizard.getByRole('button', { name: 'تصفح الملفات' }).click();

      const successCard = wizard.locator('.card', { hasText: 'سجل ناجح' });
      await expect(successCard.locator('.display-4')).toHaveText(String(template.names.length));
      await wizard.getByRole('button', { name: 'إغلاق' }).click();
      await modal(page).getByRole('button', { name: 'إغلاق' }).click();
      await expectNoModal(page);
      await expectToast(page, 'info', c.refreshToast);

      for (const name of template.names) {
        await expect(page.locator('tbody tr', { hasText: name })).toBeVisible();
      }
    });
  }
});
