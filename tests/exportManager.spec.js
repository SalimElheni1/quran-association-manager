// Mock dependencies
jest.mock('fs');
jest.mock('path');
jest.mock('os');
jest.mock('electron', () => ({
  BrowserWindow: jest.fn(),
  app: {
    getPath: jest.fn(() => '/mock/userData'),
  },
}));
jest.mock('exceljs');
jest.mock('docx');
jest.mock('../src/db/db');
jest.mock('../src/main/settingsManager');
jest.mock('../src/main/handlers/legacyFinancialHandlers');
jest.mock('../src/main/handlers/inventoryHandlers');

const ExcelJS = require('exceljs');
const {
  getExportHeaderData,
  fetchExportData,
  fetchFinancialData,
  localizeData,
  generateXlsx,
  generateFinancialXlsx,
} = require('../src/main/exportManager');
const { getSetting } = require('../src/main/settingsManager');
const { allQuery } = require('../src/db/db');
const {
  handleGetFinancialSummary,
  handleGetPayments,
  handleGetSalaries,
  handleGetDonations,
  handleGetExpenses,
} = require('../src/main/handlers/legacyFinancialHandlers');
const { handleGetInventoryItems } = require('../src/main/handlers/inventoryHandlers');

describe('exportManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getExportHeaderData', () => {
    it('should fetch and return header data from settings', async () => {
      getSetting
        .mockResolvedValueOnce('National Association')
        .mockResolvedValueOnce('Regional Association')
        .mockResolvedValueOnce('Local Branch')
        .mockResolvedValueOnce('/path/to/national/logo.png')
        .mockResolvedValueOnce('/path/to/regional/logo.png');

      const result = await getExportHeaderData();

      expect(getSetting).toHaveBeenCalledTimes(5);
      expect(getSetting).toHaveBeenCalledWith('national_association_name');
      expect(getSetting).toHaveBeenCalledWith('regional_association_name');
      expect(getSetting).toHaveBeenCalledWith('local_branch_name');
      expect(getSetting).toHaveBeenCalledWith('national_logo_path');
      expect(getSetting).toHaveBeenCalledWith('regional_local_logo_path');

      expect(result).toEqual({
        nationalAssociationName: 'National Association',
        regionalAssociationName: 'Regional Association',
        localBranchName: 'Local Branch',
        nationalLogoPath: '/path/to/national/logo.png',
        regionalLocalLogoPath: '/path/to/regional/logo.png',
      });
    });
  });

  describe('fetchFinancialData', () => {
    it('should fetch financial data with period', async () => {
      const mockPeriod = { startDate: '2024-01-01', endDate: '2024-12-31' };
      const mockSummary = { totalIncome: 1000, totalExpenses: 500 };
      const mockPayments = [{ id: 1, amount: 100 }];
      const mockSalaries = [{ id: 1, amount: 200 }];
      const mockDonations = [{ id: 1, amount: 300 }];
      const mockExpenses = [{ id: 1, amount: 50 }];
      const mockInventory = [{ id: 1, item: 'Book' }];

      handleGetFinancialSummary.mockResolvedValue(mockSummary);
      handleGetPayments.mockResolvedValue(mockPayments);
      handleGetSalaries.mockResolvedValue(mockSalaries);
      handleGetDonations.mockResolvedValue(mockDonations);
      handleGetExpenses.mockResolvedValue(mockExpenses);
      handleGetInventoryItems.mockResolvedValue(mockInventory);

      const result = await fetchFinancialData(mockPeriod);

      expect(handleGetFinancialSummary).toHaveBeenCalledWith(null, 2024);
      expect(handleGetPayments).toHaveBeenCalledWith(null, mockPeriod);
      expect(handleGetSalaries).toHaveBeenCalledWith(null, mockPeriod);
      expect(handleGetDonations).toHaveBeenCalledWith(null, mockPeriod);
      expect(handleGetExpenses).toHaveBeenCalledWith(null, mockPeriod);
      expect(handleGetInventoryItems).toHaveBeenCalled();

      expect(result).toEqual({
        summary: mockSummary,
        payments: mockPayments,
        salaries: mockSalaries,
        donations: mockDonations,
        expenses: mockExpenses,
        inventory: mockInventory,
      });
    });

    it('should fetch financial data without period', async () => {
      handleGetFinancialSummary.mockResolvedValue({});
      handleGetPayments.mockResolvedValue([]);
      handleGetSalaries.mockResolvedValue([]);
      handleGetDonations.mockResolvedValue([]);
      handleGetExpenses.mockResolvedValue([]);
      handleGetInventoryItems.mockResolvedValue([]);

      await fetchFinancialData();

      expect(handleGetFinancialSummary).toHaveBeenCalledWith(null, null);
    });
  });

  describe('fetchExportData', () => {
    it('should throw error when no fields provided', async () => {
      await expect(fetchExportData({ type: 'students', fields: [] })).rejects.toThrow(
        'No fields selected for export.',
      );
    });

    // PRAGMA table_info answers with these columns; the data query answers with `rows`.
    const mockTable = (columns, rows = []) =>
      allQuery.mockImplementation((sql) =>
        Promise.resolve(sql.startsWith('PRAGMA') ? columns.map((name) => ({ name })) : rows),
      );
    const dataQuery = () => allQuery.mock.calls.find(([sql]) => !sql.startsWith('PRAGMA'));

    it('exports students that are not deleted, only with columns that exist', async () => {
      mockTable(['name', 'gender'], [{ name: 'Ali', date_of_birth: Date.UTC(2015, 0, 2) }]);

      const result = await fetchExportData({
        type: 'students',
        fields: ['name', 'gender', 'sponsor_cin'],
      });

      expect(dataQuery()).toEqual([
        'SELECT name, gender FROM students s WHERE s.deleted_at IS NULL ORDER BY s.name',
        [],
      ]);
      // Timestamps are exported as dates.
      expect(result).toEqual([{ name: 'Ali', date_of_birth: '2015-01-02' }]);
    });

    it('exports the students of one group', async () => {
      mockTable(['name']);

      await fetchExportData({ type: 'students', fields: ['name'], options: { groupId: 3 } });

      expect(dataQuery()).toEqual([
        expect.stringContaining(
          'JOIN student_groups sg ON s.id = sg.student_id WHERE sg.group_id = ?',
        ),
        [3],
      ]);
    });

    it('refuses a student export when no selected column exists', async () => {
      mockTable(['name']);

      await expect(fetchExportData({ type: 'students', fields: ['sponsor_cin'] })).rejects.toThrow(
        'No valid student fields available for export after validating against DB columns.',
      );
    });

    it('exports teachers that are not deleted, filtered by gender', async () => {
      mockTable(['name', 'email']);

      await fetchExportData({
        type: 'teachers',
        fields: ['name', 'email'],
        options: { gender: 'men' },
      });

      expect(dataQuery()).toEqual([
        'SELECT name, email FROM teachers WHERE deleted_at IS NULL AND gender = ? AND gender IS NOT NULL ORDER BY name',
        ['Male'],
      ]);
    });

    it('exports users with their role name, leaving deleted users out', async () => {
      mockTable(['username']);

      await fetchExportData({ type: 'admins', fields: ['username', 'role'] });

      const [sql] = dataQuery();
      expect(sql).toMatch(/^SELECT username, r\.name as role\s+FROM users u/);
      expect(sql).toContain('JOIN roles r ON ur.role_id = r.id');
      expect(sql).toContain('u.deleted_at IS NULL');
    });

    it('should throw error for invalid export type', async () => {
      await expect(
        fetchExportData({
          type: 'invalid',
          fields: ['name'],
        }),
      ).rejects.toThrow('Invalid export type: invalid');
    });
  });

  describe('localizeData', () => {
    it('should localize gender values', () => {
      const data = [
        { name: 'John', gender: 'Male' },
        { name: 'Jane', gender: 'Female' },
      ];

      const result = localizeData(data);

      expect(result).toEqual([
        { name: 'John', gender: 'ذكر' },
        { name: 'Jane', gender: 'أنثى' },
      ]);
    });

    it('should localize status values', () => {
      const data = [
        { name: 'Student 1', status: 'active' },
        { name: 'Student 2', status: 'inactive' },
      ];

      const result = localizeData(data);

      expect(result).toEqual([
        { name: 'Student 1', status: 'نشط' },
        { name: 'Student 2', status: 'غير نشط' },
      ]);
    });

    it('should localize payment methods', () => {
      const data = [
        { amount: 100, payment_method: 'Cash' },
        { amount: 200, payment_method: 'Bank Transfer' },
      ];

      const result = localizeData(data);

      expect(result).toEqual([
        { amount: 100, payment_method: 'نقداً' },
        { amount: 200, payment_method: 'تحويل بنكي' },
      ]);
    });

    it('should not modify unmapped values', () => {
      const data = [{ name: 'Test', custom_field: 'unchanged' }];

      const result = localizeData(data);

      expect(result).toEqual([{ name: 'Test', custom_field: 'unchanged' }]);
    });
  });

  describe('generateXlsx', () => {
    let mockWorkbook, mockWorksheet;

    beforeEach(() => {
      mockWorksheet = {
        views: [],
        columns: [],
        addRows: jest.fn(),
        getRow: jest.fn(() => ({ font: {} })),
        insertRow: jest.fn(),
        mergeCells: jest.fn(),
        getCell: jest.fn(() => ({ alignment: {}, font: {} })),
      };

      mockWorkbook = {
        addWorksheet: jest.fn(() => mockWorksheet),
        xlsx: {
          writeFile: jest.fn(),
        },
      };

      ExcelJS.Workbook.mockImplementation(() => mockWorkbook);
    });

    it('should generate XLSX file with localized data', async () => {
      const columns = [
        { header: 'Name', key: 'name' },
        { header: 'Gender', key: 'gender' },
      ];
      const data = [
        { name: 'John', gender: 'Male' },
        { name: 'Jane', gender: 'Female' },
      ];
      const outputPath = '/mock/output.xlsx';

      await generateXlsx(columns, data, outputPath);

      expect(mockWorkbook.addWorksheet).toHaveBeenCalledWith('Exported Data');
      expect(mockWorksheet.views).toEqual([{ rightToLeft: true }]);
      expect(mockWorksheet.columns).toEqual(columns.map((col) => ({ ...col, width: 25 })));
      expect(mockWorksheet.addRows).toHaveBeenCalledWith([
        { name: 'John', gender: 'ذكر' },
        { name: 'Jane', gender: 'أنثى' },
      ]);
      expect(mockWorkbook.xlsx.writeFile).toHaveBeenCalledWith(outputPath);
    });
  });

  describe('generateFinancialXlsx', () => {
    let mockWorkbook, mockWorksheet;

    beforeEach(() => {
      mockWorksheet = {
        views: [],
        columns: [],
        addRow: jest.fn(),
        addRows: jest.fn(),
      };

      mockWorkbook = {
        addWorksheet: jest.fn(() => mockWorksheet),
        xlsx: {
          writeFile: jest.fn(),
        },
      };

      ExcelJS.Workbook.mockImplementation(() => mockWorkbook);
    });

    it('should generate financial XLSX with multiple sheets', async () => {
      const data = {
        summary: { totalIncome: 1000, totalExpenses: 500, balance: 500 },
        payments: [{ student_name: 'John', amount: 100 }],
        salaries: [{ teacher_name: 'Teacher', amount: 200 }],
        donations: [{ donor_name: 'Donor', donation_type: 'Cash', amount: 300 }],
        expenses: [{ category: 'Bills', amount: 50 }],
      };
      const outputPath = '/mock/financial.xlsx';

      await generateFinancialXlsx(data, outputPath);

      expect(mockWorkbook.addWorksheet).toHaveBeenCalledWith('الملخص');
      expect(mockWorkbook.addWorksheet).toHaveBeenCalledWith('الرسوم الدراسية');
      expect(mockWorkbook.addWorksheet).toHaveBeenCalledWith('الرواتب');
      expect(mockWorkbook.addWorksheet).toHaveBeenCalledWith('التبرعات');
      expect(mockWorkbook.addWorksheet).toHaveBeenCalledWith('المصاريف');
      expect(mockWorkbook.xlsx.writeFile).toHaveBeenCalledWith(outputPath);
    });
  });
});
