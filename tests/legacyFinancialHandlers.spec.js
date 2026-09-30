// tests/legacyFinancialHandlers.spec.js
// The legacy per-type tables are no longer IPC channels; exportManager.fetchFinancialData
// still reads them through these five getters, so only those are tested.
// '../src/db/db' resolves to tests/mocks/db.js through jest.config.js.
jest.mock('../src/main/logger');

const db = require('../src/db/db');
const {
  handleGetExpenses,
  handleGetDonations,
  handleGetSalaries,
  handleGetPayments,
  handleGetFinancialSummary,
} = require('../src/main/handlers/legacyFinancialHandlers');

describe('legacy financial getters used by the financial export', () => {
  const period = { startDate: '2025-01-01', endDate: '2025-01-31' };

  beforeEach(() => {
    db.resetMocks();
  });

  describe.each([
    ['handleGetExpenses', handleGetExpenses, 'expenses', 'expense_date'],
    ['handleGetDonations', handleGetDonations, 'donations', 'donation_date'],
  ])('%s', (_name, getter, table, dateColumn) => {
    it('lists every row, newest first, without a period', async () => {
      const rows = [{ id: 1 }];
      db.allQuery.mockResolvedValue(rows);

      await expect(getter(null, null)).resolves.toBe(rows);

      expect(db.allQuery).toHaveBeenCalledWith(
        `SELECT * FROM ${table} ORDER BY ${dateColumn} DESC`,
        [],
      );
    });

    it('limits the rows to the period', async () => {
      await getter(null, period);

      expect(db.allQuery).toHaveBeenCalledWith(
        `SELECT * FROM ${table} WHERE ${dateColumn} BETWEEN ? AND ? ORDER BY ${dateColumn} DESC`,
        ['2025-01-01', '2025-01-31'],
      );
    });

    it('ignores a period without both dates', async () => {
      await getter(null, { startDate: '2025-01-01' });

      expect(db.allQuery).toHaveBeenCalledWith(expect.not.stringContaining('BETWEEN'), []);
    });
  });

  describe('handleGetSalaries', () => {
    it('names teachers and admins and filters on the payment date', async () => {
      await handleGetSalaries(null, period);

      const [sql, params] = db.allQuery.mock.calls[0];
      expect(sql).toContain("WHEN s.user_type = 'teacher' THEN t.name");
      expect(sql).toContain("WHEN s.user_type = 'admin' THEN u.first_name || ' ' || u.last_name");
      expect(sql).toMatch(
        /WHERE s\.payment_date BETWEEN \? AND \?\s+ORDER BY s\.payment_date DESC/,
      );
      expect(params).toEqual(['2025-01-01', '2025-01-31']);
    });
  });

  describe('handleGetPayments', () => {
    it('joins the student name and filters on the payment date', async () => {
      await handleGetPayments(null, period);

      const [sql, params] = db.allQuery.mock.calls[0];
      expect(sql).toContain('JOIN students s ON p.student_id = s.id');
      expect(sql).toMatch(
        /WHERE p\.payment_date BETWEEN \? AND \?\s+ORDER BY p\.payment_date DESC/,
      );
      expect(params).toEqual(['2025-01-01', '2025-01-31']);
    });
  });

  describe('handleGetFinancialSummary', () => {
    const mockTotals = ({ payments, donations, expenses, salaries }) =>
      db.allQuery.mockImplementation((sql) => {
        if (sql.includes('UNION ALL')) {
          return Promise.resolve([
            { source: 'Payments', total: payments },
            { source: 'Donations', total: donations },
          ]);
        }
        if (sql.includes('FROM expenses')) {
          return Promise.resolve([{ source: 'Expenses', total: expenses }]);
        }
        return Promise.resolve([{ source: 'Salaries', total: salaries }]);
      });

    it('adds fees and cash donations, subtracts expenses and salaries, for the year', async () => {
      mockTotals({ payments: 1000, donations: 500, expenses: 200, salaries: 300 });

      const result = await handleGetFinancialSummary(null, 2024);

      expect(result).toMatchObject({ totalIncome: 1500, totalExpenses: 500, balance: 1000 });
      expect(result.expenseBreakdown).toEqual([
        { source: 'Expenses', total: 200 },
        { source: 'Salaries', total: 300 },
      ]);
      // Local date bounds for the whole calendar year; cash donations only.
      expect(db.allQuery).toHaveBeenCalledWith(expect.stringContaining("donation_type = 'Cash'"), [
        '2024-01-01 00:00:00',
        '2024-12-31 23:59:59',
        '2024-01-01 00:00:00',
        '2024-12-31 23:59:59',
      ]);
    });

    it('counts a year without rows as zero', async () => {
      mockTotals({ payments: null, donations: null, expenses: null, salaries: null });

      const result = await handleGetFinancialSummary(null, 2024);

      expect(result).toMatchObject({ totalIncome: 0, totalExpenses: 0, balance: 0 });
    });

    it('uses the current calendar year without a year', async () => {
      mockTotals({ payments: 0, donations: 0, expenses: 0, salaries: 0 });
      const year = new Date().getFullYear();

      await handleGetFinancialSummary(null, null);

      expect(db.allQuery).toHaveBeenCalledWith(expect.stringContaining('FROM expenses'), [
        `${year}-01-01 00:00:00`,
        `${year}-12-31 23:59:59`,
      ]);
    });
  });
});
