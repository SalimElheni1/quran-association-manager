/**
 * @fileoverview Financial Word Document Export Service
 * @author Quran Branch Manager Team
 */

const { ipcMain, dialog } = require('electron');
const {
  Document,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  Packer,
  TextRun,
} = require('docx');
const fs = require('fs').promises;
const db = require('../../db/db');
const { error: logError } = require('../logger');
const { requireRoles } = require('../authMiddleware');

/**
 * Format date to Arabic
 */
function formatDateArabic(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('ar-TN');
}

/**
 * Calculate starting balance for a period
 */
async function getStartingBalance(startDate) {
  console.log('[Word Export] getStartingBalance called with:', startDate);
  const cumulative = await db.getQuery(
    `SELECT 
      SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END) as total_income,
      SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END) as total_expense
     FROM transactions 
     WHERE transaction_date < ?`,
    [startDate],
  );

  console.log('[Word Export] Cumulative data:', cumulative);
  const account = await db.getQuery('SELECT initial_balance FROM accounts WHERE id = 1');
  console.log('[Word Export] Account data:', account);
  const initialBalance = account?.initial_balance || 0;
  const balance = initialBalance + (cumulative.total_income || 0) - (cumulative.total_expense || 0);
  console.log('[Word Export] Calculated starting balance:', balance);
  return balance;
}

/**
 * Generate Financial Report as Word Document
 */
async function generateFinancialReportWord(event, { period }) {
  try {
    console.log('[Word Export] Starting financial report generation...');
    console.log('[Word Export] Period:', period);
    const { startDate, endDate } = period;

    // Get settings
    console.log('[Word Export] Fetching settings...');
    const nationalName = await db.getQuery(
      "SELECT value FROM settings WHERE key = 'national_association_name'",
    );
    const regionalName = await db.getQuery(
      "SELECT value FROM settings WHERE key = 'regional_association_name'",
    );
    const localName = await db.getQuery(
      "SELECT value FROM settings WHERE key = 'local_branch_name'",
    );
    console.log('[Word Export] Settings fetched:', { nationalName, regionalName, localName });

    const orgName = nationalName?.value || 'الرابطة الوطنية للقرآن الكريم';
    const branchName = regionalName?.value || '';
    const schoolName = localName?.value || regionalName?.value || '';

    // Get financial data - income sources only (no amounts)
    console.log('[Word Export] Fetching income data...');
    const incomeRaw = await db.allQuery(
      `SELECT DISTINCT category FROM transactions
       WHERE transaction_date BETWEEN ? AND ? AND type = 'INCOME'
       AND category NOT IN ('معلوم الترسيم', 'معلوم شهري')`,
      [startDate, endDate],
    );

    // Check if student fees exist
    const studentFees = await db.getQuery(
      `SELECT COUNT(*) as count FROM student_payments
       WHERE payment_date BETWEEN ? AND ?`,
      [startDate, endDate],
    );

    // Build income sources list (names only) - use Set to avoid duplicates
    const incomeSourcesSet = new Set();
    if (studentFees?.count > 0) {
      incomeSourcesSet.add('رسوم الطلاب');
    }
    incomeRaw.forEach((item) => {
      // Skip legacy categories and English duplicates
      if (item.category === 'التبرعات النقدية') {
        incomeSourcesSet.add('التبرعات النقدية');
      } else if (item.category === 'التبرعات العينية') {
        incomeSourcesSet.add('التبرعات العينية');
      } else if (item.category !== 'Student Fees' && item.category !== 'رسوم الطلاب') {
        incomeSourcesSet.add(item.category);
      }
    });
    const incomeSources = Array.from(incomeSourcesSet);

    // Get income totals for summary
    const income = await db.allQuery(
      `SELECT category, SUM(amount) as total
       FROM transactions
       WHERE transaction_date BETWEEN ? AND ? AND type = 'INCOME'
       GROUP BY category`,
      [startDate, endDate],
    );

    console.log('[Word Export] Income data fetched:', income.length, 'records');

    console.log('[Word Export] Fetching expenses data...');
    const expenses = await db.allQuery(
      `SELECT category, SUM(amount) as total
       FROM transactions
       WHERE transaction_date BETWEEN ? AND ? AND type = 'EXPENSE'
       GROUP BY category`,
      [startDate, endDate],
    );
    console.log('[Word Export] Expenses data fetched:', expenses.length, 'records');

    const totalIncome = income.reduce((sum, r) => sum + r.total, 0);
    const totalExpenses = expenses.reduce((sum, r) => sum + r.total, 0);
    console.log('[Word Export] Calculating starting balance...');
    const startingBalance = await getStartingBalance(startDate);
    const endingBalance = startingBalance + totalIncome - totalExpenses;
    console.log('[Word Export] Financial calculations:', {
      totalIncome,
      totalExpenses,
      startingBalance,
      endingBalance,
    });

    // Show save dialog
    console.log('[Word Export] Showing save dialog...');
    const { filePath } = await dialog.showSaveDialog({
      title: 'حفظ التقرير المالي',
      defaultPath: `التقرير-المالي-${startDate}-${endDate}.docx`,
      filters: [{ name: 'Word Documents', extensions: ['docx'] }],
    });

    if (!filePath) {
      console.log('[Word Export] User cancelled save dialog');
      return { cancelled: true };
    }
    console.log('[Word Export] File path selected:', filePath);

    // Create Word document
    console.log('[Word Export] Creating Word document...');
    const doc = new Document({
      styles: {
        default: {
          document: {
            run: {
              font: 'Traditional Arabic',
              size: 28,
              rightToLeft: true,
            },
            paragraph: {
              alignment: AlignmentType.RIGHT,
            },
          },
        },
      },
      sections: [
        {
          properties: {
            page: {
              margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
            },
          },
          children: [
            // Header with decorative border
            new Paragraph({
              text: '═'.repeat(60),
              alignment: AlignmentType.CENTER,
              spacing: { after: 200 },
            }),
            new Paragraph({
              children: [new TextRun({ text: orgName, bold: true, size: 32, rightToLeft: true })],
              alignment: AlignmentType.CENTER,
              spacing: { after: 100 },
            }),
            new Paragraph({
              children: [new TextRun({ text: branchName, size: 24, rightToLeft: true })],
              alignment: AlignmentType.CENTER,
              spacing: { after: 100 },
            }),
            new Paragraph({
              children: [new TextRun({ text: schoolName, size: 24, rightToLeft: true })],
              alignment: AlignmentType.CENTER,
              spacing: { after: 200 },
            }),
            new Paragraph({
              text: '═'.repeat(60),
              alignment: AlignmentType.CENTER,
              spacing: { after: 400 },
            }),

            // Report Title
            new Paragraph({
              children: [
                new TextRun({
                  text: `التقرير المالي للفترة الممتدة بين ${formatDateArabic(startDate)} و ${formatDateArabic(endDate)}`,
                  bold: true,
                  size: 28,
                  rightToLeft: true,
                }),
              ],
              alignment: AlignmentType.CENTER,
              spacing: { after: 400 },
            }),

            // Key Figures
            new Paragraph({
              children: [
                new TextRun({
                  text: `السيولة بتاريخ ${formatDateArabic(startDate)}: ${startingBalance.toFixed(3)} دينار`,
                  size: 28,
                  rightToLeft: true,
                }),
              ],
              alignment: AlignmentType.RIGHT,
              spacing: { after: 200 },
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: `مجموع المداخيل: ${totalIncome.toFixed(3)} دينار`,
                  size: 28,
                  rightToLeft: true,
                }),
              ],
              alignment: AlignmentType.RIGHT,
              spacing: { after: 200 },
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: `مجموع المصاريف: ${totalExpenses.toFixed(3)} دينار`,
                  size: 28,
                  rightToLeft: true,
                }),
              ],
              alignment: AlignmentType.RIGHT,
              spacing: { after: 200 },
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: `السيولة بتاريخ ${formatDateArabic(endDate)}: ${endingBalance.toFixed(3)} دينار`,
                  bold: true,
                  size: 28,
                  rightToLeft: true,
                }),
              ],
              alignment: AlignmentType.RIGHT,
              spacing: { after: 400 },
            }),

            // Details Section
            new Paragraph({
              children: [
                new TextRun({
                  text: 'التفصيل',
                  bold: true,
                  underline: {},
                  size: 32,
                  rightToLeft: true,
                }),
              ],
              alignment: AlignmentType.RIGHT,
              spacing: { before: 400, after: 200 },
            }),

            // Income Description
            new Paragraph({
              children: [
                new TextRun({
                  text: 'المداخيل: كل المداخيل متأتية من ' + incomeSources.join('، '),
                  bold: true,
                  size: 28,
                  rightToLeft: true,
                }),
              ],
              alignment: AlignmentType.RIGHT,
              spacing: { after: 200 },
            }),

            new Paragraph({
              text: '',
              spacing: { after: 300 },
            }),

            // Expense Description
            new Paragraph({
              children: [
                new TextRun({
                  text: 'المصاريف: تنقسم المصاريف كما يلي:',
                  bold: true,
                  size: 28,
                  rightToLeft: true,
                }),
              ],
              alignment: AlignmentType.RIGHT,
              spacing: { after: 200 },
            }),

            // Expense Table
            new Table({
              width: { size: 100, type: WidthType.PERCENTAGE },
              rows: [
                new TableRow({
                  children: [
                    new TableCell({
                      children: [
                        new Paragraph({
                          children: [
                            new TextRun({
                              text: 'البيان',
                              bold: true,
                              size: 28,
                              rightToLeft: true,
                            }),
                          ],
                          alignment: AlignmentType.CENTER,
                        }),
                      ],
                      width: { size: 70, type: WidthType.PERCENTAGE },
                    }),
                    new TableCell({
                      children: [
                        new Paragraph({
                          children: [
                            new TextRun({
                              text: 'المبلغ',
                              bold: true,
                              size: 28,
                              rightToLeft: true,
                            }),
                          ],
                          alignment: AlignmentType.CENTER,
                        }),
                      ],
                      width: { size: 30, type: WidthType.PERCENTAGE },
                    }),
                  ],
                }),
                ...expenses.map(
                  (item) =>
                    new TableRow({
                      children: [
                        new TableCell({
                          children: [
                            new Paragraph({
                              children: [
                                new TextRun({ text: item.category, size: 28, rightToLeft: true }),
                              ],
                              alignment: AlignmentType.RIGHT,
                            }),
                          ],
                        }),
                        new TableCell({
                          children: [
                            new Paragraph({
                              children: [
                                new TextRun({
                                  text: `${item.total.toFixed(3)} دينار`,
                                  size: 28,
                                  rightToLeft: true,
                                }),
                              ],
                              alignment: AlignmentType.CENTER,
                            }),
                          ],
                        }),
                      ],
                    }),
                ),
              ],
            }),
          ],
        },
      ],
    });

    // Write file
    console.log('[Word Export] Converting document to buffer...');
    const buffer = await Packer.toBuffer(doc);
    console.log('[Word Export] Writing file to disk...');
    await fs.writeFile(filePath, buffer);
    console.log('[Word Export] File written successfully!');

    return { success: true, filePath };
  } catch (error) {
    console.error('[Word Export] ERROR:', error);
    console.error('[Word Export] Error stack:', error.stack);
    logError('Error generating financial report Word:', error);
    throw new Error('فشل في إنشاء التقرير المالي: ' + error.message);
  }
}

/**
 * Register Financial Word Export Handlers
 */
function registerFinancialWordExportHandlers() {
  ipcMain.handle(
    'financial-export:word-report',
    requireRoles(['Superadmin', 'Administrator', 'FinanceManager'])(generateFinancialReportWord),
  );
}

module.exports = {
  registerFinancialWordExportHandlers,
};
