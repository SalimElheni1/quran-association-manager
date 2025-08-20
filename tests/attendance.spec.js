const { registerAttendanceHandlers } = require('../src/main/attendanceHandlers');
const db = require('../src/db/db');
const { ipcMain } = require('electron');

// Mock the database module
jest.mock('../src/db/db', () => ({
  getQuery: jest.fn(),
  allQuery: jest.fn(),
  runQuery: jest.fn(),
}));

// Mock ipcMain to spy on handlers being registered
jest.mock('electron', () => ({
  ipcMain: {
    handle: jest.fn(),
  },
}));

// We need to get the handler function from the ipcMain mock.
// This is a bit tricky, but we can grab it from the mock's calls.
const getIpcHandler = (channel) => {
  const call = ipcMain.handle.mock.calls.find((c) => c[0] === channel);
  return call ? call[1] : null;
};

describe('Attendance Handlers', () => {
  let getSheetHandler, createSheetHandler, updateSheetHandler, listSheetsHandler;

  beforeAll(() => {
    // Register handlers to populate the ipcMain mock
    registerAttendanceHandlers();
    // Extract the handler functions from the mock
    getSheetHandler = getIpcHandler('attendance:getSheet');
    createSheetHandler = getIpcHandler('attendance:createSheet');
    updateSheetHandler = getIpcHandler('attendance:updateSheet');
    listSheetsHandler = getIpcHandler('attendance:listSheets');
  });

  afterEach(() => {
    // Clear all mock history after each test
    jest.clearAllMocks();
  });

  describe('getSheetHandler', () => {
    it('should return a sheet with entries if found', async () => {
      const mockSheet = { id: 1, seance_id: 10, date: '2025-08-20' };
      const mockEntries = [
        { student_id: 1, status: 'present', note: null },
        { student_id: 2, status: 'absent', note: null },
      ];
      db.getQuery.mockResolvedValue(mockSheet);
      db.allQuery.mockResolvedValue(mockEntries);

      const result = await getSheetHandler({}, { seanceId: 10, date: '2025-08-20' });

      expect(db.getQuery).toHaveBeenCalledWith(expect.any(String), [10, '2025-08-20']);
      expect(db.allQuery).toHaveBeenCalledWith(expect.any(String), [1]);
      expect(result).toEqual({
        ...mockSheet,
        entries: {
          1: { status: 'present', note: null },
          2: { status: 'absent', note: null },
        },
      });
    });

    it('should return null if no sheet is found', async () => {
      db.getQuery.mockResolvedValue(null);
      const result = await getSheetHandler({}, { seanceId: 10, date: '2025-08-20' });
      expect(db.getQuery).toHaveBeenCalledWith(expect.any(String), [10, '2025-08-20']);
      expect(db.allQuery).not.toHaveBeenCalled();
      expect(result).toBeNull();
    });

    it('should throw Joi validation error for invalid input', async () => {
      await expect(getSheetHandler({}, { seanceId: 'invalid' })).rejects.toThrow();
    });
  });

  describe('createSheetHandler', () => {
    it('should create a new sheet and its entries within a transaction', async () => {
      const args = {
        seanceId: 10,
        date: '2025-08-20',
        entries: { 1: 'present', 2: 'absent' },
        userId: 1,
      };
      db.runQuery.mockResolvedValue({ id: 5 }); // Mock return of new sheet ID

      const result = await createSheetHandler({}, args);

      expect(db.runQuery).toHaveBeenCalledWith('BEGIN TRANSACTION');
      // Check sheet creation
      expect(db.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO attendance_sheets'),
        [args.seanceId, args.date, args.userId],
      );
      // Check entries creation
      expect(db.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO attendance_entries'),
        [5, 1, 'present', 5, 2, 'absent'],
      );
      expect(db.runQuery).toHaveBeenCalledWith('COMMIT');
      expect(result).toEqual({ id: 5 });
    });

    it('should roll back transaction on error', async () => {
      const args = { seanceId: 10, date: '2025-08-20', entries: {} };
      const error = new Error('DB error');
      db.runQuery.mockImplementation((sql) => {
        if (sql.startsWith('INSERT')) {
          return Promise.reject(error);
        }
        return Promise.resolve();
      });

      await expect(createSheetHandler({}, args)).rejects.toThrow('DB error');

      expect(db.runQuery).toHaveBeenCalledWith('BEGIN TRANSACTION');
      expect(db.runQuery).toHaveBeenCalledWith('ROLLBACK');
      expect(db.runQuery).not.toHaveBeenCalledWith('COMMIT');
    });
  });

  describe('updateSheetHandler', () => {
    it('should update a sheet by deleting and re-inserting entries', async () => {
      const args = {
        sheetId: 5,
        entries: { 1: 'present', 3: 'late' },
      };
      db.runQuery.mockResolvedValue({});

      const result = await updateSheetHandler({}, args);

      expect(db.runQuery).toHaveBeenCalledWith('BEGIN TRANSACTION');
      // Check deletion of old entries
      expect(db.runQuery).toHaveBeenCalledWith('DELETE FROM attendance_entries WHERE sheet_id = ?', [5]);
      // Check insertion of new entries
      expect(db.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO attendance_entries'),
        [5, 1, 'present', 5, 3, 'late'],
      );
      // Check timestamp update
      expect(db.runQuery).toHaveBeenCalledWith(
        'UPDATE attendance_sheets SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [5]
      );
      expect(db.runQuery).toHaveBeenCalledWith('COMMIT');
      expect(result).toEqual({ success: true });
    });
  });

  describe('listSheetsHandler', () => {
    it('should return a list of saved sheets without filters', async () => {
      const mockSheets = [{ id: 1, seance_name: 'Class A' }];
      db.allQuery.mockResolvedValue(mockSheets);

      const result = await listSheetsHandler({}, {});
      expect(db.allQuery).toHaveBeenCalledWith(expect.stringContaining('FROM attendance_sheets'), []);
      expect(result).toEqual(mockSheets);
    });

    it('should apply filters when provided', async () => {
      const mockSheets = [];
      const filters = { seanceId: 1, startDate: '2025-01-01', endDate: '2025-01-31' };
      db.allQuery.mockResolvedValue(mockSheets);

      const result = await listSheetsHandler({}, filters);

      const expectedSql = expect.stringContaining('s.seance_id = ? AND s.date >= ? AND s.date <= ?');
      const expectedParams = [filters.seanceId, filters.startDate, filters.endDate];
      expect(db.allQuery).toHaveBeenCalledWith(expectedSql, expectedParams);
      expect(result).toEqual(mockSheets);
    });
  });
});
