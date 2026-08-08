// tests/financialHandlers.reconcile.spec.js

jest.mock('../src/main/logger');
jest.mock('../src/db/db');
jest.mock('electron', () => ({
  ipcMain: { handle: jest.fn() },
  BrowserWindow: { getAllWindows: jest.fn(() => []) },
}));

describe('financialHandlers - recomputeAccountBalances', () => {
  let recomputeAccountBalances;
  let db;

  beforeEach(() => {
    jest.clearAllMocks();
    ({ recomputeAccountBalances } = require('../src/main/handlers/financialHandlers'));
    db = require('../src/db/db');
  });

  it('should recompute balances from initial_balance and transactions', async () => {
    db.allQuery
      .mockResolvedValueOnce([
        { id: 1, name: 'الخزينة', initial_balance: 100, current_balance: 999 },
        { id: 2, name: 'البنك', initial_balance: 0, current_balance: 50 },
      ])
      .mockResolvedValueOnce([
        { account_id: 1, type: 'INCOME', amount: 200 },
        { account_id: 1, type: 'EXPENSE', amount: 50 },
        { account_id: 2, type: 'INCOME', amount: 25 },
      ]);

    const result = await recomputeAccountBalances();

    expect(db.runQuery).toHaveBeenCalledWith(
      'UPDATE accounts SET current_balance = ? WHERE id = ?',
      [250, 1],
    );
    expect(db.runQuery).toHaveBeenCalledWith(
      'UPDATE accounts SET current_balance = ? WHERE id = ?',
      [25, 2],
    );
    expect(result).toEqual({
      reconciled: true,
      accounts: [
        { id: 1, name: 'الخزينة', previous_balance: 999, new_balance: 250 },
        { id: 2, name: 'البنك', previous_balance: 50, new_balance: 25 },
      ],
    });
  });

  it('should be idempotent (overwrite, never sum stored balances)', async () => {
    db.allQuery
      .mockResolvedValueOnce([{ id: 1, name: 'الخزينة', initial_balance: 0, current_balance: 0 }])
      .mockResolvedValueOnce([
        { account_id: 1, type: 'INCOME', amount: 100 },
        { account_id: 1, type: 'EXPENSE', amount: 30 },
      ]);

    await recomputeAccountBalances();
    expect(db.runQuery).toHaveBeenCalledWith(
      'UPDATE accounts SET current_balance = ? WHERE id = ?',
      [70, 1],
    );

    db.runQuery.mockClear();
    db.allQuery
      .mockResolvedValueOnce([{ id: 1, name: 'الخزينة', initial_balance: 0, current_balance: 70 }])
      .mockResolvedValueOnce([
        { account_id: 1, type: 'INCOME', amount: 100 },
        { account_id: 1, type: 'EXPENSE', amount: 30 },
      ]);

    await recomputeAccountBalances();
    expect(db.runQuery).toHaveBeenCalledWith(
      'UPDATE accounts SET current_balance = ? WHERE id = ?',
      [70, 1],
    );
  });
});
