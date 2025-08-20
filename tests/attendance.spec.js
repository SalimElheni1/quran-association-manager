const {
  getAttendanceSheetsHandler,
  getAttendanceSheetHandler,
  createAttendanceSheetHandler,
  updateAttendanceSheetHandler,
} = require('../src/main/attendanceHandlers');
const db = require('../src/db/db');

// Mock the db module
jest.mock('../src/db/db');

describe('Attendance Handlers', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getAttendanceSheetsHandler', () => {
    it('should fetch a list of attendance sheets with correct filters', async () => {
      const mockFilters = { seanceId: 1, startDate: '2025-01-01', endDate: '2025-01-31' };
      const mockResult = [{ id: 1, date: '2025-01-15', seance_name: 'Hifz A' }];
      db.allQuery.mockResolvedValue(mockResult);

      const result = await getAttendanceSheetsHandler(mockFilters);

      expect(db.allQuery).toHaveBeenCalledTimes(1);
      const [sql, params] = db.allQuery.mock.calls[0];

      expect(sql).toContain('AND ash.seance_id = ?');
      expect(sql).toContain('AND ash.date >= ?');
      expect(sql).toContain('AND ash.date <= ?');
      expect(params).toEqual([1, '2025-01-01', '2025-01-31']);
      expect(result).toEqual(mockResult);
    });
  });

  describe('getAttendanceSheetHandler', () => {
    it('should return null if no sheet is found', async () => {
      db.getQuery.mockResolvedValue(null);
      const result = await getAttendanceSheetHandler({ seanceId: 99, date: '2025-01-01' });
      expect(result).toBeNull();
    });

    it('should fetch a single sheet and its entries correctly', async () => {
      const mockSheet = { id: 1, seance_id: 1, date: '2025-01-01', notes: 'Test' };
      const mockEntries = [{ sheet_id: 1, student_id: 101, status: 'present' }];
      const mockStudents = [{ id: 101, name: 'Student A' }];

      db.getQuery.mockResolvedValue(mockSheet);
      db.allQuery
        .mockResolvedValueOnce(mockEntries) // For entries
        .mockResolvedValueOnce(mockStudents); // For students

      const result = await getAttendanceSheetHandler({ seanceId: 1, date: '2025-01-01' });

      expect(db.getQuery).toHaveBeenCalledWith('SELECT * FROM attendance_sheets WHERE seance_id = ? AND date = ?', [1, '2025-01-01']);
      expect(db.allQuery).toHaveBeenCalledWith('SELECT * FROM attendance_entries WHERE sheet_id = ?', [1]);
      expect(db.allQuery).toHaveBeenCalledWith(expect.stringContaining('SELECT s.id, s.name'), [1]);

      expect(result.sheet).toEqual(mockSheet);
      expect(result.entries[101].status).toBe('present');
    });
  });

  describe('createAttendanceSheetHandler', () => {
    it('should create a new sheet and entries within a transaction', async () => {
      const sheetData = { seance_id: 1, date: '2025-01-01', notes: '' };
      const entriesData = { 101: { status: 'present', notes: '' } };

      let callCount = 0;
      db.runQuery.mockImplementation(() => {
        callCount++;
        switch (callCount) {
          case 1: // BEGIN TRANSACTION
            return Promise.resolve();
          case 2: // INSERT INTO attendance_sheets
            return Promise.resolve({ id: 1, changes: 1 });
          case 3: // INSERT INTO attendance_entries
            return Promise.resolve({ changes: 1 });
          case 4: // COMMIT
            return Promise.resolve();
          default:
            return Promise.reject(new Error('db.runQuery called too many times'));
        }
      });

      const result = await createAttendanceSheetHandler({ sheetData, entriesData });

      const calls = db.runQuery.mock.calls;
      expect(calls[0][0]).toBe('BEGIN TRANSACTION');
      expect(calls[1][0]).toContain('INSERT INTO attendance_sheets');
      expect(calls[2][0]).toContain('INSERT INTO attendance_entries');
      expect(calls[2][1]).toEqual([1, 101, 'present', '']); // Check params for entries insert
      expect(calls[3][0]).toBe('COMMIT');

      expect(result).toEqual({ success: true, sheetId: 1 });
    });

    it('should rollback on error', async () => {
      const sheetData = { seance_id: 1, date: '2025-01-01', notes: '' };
      const entriesData = { 101: { status: 'present', notes: '' } };

      db.runQuery.mockImplementation((sql) => {
        if (sql.includes('INSERT')) {
          return Promise.reject(new Error('Insert failed'));
        }
        return Promise.resolve();
      });

      await expect(createAttendanceSheetHandler({ sheetData, entriesData })).rejects.toThrow('Insert failed');

      const calls = db.runQuery.mock.calls;
      expect(calls.some(call => call[0] === 'BEGIN TRANSACTION')).toBe(true);
      expect(calls.some(call => call[0] === 'ROLLBACK')).toBe(true);
      expect(calls.some(call => call[0] === 'COMMIT')).toBe(false);
    });
  });

  describe('updateAttendanceSheetHandler', () => {
    it('should update a sheet and its entries', async () => {
        const sheetId = 1;
        const sheetData = { seance_id: 1, date: '2025-01-01', notes: 'Updated notes' };
        const entriesData = { 101: { status: 'absent', notes: 'Sick' } };

        db.runQuery.mockResolvedValue({ changes: 1 }); // Mock all runQuery calls

        const result = await updateAttendanceSheetHandler({ sheetId, sheetData, entriesData });

        expect(db.runQuery).toHaveBeenCalledWith('BEGIN TRANSACTION');
        expect(db.runQuery).toHaveBeenCalledWith(expect.stringContaining('UPDATE attendance_sheets'), ['Updated notes', sheetId]);
        expect(db.runQuery).toHaveBeenCalledWith('DELETE FROM attendance_entries WHERE sheet_id = ?', [sheetId]);
        expect(db.runQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO attendance_entries'), [sheetId, 101, 'absent', 'Sick']);
        expect(db.runQuery).toHaveBeenCalledWith('COMMIT');
        expect(result).toEqual({ success: true, sheetId: 1 });
    });
  });
});
