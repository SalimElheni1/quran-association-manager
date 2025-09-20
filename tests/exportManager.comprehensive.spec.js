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
jest.mock('../src/main/settingsManager');
jest.mock('../src/main/financialHandlers');
jest.mock('../src/db/db');

const { BrowserWindow } = require('electron');
const ExcelJS = require('exceljs');
const docx = require('docx');
const {
  getExportHeaderData,
  fetchExportData,
  fetchFinancialData,
  generatePdf,
  generateXlsx,
  generateFinancialXlsx,
  generateDocx,
  generateExcelTemplate,
  generateDevExcelTemplate,
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

describe('exportManager - Comprehensive Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generatePdf', () => {
    let mockWindow;

    beforeEach(() => {
      mockWindow = {
        loadFile: jest.fn().mockResolvedValue(),
        webContents: {
          printToPDF: jest.fn().mockResolvedValue(Buffer.from('pdf content')),
        },
        close: jest.fn(),
      };
      BrowserWindow.mockImplementation(() => mockWindow);
      fs.readFileSync = jest.fn().mockReturnValue('<html>{report_title}</html>');
      fs.writeFileSync = jest.fn();
      fs.existsSync = jest.fn().mockReturnValue(true);
      fs.unlinkSync = jest.fn();
      os.tmpdir = jest.fn().mockReturnValue('/tmp');
      path.join = jest.fn().mockReturnValue('/tmp/report-123.html');
    });

    it('should generate PDF with Arabic title and localized data', async () => {
      const title = 'students report';
      const columns = [
        { header: 'Name', key: 'name' },
        { header: 'Gender', key: 'gender' }
      ];
      const data = [
        { name: 'أحمد', gender: 'Male' },
        { name: 'فاطمة', gender: 'Female' }
      ];
      const outputPath = '/output/report.pdf';
      const headerData = {
        nationalAssociationName: 'الرابطة الوطنية',
        localBranchName: 'الفرع المحلي',
        nationalLogoPath: '/logos/national.png',
        regionalLocalLogoPath: '/logos/local.png'
      };

      await generatePdf(title, columns, data, outputPath, headerData);

      expect(BrowserWindow).toHaveBeenCalledWith({
        show: false,
        webPreferences: { nodeIntegration: false, contextIsolation: true },
      });
      expect(mockWindow.loadFile).toHaveBeenCalled();
      expect(mockWindow.webContents.printToPDF).toHaveBeenCalledWith({
        printBackground: true,
        pageSize: 'A4',
        landscape: false,
      });
      expect(fs.writeFileSync).toHaveBeenCalledWith(outputPath, Buffer.from('pdf content'));
      expect(mockWindow.close).toHaveBeenCalled();
    });

    it('should use landscape orientation for wide tables', async () => {
      const columns = Array(6).fill().map((_, i) => ({ header: `Col${i}`, key: `col${i}` }));
      const data = [{ col0: 'test' }];

      await generatePdf('test', columns, data, '/output.pdf', {});

      expect(mockWindow.webContents.printToPDF).toHaveBeenCalledWith({
        printBackground: true,
        pageSize: 'A4',
        landscape: true,
      });
    });

    it('should handle missing logo files gracefully', async () => {
      fs.existsSync = jest.fn().mockReturnValue(false);
      
      const headerData = {
        nationalLogoPath: '/missing/logo.png',
        regionalLocalLogoPath: '/missing/local.png'
      };

      await generatePdf('test', [], [], '/output.pdf', headerData);

      expect(fs.readFileSync).toHaveBeenCalledWith(
        expect.stringContaining('report_template.html'),
        'utf8'
      );
    });

    it('should clean up temporary files', async () => {
      const tempPath = '/tmp/report-123.html';
      path.join.mockReturnValue(tempPath);

      await generatePdf('test', [], [], '/output.pdf', {});

      expect(fs.unlinkSync).toHaveBeenCalledWith(tempPath);
    });

    it('should handle window errors and still clean up', async () => {
      const tempPath = '/tmp/report-123.html';
      path.join.mockReturnValue(tempPath);
      mockWindow.loadFile.mockRejectedValue(new Error('Load failed'));

      await expect(generatePdf('test', [], [], '/output.pdf', {})).rejects.toThrow();
      expect(mockWindow.close).toHaveBeenCalled();
      expect(fs.unlinkSync).toHaveBeenCalledWith(tempPath);
    });
  });

  describe('generateDocx', () => {
    let mockDocument, mockPacker;

    beforeEach(() => {
      mockPacker = {
        toBuffer: jest.fn().mockResolvedValue(Buffer.from('docx content')),
      };
      mockDocument = jest.fn();
      
      docx.Document = mockDocument;
      docx.Packer = mockPacker;
      docx.Paragraph = jest.fn();
      docx.TextRun = jest.fn();
      docx.Table = jest.fn();
      docx.TableCell = jest.fn();
      docx.TableRow = jest.fn();
      docx.ImageRun = jest.fn();
      docx.Header = jest.fn();
      
      fs.writeFileSync = jest.fn();
      fs.existsSync = jest.fn().mockReturnValue(true);
      fs.readFileSync = jest.fn().mockReturnValue(Buffer.from('image data'));
    });

    it('should generate DOCX with RTL support and Arabic content', async () => {
      const title = 'students report';
      const columns = [
        { header: 'الاسم', key: 'name' },
        { header: 'الجنس', key: 'gender' }
      ];
      const data = [
        { name: 'أحمد', gender: 'Male' },
        { name: 'فاطمة', gender: 'Female' }
      ];
      const outputPath = '/output/report.docx';
      const headerData = {
        nationalAssociationName: 'الرابطة الوطنية',
        localBranchName: 'الفرع المحلي',
        nationalLogoPath: '/logos/national.png',
        regionalLocalLogoPath: '/logos/local.png'
      };

      await generateDocx(title, columns, data, outputPath, headerData);

      expect(mockDocument).toHaveBeenCalled();
      expect(mockPacker.toBuffer).toHaveBeenCalled();
      expect(fs.writeFileSync).toHaveBeenCalledWith(outputPath, Buffer.from('docx content'));
    });

    it('should handle landscape orientation for wide tables', async () => {
      const columns = Array(7).fill().map((_, i) => ({ header: `Col${i}`, key: `col${i}` }));
      const data = [{}];

      await generateDocx('test', columns, data, '/output.docx', {});

      expect(mockDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          sections: expect.arrayContaining([
            expect.objectContaining({
              properties: expect.objectContaining({
                page: expect.objectContaining({
                  orientation: docx.PageOrientation.LANDSCAPE
                })
              })
            })
          ])
        })
      );
    });

    it('should handle missing logo files', async () => {
      fs.existsSync = jest.fn().mockReturnValue(false);
      
      const headerData = {
        nationalLogoPath: '/missing/logo.png',
        regionalLocalLogoPath: '/missing/local.png'
      };

      await generateDocx('test', [], [], '/output.docx', headerData);

      expect(docx.ImageRun).not.toHaveBeenCalled();
    });

    it('should handle packer errors', async () => {
      mockPacker.toBuffer.mockRejectedValue(new Error('Packer failed'));

      await expect(generateDocx('test', [], [], '/output.docx', {})).rejects.toThrow('Packer failed');
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('should handle empty buffer from packer', async () => {
      mockPacker.toBuffer.mockResolvedValue(Buffer.alloc(0));

      await expect(generateDocx('test', [], [], '/output.docx', {})).rejects.toThrow('Packer produced empty buffer');
    });
  });

  describe('generateExcelTemplate', () => {
    let mockWorkbook, mockWorksheet;

    beforeEach(() => {
      mockWorksheet = {
        views: [],
        columns: [],
        addRow: jest.fn(),
        addRows: jest.fn(),
        getRow: jest.fn(() => ({ font: {}, height: 0, getCell: jest.fn(() => ({ alignment: {}, font: {} })) })),
        spliceRows: jest.fn(),
        mergeCells: jest.fn(),
        getCell: jest.fn(() => ({ dataValidation: {}, note: '' })),
      };

      mockWorkbook = {
        addWorksheet: jest.fn(() => mockWorksheet),
        getWorksheet: jest.fn(() => mockWorksheet),
        xlsx: {
          writeFile: jest.fn(),
        },
      };

      ExcelJS.Workbook.mockImplementation(() => mockWorkbook);
    });

    it('should generate template with all required sheets', async () => {
      const outputPath = '/output/template.xlsx';

      await generateExcelTemplate(outputPath);

      const expectedSheets = [
        'الطلاب', 'المعلمون', 'المستخدمون', 'الفصول',
        'الرسوم الدراسية', 'الرواتب', 'التبرعات', 'المصاريف',
        'الحضور', 'المجموعات', 'المخزون'
      ];

      expectedSheets.forEach(sheetName => {
        expect(mockWorkbook.addWorksheet).toHaveBeenCalledWith(sheetName);
      });
      expect(mockWorkbook.xlsx.writeFile).toHaveBeenCalledWith(outputPath);
    });

    it('should add data validation for dropdown lists', async () => {
      await generateExcelTemplate('/output/template.xlsx');

      expect(mockWorksheet.getCell).toHaveBeenCalled();
    });

    it('should return sheet definitions when returnDefsOnly is true', async () => {
      const result = await generateExcelTemplate(null, true);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result[0]).toHaveProperty('name');
      expect(result[0]).toHaveProperty('columns');
    });

    it('should add warning message to each sheet', async () => {
      await generateExcelTemplate('/output/template.xlsx');

      expect(mockWorksheet.spliceRows).toHaveBeenCalledWith(
        1, 0, 
        [expect.stringContaining('⚠️')]
      );
    });

    it('should add notes to matricule columns', async () => {
      await generateExcelTemplate('/output/template.xlsx');

      expect(mockWorksheet.getCell).toHaveBeenCalledWith('A2');
    });
  });

  describe('generateDevExcelTemplate', () => {
    let mockWorkbook, mockWorksheet;

    beforeEach(() => {
      mockWorksheet = {
        views: [],
        columns: [],
        addRows: jest.fn(),
        getRow: jest.fn(() => ({ font: {} })),
        spliceRows: jest.fn(),
        mergeCells: jest.fn(),
      };

      mockWorkbook = {
        addWorksheet: jest.fn(() => mockWorksheet),
        xlsx: {
          writeFile: jest.fn(),
        },
      };

      ExcelJS.Workbook.mockImplementation(() => mockWorkbook);
    });

    it('should generate development template with comprehensive dummy data', async () => {
      const outputPath = '/output/dev-template.xlsx';

      await generateDevExcelTemplate(outputPath);

      expect(mockWorkbook.addWorksheet).toHaveBeenCalledWith('الطلاب');
      expect(mockWorkbook.addWorksheet).toHaveBeenCalledWith('المعلمون');
      expect(mockWorksheet.addRows).toHaveBeenCalled();
      expect(mockWorkbook.xlsx.writeFile).toHaveBeenCalledWith(outputPath);
    });

    it('should include development warning message', async () => {
      await generateDevExcelTemplate('/output/dev-template.xlsx');

      expect(mockWorksheet.spliceRows).toHaveBeenCalledWith(
        1, 0,
        [expect.stringContaining('development template')]
      );
    });
  });

  describe('fetchExportData - Advanced Cases', () => {
    beforeEach(() => {
      getSetting.mockResolvedValue(18);
    });

    it('should handle students export with group filter', async () => {
      const mockData = [{ id: 1, name: 'Student 1' }];
      allQuery.mockResolvedValue(mockData);

      const result = await fetchExportData({
        type: 'students',
        fields: ['name', 'gender'],
        options: { groupId: 1, gender: 'men' }
      });

      expect(allQuery).toHaveBeenCalledWith(
        expect.stringContaining('JOIN student_groups sg ON s.id = sg.student_id'),
        expect.arrayContaining([1, 'Male', 18])
      );
      expect(result).toEqual(mockData);
    });

    it('should handle attendance export with class filter', async () => {
      const mockData = [{ student_name: 'أحمد', status: 'present' }];
      allQuery.mockResolvedValue(mockData);

      const result = await fetchExportData({
        type: 'attendance',
        fields: ['student_name', 'status', 'date'],
        options: { 
          startDate: '2024-01-01', 
          endDate: '2024-01-31',
          classId: 5
        }
      });

      expect(allQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE a.date BETWEEN ? AND ? AND c.id = ?'),
        ['2024-01-01', '2024-01-31', 5]
      );
      expect(result).toEqual(mockData);
    });

    it('should handle attendance export with all classes', async () => {
      const mockData = [{ student_name: 'أحمد', status: 'present' }];
      allQuery.mockResolvedValue(mockData);

      const result = await fetchExportData({
        type: 'attendance',
        fields: ['student_name', 'status'],
        options: { 
          startDate: '2024-01-01', 
          endDate: '2024-01-31',
          classId: 'all'
        }
      });

      expect(allQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE a.date BETWEEN ? AND ?'),
        ['2024-01-01', '2024-01-31']
      );
    });

    it('should handle teachers export with gender filter', async () => {
      const mockData = [{ id: 1, name: 'Teacher 1' }];
      allQuery.mockResolvedValue(mockData);

      const result = await fetchExportData({
        type: 'teachers',
        fields: ['name', 'gender'],
        options: { gender: 'women' }
      });

      expect(allQuery).toHaveBeenCalledWith(
        expect.stringContaining('WHERE 1=1 AND gender = ?'),
        ['Female']
      );
      expect(result).toEqual(mockData);
    });

    it('should handle invalid attendance fields', async () => {
      await expect(fetchExportData({
        type: 'attendance',
        fields: ['invalid_field'],
        options: { startDate: '2024-01-01', endDate: '2024-01-31' }
      })).rejects.toThrow('No valid attendance fields selected.');
    });
  });

  describe('fetchFinancialData - Edge Cases', () => {
    it('should handle null period gracefully', async () => {
      handleGetFinancialSummary.mockResolvedValue({});
      handleGetPayments.mockResolvedValue([]);
      handleGetSalaries.mockResolvedValue([]);
      handleGetDonations.mockResolvedValue([]);
      handleGetExpenses.mockResolvedValue([]);
      handleGetInventoryItems.mockResolvedValue([]);

      const result = await fetchFinancialData(null);

      expect(handleGetFinancialSummary).toHaveBeenCalledWith(null, null);
      expect(handleGetPayments).toHaveBeenCalledWith(null, null);
      expect(result).toHaveProperty('inventory');
    });

    it('should extract year from period startDate', async () => {
      const period = { startDate: '2023-06-15', endDate: '2023-12-31' };
      
      handleGetFinancialSummary.mockResolvedValue({});
      handleGetPayments.mockResolvedValue([]);
      handleGetSalaries.mockResolvedValue([]);
      handleGetDonations.mockResolvedValue([]);
      handleGetExpenses.mockResolvedValue([]);
      handleGetInventoryItems.mockResolvedValue([]);

      await fetchFinancialData(period);

      expect(handleGetFinancialSummary).toHaveBeenCalledWith(null, 2023);
    });
  });

  describe('generateFinancialXlsx - Advanced Features', () => {
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

    it('should handle donations with mixed types', async () => {
      const data = {
        summary: { totalIncome: 1000, totalExpenses: 500, balance: 500 },
        payments: [],
        salaries: [],
        donations: [
          { donor_name: 'أحمد', donation_type: 'Cash', amount: 500 },
          { donor_name: 'فاطمة', donation_type: 'In-kind', description: 'كتب' }
        ],
        expenses: [],
      };

      await generateFinancialXlsx(data, '/output/financial.xlsx');

      expect(mockWorksheet.addRows).toHaveBeenCalledWith([
        { donor_name: 'أحمد', donation_type: 'Cash', amount: 500 },
        { donor_name: 'فاطمة', donation_type: 'In-kind', amount: 'كتب' }
      ]);
    });

    it('should create all required financial sheets', async () => {
      const data = {
        summary: {},
        payments: [],
        salaries: [],
        donations: [],
        expenses: [],
      };

      await generateFinancialXlsx(data, '/output/financial.xlsx');

      expect(mockWorkbook.addWorksheet).toHaveBeenCalledWith('الملخص');
      expect(mockWorkbook.addWorksheet).toHaveBeenCalledWith('الرسوم الدراسية');
      expect(mockWorkbook.addWorksheet).toHaveBeenCalledWith('الرواتب');
      expect(mockWorkbook.addWorksheet).toHaveBeenCalledWith('التبرعات');
      expect(mockWorkbook.addWorksheet).toHaveBeenCalledWith('المصاريف');
    });
  });

  describe('Error Handling', () => {
    it('should handle file system errors in PDF generation', async () => {
      fs.readFileSync.mockImplementation(() => {
        throw new Error('File not found');
      });

      await expect(generatePdf('test', [], [], '/output.pdf', {}))
        .rejects.toThrow();
    });

    it('should handle Excel workbook creation errors', async () => {
      ExcelJS.Workbook.mockImplementation(() => {
        throw new Error('Workbook creation failed');
      });

      await expect(generateXlsx([], [], '/output.xlsx'))
        .rejects.toThrow('Workbook creation failed');
    });

    it('should handle database query errors in fetchExportData', async () => {
      allQuery.mockRejectedValue(new Error('Database error'));

      await expect(fetchExportData({
        type: 'students',
        fields: ['name']
      })).rejects.toThrow('Database error');
    });
  });
});