// tests/financialHandlers.spec.js

// Mock dependencies at the top level
jest.mock('../src/main/logger');
jest.mock('../src/db/db');
jest.mock('../src/main/settingsManager');

describe('financialHandlers', () => {
  let financialHandlers;
  let db;

  beforeEach(() => {
    jest.clearAllMocks();
    // Require fresh modules for each test to ensure isolation
    financialHandlers = require('../src/main/handlers/legacyFinancialHandlers');
    db = require('../src/db/db');
  });

  describe('handleAddExpense', () => {
    it('should add new expense and return the new record', async () => {
      const expenseData = { category: 'Office Supplies', amount: 75.5 };
      const newRecord = { id: 1, ...expenseData };
      db.runQuery.mockResolvedValue({ id: 1 });
      db.getQuery.mockResolvedValue(newRecord);

      const result = await financialHandlers.handleAddExpense(null, expenseData);

      expect(db.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO expenses'),
        expect.any(Array),
      );
      expect(db.getQuery).toHaveBeenCalledWith('SELECT * FROM expenses WHERE id = ?', [1]);
      expect(result).toEqual(newRecord);
    });
  });

  describe('handleAddDonation', () => {
    it('should add cash donation successfully', async () => {
      const donationData = {
        donor_name: 'Ahmed Ali',
        donation_type: 'Cash',
        amount: 1000,
      };
      const newRecord = { id: 1, ...donationData };
      db.runQuery.mockResolvedValue({ id: 1 });
      db.getQuery.mockResolvedValue(newRecord);

      const result = await financialHandlers.handleAddDonation(null, donationData);

      // The source code sends all 8 fields, with undefined for missing ones
      expect(db.runQuery).toHaveBeenCalledWith(expect.any(String), [
        'Ahmed Ali',
        1000,
        undefined,
        undefined,
        'Cash',
        undefined,
        undefined,
        undefined,
      ]);
      expect(result).toEqual(newRecord);
    });

    it('should add in-kind donation successfully', async () => {
      const donationData = {
        donor_name: 'Fatima Hassan',
        donation_type: 'In-kind',
        description: '50 Quran copies',
      };
      const newRecord = { id: 2, ...donationData };
      db.runQuery.mockResolvedValue({ id: 2 });
      db.getQuery.mockResolvedValue(newRecord);

      const result = await financialHandlers.handleAddDonation(null, donationData);

      expect(db.runQuery).toHaveBeenCalledWith(expect.any(String), [
        'Fatima Hassan',
        undefined,
        undefined,
        undefined,
        'In-kind',
        '50 Quran copies',
        undefined,
        undefined,
      ]);
      expect(result).toEqual(newRecord);
    });
  });

  describe('handleGetStatementOfActivities', () => {
    it('should get statement of activities for given period', async () => {
      db.getQuery
        .mockResolvedValueOnce({ total: 3000 }) // fees
        .mockResolvedValueOnce({ total: 2000 }) // donations
        .mockResolvedValueOnce({ total: 1500 }); // salaries
      db.allQuery
        .mockResolvedValueOnce([{ category: 'Bills', total: 500 }]) // expenses by category
        .mockResolvedValueOnce([]); // recent transactions

      const period = { startDate: '2024-01-01', endDate: '2024-01-31' };
      const result = await financialHandlers.handleGetStatementOfActivities(null, period);

      expect(db.getQuery).toHaveBeenCalledTimes(3);
      expect(db.allQuery).toHaveBeenCalledTimes(2);
      expect(result).toEqual({
        studentFees: 3000,
        cashDonations: 2000,
        salaries: 1500,
        expensesByCategory: [{ category: 'Bills', total: 500 }],
        recentTransactions: [],
      });
    });
  });

  describe('handleGetFinancialSummary', () => {
    it('should use current year when no year specified', async () => {
      // Mock for income query
      db.allQuery.mockResolvedValueOnce([
        { source: 'Payments', total: 8000 },
        { source: 'Donations', total: 2000 },
      ]);
      // Mock for expenses query
      db.allQuery.mockResolvedValueOnce([{ source: 'Expenses', total: 3000 }]);
      // Mock for salaries query
      db.allQuery.mockResolvedValueOnce([{ source: 'Salaries', total: 4000 }]);

      const result = await financialHandlers.handleGetFinancialSummary(null, null);

      const totalIncome = 8000 + 2000;
      const totalExpenses = 3000 + 4000;
      expect(result.totalIncome).toBe(totalIncome);
      expect(result.totalExpenses).toBe(totalExpenses);
      expect(result.balance).toBe(totalIncome - totalExpenses);
    });
  });

  describe.skip('handleAddInventoryItem', () => {
    it('should handle non-numeric quantity and unit_value gracefully', async () => {
      const itemData = {
        item_name: 'New Item',
        quantity: 'invalid-number', // Malformed input
        unit_value: '10',
      };
      const newRecord = { id: 1, ...itemData, total_value: 0 }; // Expect total_value to be 0
      db.runQuery.mockResolvedValue({ id: 1 });
      db.getQuery.mockResolvedValue(newRecord);

      // We need to mock generateMatricule since it's called by the handler
      const matriculeService = require('../src/main/services/matriculeService');
      jest.spyOn(matriculeService, 'generateMatricule').mockResolvedValue('INV-001');

      await financialHandlers.handleAddInventoryItem(null, itemData);

      // Get the arguments passed to runQuery
      const callArgs = db.runQuery.mock.calls[0];
      const query = callArgs[0];
      const params = callArgs[1];

      // The important check: the `total_value` parameter should be 0, not NaN
      const totalValueIndex = 5; // Based on the INSERT query structure
      const totalValue = params[totalValueIndex];

      expect(query).toContain('INSERT INTO inventory_items');
      expect(totalValue).not.toBeNaN();
      expect(totalValue).toBe(0);
    });
  });

  // ============================================
  // NOTE: Sponsor payment tracking is handled in studentFeeHandlers.js
  // which records student payments with sponsor_name and sponsor_phone.
  // See tests/studentFeeHandlers.spec.js for sponsor payment tests.
  // These legacy financial handlers don't include sponsor tracking.
  // ============================================
});
