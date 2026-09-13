const { registerUserHandlers } = require('../src/main/handlers/userHandlers');
const { ipcMain } = require('electron');
const db = require('../src/db/db');

jest.mock('../src/db/db');

describe('users:updateGuide handler', () => {
  beforeAll(() => {
    registerUserHandlers();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("updates need_guide and current_step using the caller's own session id, ignoring a client-supplied id", async () => {
    db.runQuery.mockResolvedValue({ changes: 1 });

    // The mock ipcMain.invoke harness binds sender.id=1 to session userId=1.
    // Passing a different client-supplied id (5) must NOT be used (IDOR protection).
    const result = await ipcMain.invoke('users:updateGuide', {
      id: 5,
      guideData: { need_guide: 1, current_step: 3 },
    });

    expect(db.runQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE users SET'),
      [1, 3, 1],
    );
    expect(result).toEqual({ success: true });
  });

  it('ignores a numeric-string client-supplied id and still targets the session id', async () => {
    db.runQuery.mockResolvedValue({ changes: 1 });

    const result = await ipcMain.invoke('users:updateGuide', {
      id: '7',
      guideData: { need_guide: 0, current_step: 2 },
    });

    expect(db.runQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE users SET'),
      [0, 2, 1],
    );
    expect(result).toEqual({ success: true });
  });

  it('returns success when no guide fields passed', async () => {
    const result = await ipcMain.invoke('users:updateGuide', { id: 3, guideData: {} });
    expect(result).toEqual({ success: true, message: 'No guide fields to update.' });
  });

  it('returns failure when the caller has no valid session', async () => {
    db.runQuery.mockImplementation(() => {
      throw new Error('should not be called');
    });

    const handler = ipcMain.handlers.get('users:updateGuide');
    const noSessionEvent = { sender: { id: 9999 } }; // no session created for this sender id
    const result = await handler(noSessionEvent, { id: 1, guideData: { need_guide: 1 } });

    expect(result.success).toBe(false);
    expect(result.message).toMatch(/authentication required/i);
  });
});
