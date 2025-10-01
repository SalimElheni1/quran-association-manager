const fs = require('fs');
const path = require('path');
const os = require('os');

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
jest.mock('../src/main/financialHandlers');

const { BrowserWindow } = require('electron');
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
  handleGetInventoryItems,
} = require('../src/main/financialHandlers');

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

      handleGetFinancialSummary.mockResolvedValue(mockSummary);
      handleGetPayments.mockResolvedValue([]);
      handleGetSalaries.mockResolvedValue([]);
      handleGetDonations.mockResolvedValue([]);
      handleGetExpenses.mockResolvedValue([]);
      handleGetInventoryItems.mockResolvedValue([]);

      const result = await fetchFinancialData(mockPeriod);

      expect(handleGetFinancialSummary).toHaveBeenCalledWith(null, 2024);
      expect(result.summary).toEqual(mockSummary);
    });
  });

  describe('fetchExportData', () => {
    it('should throw error when no fields provided', async () => {
      await expect(fetchExportData({ type: 'students', fields: [] })).rejects.toThrow(
        'No fields selected for export.'
      );
    });

    it('should fetch students data with gender filter', async () => {
        const mockData = [{ id: 1, name: 'Student 1', gender: 'Male', date_of_birth: '1990-01-01' }];
        allQuery.mockResolvedValue(mockData);
        getSetting.mockResolvedValue(18);

        await fetchExportData({
          type: 'students',
          fields: ['name', 'gender'],
          options: { gender: 'men' }
        });

        expect(allQuery).toHaveBeenCalledWith(
          'SELECT name, gender, date_of_birth FROM students WHERE 1=1 ORDER BY name',
          []
        );
      });

    it('should fetch teachers data', async () => {
      const mockData = [{ id: 1, name: 'Teacher 1' }];
      allQuery.mockResolvedValue(mockData);

      await fetchExportData({
        type: 'teachers',
        fields: ['name', 'email']
      });

      expect(allQuery).toHaveBeenCalledWith(
        'SELECT name, email FROM teachers ORDER BY name',
        []
      );
    });

    it('should fetch admins data', async () => {
        const mockData = [{ id: 1, username: 'admin1', roles: 'Administrator' }];
        allQuery.mockResolvedValue(mockData);

        const result = await fetchExportData({
          type: 'admins',
          fields: ['username', 'role']
        });

        expect(allQuery).toHaveBeenCalledWith(
          expect.stringContaining("r.name IN ('Administrator', 'Superadmin')"),
          []
        );
        expect(result[0]).toHaveProperty('role', 'Administrator');
      });

    it('should throw error for invalid export type', async () => {
      await expect(fetchExportData({
        type: 'invalid',
        fields: ['name']
      })).rejects.toThrow('Invalid export type: invalid');
    });
  });

  describe('localizeData', () => {
    it('should localize gender and status values', () => {
      const data = [{ gender: 'Male', status: 'active' }];
      const result = localizeData(data);
      expect(result).toEqual([{ gender: 'ذكر', status: 'نشط' }]);
    });
  });

  describe('generateXlsx', () => {
    it('should generate XLSX file with localized data', async () => {
        const mockWorksheet = {
            views: [],
            columns: [],
            addRows: jest.fn(),
            getRow: jest.fn(() => ({ font: {} })),
            insertRow: jest.fn(),
            mergeCells: jest.fn(),
            getCell: jest.fn(() => ({ alignment: {}, font: {} })),
        };
        const mockWorkbook = {
            addWorksheet: jest.fn(() => mockWorksheet),
            xlsx: {
              writeFile: jest.fn(),
            },
        };
        ExcelJS.Workbook.mockImplementation(() => mockWorkbook);

      const columns = [{ header: 'Gender', key: 'gender' }];
      const data = [{ gender: 'Male' }];
      await generateXlsx(columns, data, '/mock/output.xlsx');

      expect(mockWorksheet.addRows).toHaveBeenCalledWith([{ gender: 'ذكر' }]);
      expect(mockWorkbook.xlsx.writeFile).toHaveBeenCalledWith('/mock/output.xlsx');
    });
  });

  describe('generateFinancialXlsx', () => {
    it('should generate financial XLSX with multiple sheets', async () => {
        const mockWorksheet = {
            views: [],
            columns: [],
            addRow: jest.fn(),
            addRows: jest.fn(),
          };
          const mockWorkbook = {
            addWorksheet: jest.fn(() => mockWorksheet),
            xlsx: {
              writeFile: jest.fn(),
            },
          };
          ExcelJS.Workbook.mockImplementation(() => mockWorkbook);

      const data = {
        summary: { totalIncome: 1000, totalExpenses: 500, balance: 500 },
        payments: [], salaries: [], donations: [], expenses: [],
      };
      await generateFinancialXlsx(data, '/mock/financial.xlsx');

      expect(mockWorkbook.addWorksheet).toHaveBeenCalledTimes(5);
      expect(mockWorkbook.xlsx.writeFile).toHaveBeenCalledWith('/mock/financial.xlsx');
    });
  });
});