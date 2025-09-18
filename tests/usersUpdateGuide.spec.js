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

  it('updates need_guide and current_step for numeric id', async () => {
    db.runQuery.mockResolvedValue({ changes: 1 });

    const result = await ipcMain.invoke('users:updateGuide', {
      id: 5,
      guideData: { need_guide: 1, current_step: 3 },
    });

    expect(db.runQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE users SET'),
      [1, 3, 5],
    );
    expect(result).toEqual({ success: true });
  });

  it('updates when id is numeric string', async () => {
    db.runQuery.mockResolvedValue({ changes: 1 });

    const result = await ipcMain.invoke('users:updateGuide', {
      id: '7',
      guideData: { need_guide: 0, current_step: 2 },
    });

    expect(db.runQuery).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE users SET'),
      [0, 2, 7],
    );
    expect(result).toEqual({ success: true });
  });

  it('returns success when no guide fields passed', async () => {
    const result = await ipcMain.invoke('users:updateGuide', { id: 3, guideData: {} });
    expect(result).toEqual({ success: true, message: 'No guide fields to update.' });
  });

  it('returns failure for invalid id', async () => {
    db.runQuery.mockImplementation(() => {
      throw new Error('should not be called');
    });

    const result = await ipcMain.invoke('users:updateGuide', {
      id: null,
      guideData: { need_guide: 1 },
    });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/valid user ID/i);
  });
});
