const { ipcMain } = require('electron');
const db = require('../src/db/db');
const {
  registerLegacyFinancialHandlers,
  handleGetExpenses,
  handleAddExpense,
  handleGetDonations,
  handleAddDonation,
  handleGetSalaries,
  handleAddSalary,
  handleGetPayments,
  handleAddPayment,
  handleGetStatementOfActivities,
  handleGetMonthlySnapshot,
  handleGetFinancialSummary,
} = require('../src/main/handlers/legacyFinancialHandlers');

jest.mock('../src/db/db');
jest.mock('../src/main/logger');

describe('Legacy Financial Handlers - Comprehensive', () => {
  let handlers = {};

  beforeEach(() => {
    jest.clearAllMocks();
    handlers = {};
    ipcMain.handle.mockImplementation((channel, handler) => {
      handlers[channel] = handler;
    });
    registerLegacyFinancialHandlers();
  });

  describe('Expense Handlers', () => {
    it('should get all expenses without period', async () => {
      db.allQuery.mockResolvedValue([{ id: 1, category: 'Office', amount: 100 }]);

      const result = await handlers['get-expenses'](null);

      expect(db.allQuery).toHaveBeenCalledWith(
        'SELECT * FROM expenses ORDER BY expense_date DESC',
        []
      );
      expect(result).toHaveLength(1);
    });

    it('should get expenses with period filter', async () => {
      db.allQuery.mockResolvedValue([]);

      await handlers['get-expenses'](null, { startDate: '2024-01-01', endDate: '2024-01-31' });

      expect(db.allQuery).toHaveBeenCalledWith(
        'SELECT * FROM expenses WHERE expense_date BETWEEN ? AND ? ORDER BY expense_date DESC',
        ['2024-01-01', '2024-01-31']
      );
    });

    it('should add expense', async () => {
      const expense = {
        category: 'Utilities',
        amount: 200,
        expense_date: '2024-01-15',
        responsible_person: 'Admin',
        description: 'Electric bill',
      };
      db.runQuery.mockResolvedValue({ id: 1 });
      db.getQuery.mockResolvedValue({ id: 1, ...expense });

      const result = await handlers['add-expense'](null, expense);

      expect(db.runQuery).toHaveBeenCalled();
      expect(result.id).toBe(1);
    });

    it('should update expense', async () => {
      const expense = { id: 1, category: 'Office', amount: 150 };
      db.runQuery.mockResolvedValue({ changes: 1 });
      db.getQuery.mockResolvedValue(expense);

      const result = await handlers['update-expense'](null, expense);

      expect(db.runQuery).toHaveBeenCalled();
      expect(result.id).toBe(1);
    });

    it('should delete expense', async () => {
      db.runQuery.mockResolvedValue({ changes: 1 });

      const result = await handlers['delete-expense'](null, 1);

      expect(db.runQuery).toHaveBeenCalledWith('DELETE FROM expenses WHERE id = ?', [1]);
      expect(result).toEqual({ id: 1 });
    });
  });

  describe('Donation Handlers', () => {
    it('should get donations without period', async () => {
      db.allQuery.mockResolvedValue([{ id: 1, donor_name: 'John', amount: 500 }]);

      const result = await handlers['get-donations'](null);

      expect(db.allQuery).toHaveBeenCalledWith(
        'SELECT * FROM donations ORDER BY donation_date DESC',
        []
      );
      expect(result).toHaveLength(1);
    });

    it('should get donations with period filter', async () => {
      db.allQuery.mockResolvedValue([]);

      await handlers['get-donations'](null, { startDate: '2024-01-01', endDate: '2024-01-31' });

      expect(db.allQuery).toHaveBeenCalledWith(
        'SELECT * FROM donations WHERE donation_date BETWEEN ? AND ? ORDER BY donation_date DESC',
        ['2024-01-01', '2024-01-31']
      );
    });

    it('should add donation', async () => {
      const donation = {
        donor_name: 'Jane',
        amount: 1000,
        donation_date: '2024-01-20',
        notes: 'Thank you',
        donation_type: 'Cash',
        description: 'General donation',
        quantity: null,
        category: null,
      };
      db.runQuery.mockResolvedValue({ id: 1 });
      db.getQuery.mockResolvedValue({ id: 1, ...donation });

      const result = await handlers['add-donation'](null, donation);

      expect(result.id).toBe(1);
    });

    it('should update donation', async () => {
      const donation = { id: 1, donor_name: 'Jane Updated', amount: 1200 };
      db.runQuery.mockResolvedValue({ changes: 1 });
      db.getQuery.mockResolvedValue(donation);

      const result = await handlers['update-donation'](null, donation);

      expect(result.id).toBe(1);
    });

    it('should delete donation', async () => {
      db.runQuery.mockResolvedValue({ changes: 1 });

      const result = await handlers['delete-donation'](null, 1);

      expect(db.runQuery).toHaveBeenCalledWith('DELETE FROM donations WHERE id = ?', [1]);
      expect(result).toEqual({ id: 1 });
    });
  });

  describe('Salary Handlers', () => {
    it('should get salaries without period', async () => {
      db.allQuery.mockResolvedValue([{ id: 1, employee_name: 'Teacher A', amount: 3000 }]);

      const result = await handlers['get-salaries'](null);

      expect(db.allQuery).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });

    it('should get salaries with period filter', async () => {
      db.allQuery.mockResolvedValue([]);

      await handlers['get-salaries'](null, { startDate: '2024-01-01', endDate: '2024-01-31' });

      expect(db.allQuery).toHaveBeenCalled();
      const call = db.allQuery.mock.calls[0];
      expect(call[0]).toContain('WHERE s.payment_date BETWEEN ? AND ?');
    });

    it('should add salary', async () => {
      const salary = {
        user_id: 1,
        user_type: 'teacher',
        amount: 3000,
        payment_date: '2024-01-31',
        notes: 'Monthly salary',
      };
      db.runQuery.mockResolvedValue({ id: 1 });
      db.getQuery.mockResolvedValue({ id: 1, ...salary, employee_name: 'Teacher A' });

      const result = await handlers['add-salary'](null, salary);

      expect(result.id).toBe(1);
    });

    it('should update salary', async () => {
      const salary = { id: 1, user_id: 1, user_type: 'teacher', amount: 3200 };
      db.runQuery.mockResolvedValue({ changes: 1 });
      db.getQuery.mockResolvedValue({ ...salary, employee_name: 'Teacher A' });

      const result = await handlers['update-salary'](null, salary);

      expect(result.id).toBe(1);
    });

    it('should delete salary', async () => {
      db.runQuery.mockResolvedValue({ changes: 1 });

      const result = await handlers['delete-salary'](null, 1);

      expect(db.runQuery).toHaveBeenCalledWith('DELETE FROM salaries WHERE id = ?', [1]);
      expect(result).toEqual({ id: 1 });
    });
  });

  describe('Payment Handlers', () => {
    it('should get payments without period', async () => {
      db.allQuery.mockResolvedValue([{ id: 1, student_name: 'Student A', amount: 500 }]);

      const result = await handlers['get-payments'](null);

      expect(db.allQuery).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });

    it('should get payments with period filter', async () => {
      db.allQuery.mockResolvedValue([]);

      await handlers['get-payments'](null, { startDate: '2024-01-01', endDate: '2024-01-31' });

      expect(db.allQuery).toHaveBeenCalled();
      const call = db.allQuery.mock.calls[0];
      expect(call[0]).toContain('WHERE p.payment_date BETWEEN ? AND ?');
    });

    it('should add payment', async () => {
      const payment = {
        student_id: 1,
        amount: 500,
        payment_date: '2024-01-15',
        payment_method: 'Cash',
        notes: 'Monthly fee',
        receipt_number: 'R001',
        receipt_book_id: 1,
        receipt_issued_by: 'Admin',
        receipt_issued_date: '2024-01-15',
      };
      db.runQuery.mockResolvedValue({ id: 1 });
      db.getQuery.mockResolvedValue({ id: 1, ...payment, student_name: 'Student A' });

      const result = await handlers['add-payment'](null, payment);

      expect(result.id).toBe(1);
    });

    it('should update payment', async () => {
      const payment = { id: 1, student_id: 1, amount: 600 };
      db.runQuery.mockResolvedValue({ changes: 1 });
      db.getQuery.mockResolvedValue({ ...payment, student_name: 'Student A' });

      const result = await handlers['update-payment'](null, payment);

      expect(result.id).toBe(1);
    });

    it('should delete payment', async () => {
      db.runQuery.mockResolvedValue({ changes: 1 });

      const result = await handlers['delete-payment'](null, 1);

      expect(db.runQuery).toHaveBeenCalledWith('DELETE FROM payments WHERE id = ?', [1]);
      expect(result).toEqual({ id: 1 });
    });
  });

  describe('Reporting Handlers', () => {
    it('should get statement of activities with period', async () => {
      db.getQuery
        .mockResolvedValueOnce({ total: 5000 })
        .mockResolvedValueOnce({ total: 2000 })
        .mockResolvedValueOnce({ total: 3000 });
      db.allQuery
        .mockResolvedValueOnce([{ category: 'Office', total: 500 }])
        .mockResolvedValueOnce([{ date: '2024-01-15', type: 'دفعة رسوم', amount: 500 }]);

      const result = await handlers['get-statement-of-activities'](null, {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      });

      expect(result.studentFees).toBe(5000);
      expect(result.cashDonations).toBe(2000);
      expect(result.salaries).toBe(3000);
      expect(result.expensesByCategory).toHaveLength(1);
      expect(result.recentTransactions).toHaveLength(1);
    });

    it('should get statement of activities without period (current month)', async () => {
      db.getQuery.mockResolvedValue({ total: 0 });
      db.allQuery.mockResolvedValue([]);

      const result = await handlers['get-statement-of-activities'](null);

      expect(result).toHaveProperty('studentFees');
      expect(result).toHaveProperty('cashDonations');
      expect(result).toHaveProperty('salaries');
    });

    it('should get monthly snapshot with period', async () => {
      db.getQuery
        .mockResolvedValueOnce({ total: 10000 })
        .mockResolvedValueOnce({ total: 2000 })
        .mockResolvedValueOnce({ total: 3000 })
        .mockResolvedValueOnce({ total: 5000 })
        .mockResolvedValueOnce({ count: 20 })
        .mockResolvedValueOnce({ max: 1000 });

      const result = await handlers['get-monthly-snapshot'](null, {
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      });

      expect(result.totalIncomeThisMonth).toBe(12000);
      expect(result.totalExpensesThisMonth).toBe(8000);
      expect(result.paymentsThisMonth).toBe(20);
      expect(result.largestExpenseThisMonth).toBe(1000);
    });

    it('should get monthly snapshot without period (current month)', async () => {
      db.getQuery.mockResolvedValue({ total: 0, count: 0, max: 0 });

      const result = await handlers['get-monthly-snapshot'](null);

      expect(result).toHaveProperty('totalIncomeThisMonth');
      expect(result).toHaveProperty('totalExpensesThisMonth');
    });

    it('should get financial summary for specific year', async () => {
      db.allQuery
        .mockResolvedValueOnce([
          { source: 'Payments', total: 50000 },
          { source: 'Donations', total: 10000 },
        ])
        .mockResolvedValueOnce([{ source: 'Expenses', total: 20000 }])
        .mockResolvedValueOnce([{ source: 'Salaries', total: 30000 }]);

      const result = await handlers['get-financial-summary'](null, 2024);

      expect(result.totalIncome).toBe(60000);
      expect(result.totalExpenses).toBe(50000);
      expect(result.balance).toBe(10000);
      expect(result.incomeBreakdown).toHaveLength(2);
      expect(result.expenseBreakdown).toHaveLength(2);
    });

    it('should get financial summary for current year when no year provided', async () => {
      db.allQuery.mockResolvedValue([{ source: 'Test', total: 0 }]);

      const result = await handlers['get-financial-summary'](null);

      expect(result).toHaveProperty('totalIncome');
      expect(result).toHaveProperty('balance');
    });
  });

  describe('Direct Function Exports', () => {
    it('should export handleGetExpenses', async () => {
      db.allQuery.mockResolvedValue([]);
      await handleGetExpenses(null);
      expect(db.allQuery).toHaveBeenCalled();
    });

    it('should export handleAddExpense', async () => {
      db.runQuery.mockResolvedValue({ id: 1 });
      db.getQuery.mockResolvedValue({ id: 1 });
      await handleAddExpense(null, { category: 'Test', amount: 100 });
      expect(db.runQuery).toHaveBeenCalled();
    });

    it('should export handleGetDonations', async () => {
      db.allQuery.mockResolvedValue([]);
      await handleGetDonations(null);
      expect(db.allQuery).toHaveBeenCalled();
    });

    it('should export handleAddDonation', async () => {
      db.runQuery.mockResolvedValue({ id: 1 });
      db.getQuery.mockResolvedValue({ id: 1 });
      await handleAddDonation(null, { donor_name: 'Test', amount: 100 });
      expect(db.runQuery).toHaveBeenCalled();
    });

    it('should export handleGetSalaries', async () => {
      db.allQuery.mockResolvedValue([]);
      await handleGetSalaries(null);
      expect(db.allQuery).toHaveBeenCalled();
    });

    it('should export handleAddSalary', async () => {
      db.runQuery.mockResolvedValue({ id: 1 });
      db.getQuery.mockResolvedValue({ id: 1 });
      await handleAddSalary(null, { user_id: 1, user_type: 'teacher', amount: 3000 });
      expect(db.runQuery).toHaveBeenCalled();
    });

    it('should export handleGetPayments', async () => {
      db.allQuery.mockResolvedValue([]);
      await handleGetPayments(null);
      expect(db.allQuery).toHaveBeenCalled();
    });

    it('should export handleAddPayment', async () => {
      db.runQuery.mockResolvedValue({ id: 1 });
      db.getQuery.mockResolvedValue({ id: 1 });
      await handleAddPayment(null, { student_id: 1, amount: 500 });
      expect(db.runQuery).toHaveBeenCalled();
    });

    it('should export handleGetStatementOfActivities', async () => {
      db.getQuery.mockResolvedValue({ total: 0 });
      db.allQuery.mockResolvedValue([]);
      await handleGetStatementOfActivities(null);
      expect(db.getQuery).toHaveBeenCalled();
    });

    it('should export handleGetMonthlySnapshot', async () => {
      db.getQuery.mockResolvedValue({ total: 0 });
      await handleGetMonthlySnapshot(null);
      expect(db.getQuery).toHaveBeenCalled();
    });

    it('should export handleGetFinancialSummary', async () => {
      db.allQuery.mockResolvedValue([]);
      await handleGetFinancialSummary(null);
      expect(db.allQuery).toHaveBeenCalled();
    });
  });
});
