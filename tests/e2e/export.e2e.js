const fs = require('fs');
const ExcelJS = require('exceljs');
const PizZip = require('pizzip');
const { test, expect, navigate, modal, expectToast } = require('./fixtures');

const STUDENT_NAME = 'يوسف بن علي';

/**
 * Replaces the native save dialog in the main process so exports write to `filePath`
 * without any OS dialog. The export handler looks up dialog.showSaveDialog per call.
 */
async function stubSaveDialog(electronApp, filePath) {
  await electronApp.evaluate(({ dialog }, target) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
  }, filePath);
}

async function addStudent(page, name) {
  await page.getByRole('button', { name: 'إضافة طالب' }).click();
  await modal(page).locator('#formStudentName').fill(name);
  await modal(page).getByRole('button', { name: 'إضافة الطالب' }).click();
  await expectToast(page, 'success', `تمت إضافة الطالب "${name}" بنجاح!`);
}

async function exportStudents(page, buttonName) {
  await page.getByRole('button', { name: 'تصدير البيانات' }).click();
  await expect(modal(page).locator('.modal-title')).toHaveText('تصدير بيانات الطلاب');
  await modal(page).getByRole('button', { name: buttonName }).click();
}

async function worksheetText(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.getWorksheet('الطلاب');
  const values = [];
  sheet.eachRow((row) => values.push(...row.values.filter((v) => v !== undefined).map(String)));
  return values;
}

test.describe('students export (save dialog stubbed)', () => {
  test.beforeEach(async ({ authedPage }) => {
    await navigate(authedPage, 'شؤون الطلاب');
  });

  test('Excel export writes a workbook containing the student', async ({
    authedPage: page,
    electronApp,
  }, testInfo) => {
    const filePath = testInfo.outputPath('students.xlsx');
    await stubSaveDialog(electronApp, filePath);
    await addStudent(page, STUDENT_NAME);

    await exportStudents(page, 'تصدير إلى Excel');

    await expectToast(page, 'success', 'تم تصدير الملف بنجاح!');
    expect(fs.existsSync(filePath)).toBe(true);
    expect(await worksheetText(filePath)).toContain(STUDENT_NAME);
  });

  test('DOCX export writes a document containing the student', async ({
    authedPage: page,
    electronApp,
  }, testInfo) => {
    const filePath = testInfo.outputPath('students.docx');
    await stubSaveDialog(electronApp, filePath);
    await addStudent(page, STUDENT_NAME);

    await exportStudents(page, 'تصدير إلى DOCX');

    await expectToast(page, 'success', 'تم تصدير الملف بنجاح!');
    const documentXml = new PizZip(fs.readFileSync(filePath)).file('word/document.xml').asText();
    expect(documentXml).toContain(STUDENT_NAME);
  });

  test('exporting with no students reports an error and writes nothing', async ({
    authedPage: page,
    electronApp,
  }, testInfo) => {
    const filePath = testInfo.outputPath('empty.xlsx');
    await stubSaveDialog(electronApp, filePath);

    await exportStudents(page, 'تصدير إلى Excel');

    await expectToast(page, 'error', 'فشل التصدير');
    await expect(modal(page).locator('.alert-danger')).toContainText('فشل التصدير');
    expect(fs.existsSync(filePath)).toBe(false);
  });
});
