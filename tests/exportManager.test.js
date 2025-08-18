const fs = require('fs');
const path = require('path');
const os = require('os');
const { fetchExportData, generatePdf, generateXlsx } = require('../src/main/exportManager');
const db = require('../src/db/db');

// Mock the database module
jest.mock('../src/db/db', () => ({
  allQuery: jest.fn(),
}));

describe('exportManager', () => {
  let tmpDir;

  // Create a temporary directory for test outputs
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'export-tests-'));
  });

  // Clean up the temporary directory
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    jest.clearAllMocks();
  });

  describe('fetchExportData', () => {
    it('should call the correct query for students', async () => {
      const mockData = [{ id: 1, name: 'Ahmed', email: 'ahmed@test.com' }];
      db.allQuery.mockResolvedValue(mockData);

      const fields = ['id', 'name', 'email'];
      const result = await fetchExportData({ type: 'students', fields });

      expect(db.allQuery).toHaveBeenCalledWith(
        'SELECT id, name, email FROM students ORDER BY name',
      );
      expect(result).toEqual(mockData);
    });

    it('should call the correct query for teachers', async () => {
      db.allQuery.mockResolvedValue([]);
      const fields = ['id', 'name'];
      await fetchExportData({ type: 'teachers', fields });
      expect(db.allQuery).toHaveBeenCalledWith('SELECT id, name FROM teachers ORDER BY name');
    });

    it('should call the correct query for admins', async () => {
      db.allQuery.mockResolvedValue([]);
      const fields = ['id', 'username', 'role'];
      await fetchExportData({ type: 'admins', fields });
      expect(db.allQuery).toHaveBeenCalledWith(
        "SELECT id, username, role FROM users WHERE role = 'Branch Admin' OR role = 'Superadmin' ORDER BY username",
      );
    });

    it('should throw an error for an invalid export type', async () => {
      await expect(fetchExportData({ type: 'invalid', fields: ['id'] })).rejects.toThrow(
        'Invalid export type: invalid',
      );
    });

    it('should throw an error if no fields are provided', async () => {
      await expect(fetchExportData({ type: 'students', fields: [] })).rejects.toThrow(
        'No fields selected for export.',
      );
    });
  });

  describe('generatePdf', () => {
    it('should create a PDF file without errors', async () => {
      const outputPath = path.join(tmpDir, 'test.pdf');
      const headers = ['ID', 'Name'];
      const data = [{ id: 1, name: 'Test User' }];
      const dataKeys = ['id', 'name'];

      await generatePdf('Test Report', headers, data, dataKeys, outputPath);

      // Check if the file was created
      expect(fs.existsSync(outputPath)).toBe(true);
      // Check if the file is not empty
      const stats = fs.statSync(outputPath);
      expect(stats.size).toBeGreaterThan(0);
    });
  });

  describe('generateXlsx', () => {
    it('should create an XLSX file without errors', async () => {
      const outputPath = path.join(tmpDir, 'test.xlsx');
      const headers = ['ID', 'Name'];
      const data = [{ id: 1, name: 'Test User' }];
      const dataKeys = ['id', 'name'];

      await generateXlsx(headers, data, dataKeys, outputPath);

      // Check if the file was created
      expect(fs.existsSync(outputPath)).toBe(true);
      // Check if the file is not empty
      const stats = fs.statSync(outputPath);
      expect(stats.size).toBeGreaterThan(0);
    });
  });
});
