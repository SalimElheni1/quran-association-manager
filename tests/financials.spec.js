const { app } = require('electron');
const {
    handleGetExpenses, handleAddExpense, handleUpdateExpense, handleDeleteExpense,
    handleGetDonations, handleAddDonation, handleUpdateDonation, handleDeleteDonation,
    handleGetSalaries, handleAddSalary, handleUpdateSalary, handleDeleteSalary,
    handleGetPayments, handleAddPayment, handleUpdatePayment, handleDeletePayment,
    handleGetFinancialSummary, handleGetChartData
} = require('../src/main/financialHandlers');
const db = require('../src/db/db');

// Mock the electron app module
jest.mock('electron', () => ({
  app: {
    getAppPath: jest.fn(() => '/mock/app/path'),
    getPath: jest.fn((name) => `/mock/user/data/${name}`),
  },
  ipcMain: {
    handle: jest.fn(),
  },
}));

// Mock the db functions
jest.mock('../src/db/db', () => ({
  allQuery: jest.fn(),
  runQuery: jest.fn(),
  getQuery: jest.fn(),
}));

describe('Financial Handlers', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  // --- Expenses ---
  describe('handleGetExpenses', () => {
    it('should retrieve all expenses', async () => {
      const mockData = [{ id: 1, category: 'Supplies', amount: 100 }];
      db.allQuery.mockResolvedValue(mockData);
      const result = await handleGetExpenses();
      expect(db.allQuery).toHaveBeenCalledWith('SELECT * FROM expenses ORDER BY expense_date DESC');
      expect(result).toEqual(mockData);
    });
  });

  describe('handleAddExpense', () => {
    it('should add a new expense and return it', async () => {
      const newExpense = { category: 'Catering', amount: 500, expense_date: '2025-01-01', responsible_person: 'Admin', description: 'Lunch' };
      const insertedExpense = { id: 1, ...newExpense };
      db.runQuery.mockResolvedValue({ id: 1 });
      db.getQuery.mockResolvedValue(insertedExpense);
      const result = await handleAddExpense({}, newExpense);
      expect(db.runQuery).toHaveBeenCalled();
      expect(db.getQuery).toHaveBeenCalledWith('SELECT * FROM expenses WHERE id = ?', [1]);
      expect(result).toEqual(insertedExpense);
    });
  });

  describe('handleDeleteExpense', () => {
    it('should delete an expense', async () => {
      db.runQuery.mockResolvedValue({ changes: 1 });
      const result = await handleDeleteExpense({}, 1);
      expect(db.runQuery).toHaveBeenCalledWith('DELETE FROM expenses WHERE id = ?', [1]);
      expect(result).toEqual({ id: 1 });
    });
  });

  // --- Donations ---
  describe('handleGetDonations', () => {
    it('should retrieve all donations', async () => {
      const mockData = [{ id: 1, donor_name: 'Anonymous', amount: 1000 }];
      db.allQuery.mockResolvedValue(mockData);
      const result = await handleGetDonations();
      expect(db.allQuery).toHaveBeenCalledWith('SELECT * FROM donations ORDER BY donation_date DESC');
      expect(result).toEqual(mockData);
    });
  });

  // --- Salaries ---
  describe('handleGetSalaries', () => {
    it('should retrieve all salaries with teacher names', async () => {
      const mockData = [{ id: 1, teacher_name: 'Test Teacher', amount: 5000 }];
      db.allQuery.mockResolvedValue(mockData);
      await handleGetSalaries();
      expect(db.allQuery).toHaveBeenCalled();
    });
  });

  // --- Payments ---
  describe('handleGetPayments', () => {
    it('should retrieve all payments with student names', async () => {
      const mockData = [{ id: 1, student_name: 'Test Student', amount: 200 }];
      db.allQuery.mockResolvedValue(mockData);
      await handleGetPayments();
      expect(db.allQuery).toHaveBeenCalled();
    });
  });

  // --- Summary & Charting ---
  describe('handleGetFinancialSummary', () => {
    it('should calculate the financial summary correctly', async () => {
        db.allQuery.mockImplementation((sql) => {
            if (sql.includes("SELECT 'Payments' as source")) { // Income query
                return Promise.resolve([
                    { source: 'Payments', total: 1000 },
                    { source: 'Donations', total: 500 }
                ]);
            }
            if (sql.includes("SELECT 'Expenses' as source")) { // Expenses query
                return Promise.resolve([{ source: 'Expenses', total: 200 }]);
            }
            if (sql.includes("SELECT 'Salaries' as source")) { // Salaries query
                return Promise.resolve([{ source: 'Salaries', total: 300 }]);
            }
            return Promise.resolve([]);
        });

        const result = await handleGetFinancialSummary();
        expect(result.totalIncome).toBe(1500);
        expect(result.totalExpenses).toBe(500);
        expect(result.balance).toBe(1000);
    });
  });

  describe('handleGetChartData', () => {
    it('should return aggregated data for charts', async () => {
        db.allQuery.mockImplementation((sql) => {
            if (sql.includes('strftime')) {
                return Promise.resolve([{ month: '2025-01', totalIncome: 100, totalExpense: 50 }]);
            }
            if (sql.includes('GROUP BY category')) {
                return Promise.resolve([{ category: 'Supplies', total: 50 }]);
            }
            if (sql.includes("SELECT 'الرسوم الدراسية' as source")) {
                return Promise.resolve([{ source: 'الرسوم الدراسية', total: 100 }, { source: 'التبرعات', total: 200 }]);
            }
            return Promise.resolve([]);
        });
        const result = await handleGetChartData();
        expect(result.timeSeriesData.length).toBe(1);
        expect(result.expenseCategoryData.length).toBe(1);
        expect(result.incomeSourceData.length).toBe(2);
    });
  });
});
