const { fetchFinancialData, generateFinancialXlsx } = require('../src/main/exportManager');
const financialHandlers = require('../src/main/financialHandlers');
const ExcelJS = require('exceljs');
const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('../src/main/financialHandlers');
jest.mock('exceljs');
jest.mock('../src/db/db', () => ({
  allQuery: jest.fn().mockResolvedValue([]),
}));

describe('Financial Export', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'financial-export-tests-'));
    jest.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should fetch all financial data', async () => {
    financialHandlers.handleGetFinancialSummary.mockResolvedValue({ totalIncome: 1000 });
    financialHandlers.handleGetPayments.mockResolvedValue([{ id: 1, amount: 100 }]);
    financialHandlers.handleGetSalaries.mockResolvedValue([{ id: 1, amount: 50 }]);
    financialHandlers.handleGetDonations.mockResolvedValue([{ id: 1, amount: 200 }]);
    financialHandlers.handleGetExpenses.mockResolvedValue([{ id: 1, amount: 20 }]);

    const data = await fetchFinancialData();

    expect(data.summary.totalIncome).toBe(1000);
    expect(data.payments.length).toBe(1);
    expect(data.salaries.length).toBe(1);
    expect(data.donations.length).toBe(1);
    expect(data.expenses.length).toBe(1);
  });

  it('should generate a multi-sheet excel file', async () => {
    const mockData = {
      summary: { totalIncome: 1000, totalExpenses: 70, balance: 930 },
      payments: [
        {
          student_name: 's1',
          amount: 100,
          payment_method: 'cash',
          payment_date: '2025-01-01',
          notes: '',
        },
      ],
      salaries: [{ teacher_name: 't1', amount: 50, payment_date: '2025-01-01', notes: '' }],
      donations: [
        {
          donor_name: 'd1',
          donation_type: 'Cash',
          amount: 200,
          donation_date: '2025-01-01',
          notes: '',
        },
      ],
      expenses: [
        {
          category: 'c1',
          amount: 20,
          expense_date: '2025-01-01',
          responsible_person: 'p1',
          description: '',
        },
      ],
    };
    const outputPath = path.join(tmpDir, 'financial-report.xlsx');

    const mockWorkbook = {
      addWorksheet: jest.fn().mockReturnThis(),
      addRow: jest.fn().mockReturnThis(),
      addRows: jest.fn().mockReturnThis(),
      xlsx: {
        writeFile: jest.fn().mockResolvedValue(),
      },
      views: [],
      columns: [],
    };
    ExcelJS.Workbook.mockReturnValue(mockWorkbook);

    await generateFinancialXlsx(mockData, outputPath);

    expect(mockWorkbook.addWorksheet).toHaveBeenCalledWith('الملخص');
    expect(mockWorkbook.addWorksheet).toHaveBeenCalledWith('الرسوم الدراسية');
    expect(mockWorkbook.addWorksheet).toHaveBeenCalledWith('الرواتب');
    expect(mockWorkbook.addWorksheet).toHaveBeenCalledWith('التبرعات');
    expect(mockWorkbook.addWorksheet).toHaveBeenCalledWith('المصاريف');
    expect(mockWorkbook.xlsx.writeFile).toHaveBeenCalledWith(outputPath);
  });
});
