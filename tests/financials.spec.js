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

  // --- Donations ---
  describe('handleAddDonation', () => {
    it('should add a new cash donation', async () => {
        const newDonation = { donor_name: 'John Doe', amount: 500, donation_date: '2025-01-01', notes: '', donation_type: 'Cash', description: null };
        const insertedDonation = { id: 1, ...newDonation };
        db.runQuery.mockResolvedValue({ id: 1 });
        db.getQuery.mockResolvedValue(insertedDonation);

        await handleAddDonation({}, newDonation);

        expect(db.runQuery).toHaveBeenCalledWith(expect.any(String), ['John Doe', 500, '2025-01-01', '', 'Cash', null]);
    });

    it('should add a new in-kind donation', async () => {
        const newDonation = { donor_name: 'Jane Doe', amount: null, donation_date: '2025-01-02', notes: '', donation_type: 'In-kind', description: 'Office Chair' };
        const insertedDonation = { id: 2, ...newDonation };
        db.runQuery.mockResolvedValue({ id: 2 });
        db.getQuery.mockResolvedValue(insertedDonation);

        await handleAddDonation({}, newDonation);

        expect(db.runQuery).toHaveBeenCalledWith(expect.any(String), ['Jane Doe', null, '2025-01-02', '', 'In-kind', 'Office Chair']);
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
            if (sql.includes("UNION ALL")) { // This is the income query
                return Promise.resolve([
                    { source: 'Payments', total: 1000 },
                    { source: 'Donations', total: 500 }
                ]);
            }
            if (sql.includes("FROM expenses")) {
                return Promise.resolve([{ source: 'Expenses', total: 200 }]);
            }
            if (sql.includes("FROM salaries")) {
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

  // The handleGetChartData test has been removed because the feature is disabled in the source code.
});
