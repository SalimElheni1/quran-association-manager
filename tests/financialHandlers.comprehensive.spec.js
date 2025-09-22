// tests/financialHandlers.comprehensive.spec.js

// Mock dependencies first
jest.mock('../src/main/logger');
jest.mock('../src/db/db');
jest.mock('../src/main/matriculeService');
jest.mock('electron');


describe('financialHandlers - Comprehensive Tests', () => {
    let financialHandlers;
    let db;
    let ipcMain;

    beforeEach(() => {
        jest.clearAllMocks();
        financialHandlers = require('../src/main/financialHandlers');
        db = require('../src/db/db');
        ipcMain = require('electron').ipcMain;
    });

  describe('registerFinancialHandlers', () => {
    it('should register all IPC handlers', () => {
      financialHandlers.registerFinancialHandlers();
      expect(ipcMain.handle).toHaveBeenCalled();
      const registeredChannels = ipcMain.handle.mock.calls.map(call => call[0]);
      expect(registeredChannels).toContain('get-expenses');
    });
  });

  describe('Financial Reporting - Advanced Cases', () => {
    describe('handleGetStatementOfActivities', () => {
        it('should handle null values in database results', async () => {
            db.getQuery.mockResolvedValue(null);
            db.allQuery.mockResolvedValue([]);

            const result = await financialHandlers.handleGetStatementOfActivities(null, {
              startDate: '2024-01-01',
              endDate: '2024-01-31'
            });

            expect(result).toEqual({
              studentFees: 0,
              cashDonations: 0,
              salaries: 0,
              expensesByCategory: [],
              recentTransactions: [],
            });
        });

        it('should include complex recent transactions query', async () => {
            db.getQuery.mockResolvedValue({ total: 0 });
            db.allQuery.mockResolvedValue([]);

            await financialHandlers.handleGetStatementOfActivities();

            // The second call to allQuery is the one for recent transactions
            const recentTransactionsCall = db.allQuery.mock.calls[1];
            expect(recentTransactionsCall[0]).toContain('UNION ALL');
          });
    });

    describe('handleGetFinancialSummary', () => {
        it('should use current year when no year specified', async () => {
            db.allQuery.mockResolvedValue([]);
            await financialHandlers.handleGetFinancialSummary();
            expect(db.allQuery).toHaveBeenCalled();
          });
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors in expense operations', async () => {
      const dbError = new Error('Database connection failed');
      db.runQuery.mockRejectedValue(dbError);

      await expect(financialHandlers.handleAddExpense(null, {}))
        .rejects.toThrow('Database connection failed');
    });
  });
});
