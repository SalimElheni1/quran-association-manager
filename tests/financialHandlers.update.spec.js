// tests/financialHandlers.update.spec.js

jest.mock('electron', () => ({
  ipcMain: { handle: jest.fn() },
  BrowserWindow: {
    getAllWindows: jest.fn(() => []),
  },
}));
jest.mock('../src/main/logger');
jest.mock('../src/db/db');

const db = require('../src/db/db');

describe('handleUpdateTransaction - balance sign on type change', () => {
  let handleUpdateTransaction;

  beforeEach(() => {
    jest.clearAllMocks();
    const financialHandlers = require('../src/main/handlers/financialHandlers');
    handleUpdateTransaction = financialHandlers.handleUpdateTransaction;
  });

  it('should persist the new type and re-apply the balance using the validated type', async () => {
    // Old transaction: EXPENSE 100 on account 1 -> edited to INCOME 100
    db.getQuery
      .mockResolvedValueOnce({ id: 1, account_id: 1, type: 'EXPENSE', amount: 100 })
      .mockResolvedValueOnce({ id: 1, account_id: 1, type: 'INCOME', amount: 100 });

    await handleUpdateTransaction(null, 1, {
      type: 'INCOME',
      category: 'رسوم الطلاب',
      amount: 100,
      transaction_date: '2026-01-15',
      description: 'edit',
      payment_method: 'TRANSFER',
      voucher_number: 'V-1',
      account_id: 1,
      receipt_type: null,
    });

    // The UPDATE transactions statement must now set the type column.
    const updateSql = db.runQuery.mock.calls[2][0];
    const updateParams = db.runQuery.mock.calls[2][1];
    expect(updateSql).toContain('type = ?');
    expect(updateParams[0]).toBe('INCOME');

    // Balance math with the fix (adjustment = amount for INCOME, -amount for EXPENSE):
    //   reverse EXPENSE 100 -> +100 ; re-apply INCOME 100 -> +100
    // (a bug re-applying with the old EXPENSE type would produce -100)
    const reverseCall = db.runQuery.mock.calls[1];
    const applyCall = db.runQuery.mock.calls[3];
    expect(reverseCall[0]).toContain('UPDATE accounts SET current_balance');
    expect(applyCall[0]).toContain('UPDATE accounts SET current_balance');
    expect(reverseCall[1]).toEqual([100, 1]);
    expect(applyCall[1]).toEqual([100, 1]);
  });
});
