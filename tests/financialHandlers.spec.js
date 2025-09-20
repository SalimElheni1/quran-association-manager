// Mock dependencies first
jest.mock('../src/main/logger');
jest.mock('../src/db/db');
jest.mock('../src/main/settingsManager');
jest.mock('../src/main/validationSchemas');

const { log, error: logError } = require('../src/main/logger');
const { allQuery, runQuery, getQuery } = require('../src/db/db');
const { getSetting } = require('../src/main/settingsManager');
const {
  handleGetExpenses,
  handleAddExpense,
  handleGetDonations,
  handleAddDonation,
  handleGetInventoryItems,
  handleCheckItemUniqueness,
  handleGetSalaries,
  handleGetPayments,
  handleGetStatementOfActivities,
  handleGetMonthlySnapshot,
  handleGetFinancialSummary,
} = require('../src/main/financialHandlers');

describe('financialHandlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('handleGetExpenses', () => {
    it('should get expenses with date filter', async () => {
      const mockExpenses = [
        { id: 1, category: 'Bills', amount: 100, expense_date: '2024-01-15' },
        { id: 2, category: 'Supplies', amount: 50, expense_date: '2024-01-20' },
      ];
      allQuery.mockResolvedValue(mockExpenses);

      const period = { startDate: '2024-01-01', endDate: '2024-01-31' };
      const result = await handleGetExpenses(null, period);

      expect(allQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE expense_date BETWEEN ? AND ?'),
        ['2024-01-01', '2024-01-31']
      );
      expect(result).toEqual(mockExpenses);
    });

    it('should get all expenses when no period provided', async () => {
      const mockExpenses = [{ id: 1, category: 'Bills', amount: 100 }];
      allQuery.mockResolvedValue(mockExpenses);

      const result = await handleGetExpenses();

      expect(allQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM expenses ORDER BY expense_date DESC'),
        []
      );
      expect(result).toEqual(mockExpenses);
    });
  });

  describe('handleAddExpense', () => {
    it('should add new expense successfully', async () => {
      const expenseData = {
        category: 'Office Supplies',
        amount: 75.50,
        expense_date: '2024-01-15',
        responsible_person: 'John Doe',
        description: 'Printer paper and pens',
      };

      runQuery.mockResolvedValue({ lastID: 1 });

      const result = await handleAddExpense(null, expenseData);

      expect(runQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO expenses'),
        expect.arrayContaining([
          'Office Supplies',
          75.50,
          '2024-01-15',
          'John Doe',
          'Printer paper and pens'
        ])
      );
      expect(result).toEqual({ success: true, id: 1 });
    });
  });

  describe('handleGetDonations', () => {
    it('should get donations with period filter', async () => {
      const mockDonations = [
        { id: 1, donor_name: 'Ahmed', donation_type: 'Cash', amount: 500 },
        { id: 2, donor_name: 'Fatima', donation_type: 'In-kind', description: 'Books' },
      ];
      allQuery.mockResolvedValue(mockDonations);

      const period = { startDate: '2024-01-01', endDate: '2024-01-31' };
      const result = await handleGetDonations(null, period);

      expect(allQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE donation_date BETWEEN ? AND ?'),
        ['2024-01-01', '2024-01-31']
      );
      expect(result).toEqual(mockDonations);
    });
  });

  describe('handleAddDonation', () => {
    it('should add cash donation successfully', async () => {
      const donationData = {
        donor_name: 'Ahmed Ali',
        donation_type: 'Cash',
        amount: 1000,
        donation_date: '2024-01-15',
        notes: 'Monthly donation',
      };

      runQuery.mockResolvedValue({ lastID: 1 });

      const result = await handleAddDonation(null, donationData);

      expect(runQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO donations'),
        expect.arrayContaining([
          'Ahmed Ali',
          'Cash',
          1000,
          null, // description is null for cash donations
          '2024-01-15',
          'Monthly donation'
        ])
      );
      expect(result).toEqual({ success: true, id: 1 });
    });

    it('should add in-kind donation successfully', async () => {
      const donationData = {
        donor_name: 'Fatima Hassan',
        donation_type: 'In-kind',
        description: '50 Quran copies',
        donation_date: '2024-01-15',
      };

      runQuery.mockResolvedValue({ lastID: 2 });

      const result = await handleAddDonation(null, donationData);

      expect(runQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO donations'),
        expect.arrayContaining([
          'Fatima Hassan',
          'In-kind',
          null, // amount is null for in-kind donations
          '50 Quran copies',
          '2024-01-15',
          undefined
        ])
      );
      expect(result).toEqual({ success: true, id: 2 });
    });
  });

  describe('handleGetInventoryItems', () => {
    it('should get all inventory items', async () => {
      const mockItems = [
        { id: 1, item_name: 'Quran', category: 'Books', quantity: 50 },
        { id: 2, item_name: 'Whiteboard', category: 'Furniture', quantity: 5 },
      ];
      allQuery.mockResolvedValue(mockItems);

      const result = await handleGetInventoryItems();

      expect(allQuery).toHaveBeenCalledWith(
        'SELECT * FROM inventory_items ORDER BY item_name',
        []
      );
      expect(result).toEqual(mockItems);
    });
  });

  describe('handleCheckItemUniqueness', () => {
    it('should return true for unique item', async () => {
      getQuery.mockResolvedValue(null); // No existing item

      const result = await handleCheckItemUniqueness(null, {
        item_name: 'New Item',
        category: 'Books'
      });

      expect(getQuery).toHaveBeenCalledWith(
        'SELECT id FROM inventory_items WHERE item_name = ? AND category = ?',
        ['New Item', 'Books']
      );
      expect(result).toBe(true);
    });

    it('should return false for duplicate item', async () => {
      getQuery.mockResolvedValue({ id: 1 }); // Existing item

      const result = await handleCheckItemUniqueness(null, {
        item_name: 'Existing Item',
        category: 'Books'
      });

      expect(result).toBe(false);
    });
  });

  describe('handleGetSalaries', () => {
    it('should get salaries with period filter', async () => {
      const mockSalaries = [
        { id: 1, user_id: 1, amount: 1500, payment_date: '2024-01-01' },
        { id: 2, user_id: 2, amount: 1200, payment_date: '2024-01-15' },
      ];
      allQuery.mockResolvedValue(mockSalaries);

      const period = { startDate: '2024-01-01', endDate: '2024-01-31' };
      const result = await handleGetSalaries(null, period);

      expect(allQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE s.payment_date BETWEEN ? AND ?'),
        ['2024-01-01', '2024-01-31']
      );
      expect(result).toEqual(mockSalaries);
    });
  });

  describe('handleGetPayments', () => {
    it('should get payments with period filter', async () => {
      const mockPayments = [
        { id: 1, student_id: 1, amount: 100, payment_date: '2024-01-01' },
        { id: 2, student_id: 2, amount: 150, payment_date: '2024-01-15' },
      ];
      allQuery.mockResolvedValue(mockPayments);

      const period = { startDate: '2024-01-01', endDate: '2024-01-31' };
      const result = await handleGetPayments(null, period);

      expect(allQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE p.payment_date BETWEEN ? AND ?'),
        ['2024-01-01', '2024-01-31']
      );
      expect(result).toEqual(mockPayments);
    });
  });

  describe('handleGetStatementOfActivities', () => {
    it('should get statement of activities for given period', async () => {
      const mockData = {
        totalIncome: 5000,
        totalExpenses: 2000,
        netIncome: 3000,
        incomeBreakdown: { payments: 3000, donations: 2000 },
        expenseBreakdown: { salaries: 1500, expenses: 500 },
      };

      // Mock the individual queries
      getQuery
        .mockResolvedValueOnce({ total: 3000 }) // payments
        .mockResolvedValueOnce({ total: 2000 }) // donations
        .mockResolvedValueOnce({ total: 1500 }) // salaries
        .mockResolvedValueOnce({ total: 500 }); // expenses

      const period = { startDate: '2024-01-01', endDate: '2024-01-31' };
      const result = await handleGetStatementOfActivities(null, period);

      expect(getQuery).toHaveBeenCalledTimes(4);
      expect(result).toEqual({
        totalIncome: 5000,
        totalExpenses: 2000,
        netIncome: 3000,
        incomeBreakdown: { payments: 3000, donations: 2000 },
        expenseBreakdown: { salaries: 1500, expenses: 500 },
      });
    });
  });

  describe('handleGetMonthlySnapshot', () => {
    it('should get monthly financial snapshot', async () => {
      const mockData = {
        currentMonth: { income: 2000, expenses: 800 },
        previousMonth: { income: 1800, expenses: 900 },
        yearToDate: { income: 15000, expenses: 8000 },
      };

      // Mock multiple queries for different periods
      getQuery
        .mockResolvedValueOnce({ total: 2000 }) // current month income
        .mockResolvedValueOnce({ total: 800 })  // current month expenses
        .mockResolvedValueOnce({ total: 1800 }) // previous month income
        .mockResolvedValueOnce({ total: 900 })  // previous month expenses
        .mockResolvedValueOnce({ total: 15000 }) // YTD income
        .mockResolvedValueOnce({ total: 8000 }); // YTD expenses

      const result = await handleGetMonthlySnapshot(null, { year: 2024, month: 6 });

      expect(getQuery).toHaveBeenCalledTimes(6);
      expect(result).toEqual({
        currentMonth: { income: 2000, expenses: 800, balance: 1200 },
        previousMonth: { income: 1800, expenses: 900, balance: 900 },
        yearToDate: { income: 15000, expenses: 8000, balance: 7000 },
      });
    });
  });

  describe('handleGetFinancialSummary', () => {
    it('should get financial summary for specific year', async () => {
      getSetting.mockResolvedValue('2024-01-01'); // fiscal year start

      // Mock summary queries
      getQuery
        .mockResolvedValueOnce({ total: 25000 }) // total income
        .mockResolvedValueOnce({ total: 15000 }) // total expenses
        .mockResolvedValueOnce({ total: 20000 }) // payments
        .mockResolvedValueOnce({ total: 5000 })  // donations
        .mockResolvedValueOnce({ total: 12000 }) // salaries
        .mockResolvedValueOnce({ total: 3000 }); // expenses

      const result = await handleGetFinancialSummary(null, 2024);

      expect(getSetting).toHaveBeenCalledWith('fiscal_year_start');
      expect(getQuery).toHaveBeenCalledTimes(6);
      expect(result).toEqual({
        totalIncome: 25000,
        totalExpenses: 15000,
        balance: 10000,
        paymentsTotal: 20000,
        donationsTotal: 5000,
        salariesTotal: 12000,
        expensesTotal: 3000,
      });
    });

    it('should use current year when no year specified', async () => {
      const currentYear = new Date().getFullYear();
      getSetting.mockResolvedValue(`${currentYear}-01-01`);

      getQuery
        .mockResolvedValueOnce({ total: 10000 })
        .mockResolvedValueOnce({ total: 5000 })
        .mockResolvedValueOnce({ total: 8000 })
        .mockResolvedValueOnce({ total: 2000 })
        .mockResolvedValueOnce({ total: 4000 })
        .mockResolvedValueOnce({ total: 1000 });

      const result = await handleGetFinancialSummary();

      expect(result.balance).toBe(5000); // 10000 - 5000
    });
  });
});