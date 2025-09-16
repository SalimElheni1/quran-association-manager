const fs = require('fs');
const path = require('path');
const os = require('os');
const { BrowserWindow } = require('electron');
const {
  fetchExportData,
  generatePdf,
  generateXlsx,
  generateDocx,
} = require('../src/main/exportManager');
const db = require('../src/db/db');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
const settingsManager = require('../src/main/settingsManager');
const exceljs = require('exceljs');

// Mock dependencies
jest.mock('../src/db/db', () => ({
  allQuery: jest.fn().mockResolvedValue([]),
}));
jest.mock('electron', () => ({
  BrowserWindow: jest.fn(() => ({
    loadFile: jest.fn().mockResolvedValue(),
    webContents: {
      printToPDF: jest.fn().mockResolvedValue(Buffer.from('dummy pdf content')),
    },
    close: jest.fn(),
  })),
}));
jest.mock('pizzip');
jest.mock('docxtemplater');
jest.mock('../src/main/settingsManager');
jest.mock('exceljs');
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  writeFileSync: jest.fn(),
  readFileSync: jest.fn().mockReturnValue(''),
  existsSync: jest.fn().mockReturnValue(true),
  unlinkSync: jest.fn(),
}));


const mockHeaderData = {
  nationalAssociationName: 'Test National Name',
  regionalAssociationName: 'Test Regional Name',
  localBranchName: 'Test Branch Name',
  nationalLogoPath: 'test/national.png',
  regionalLocalLogoPath: 'test/local.png',
};

describe('exportManager', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'export-tests-'));
    db.allQuery.mockResolvedValue([]);
    settingsManager.getSetting.mockReturnValue('18'); // Mock for adultAgeThreshold
    jest.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('fetchExportData', () => {
    it('should call the correct query for students', async () => {
      await fetchExportData({ type: 'students', fields: ['id', 'name'] });
      expect(db.allQuery).toHaveBeenCalledWith(
        'SELECT id, name FROM students WHERE 1=1 ORDER BY name',
        [],
      );
    });
  });

  describe('generatePdf', () => {
    it('should create a PDF using the printToPDF method', async () => {
      const outputPath = path.join(tmpDir, 'test.pdf');
      const columns = [{ header: 'h1', key: 'f1' }];
      const data = [{ f1: 'd1' }];

      await generatePdf('Test Report', columns, data, outputPath, mockHeaderData);

      expect(BrowserWindow).toHaveBeenCalled();
      const instance = BrowserWindow.mock.results[0].value;
      expect(instance.loadFile).toHaveBeenCalledWith(expect.any(String));
      expect(instance.webContents.printToPDF).toHaveBeenCalled();
      expect(fs.writeFileSync).toHaveBeenCalledWith(outputPath, expect.any(Buffer));
    });
  });

  describe('generateXlsx', () => {
    it('should attempt to create an XLSX file', async () => {
        const outputPath = path.join(tmpDir, 'test.xlsx');
        const columns = [{ header: 'h1', key: 'f1' }];
        const mockWorksheet = {
            addRows: jest.fn(),
            getRow: jest.fn().mockReturnThis(),
            insertRows: jest.fn(),
            mergeCells: jest.fn(),
            getCell: jest.fn().mockReturnValue({ value: '', alignment: {}, font: {} }),
            addImage: jest.fn(),
            views: [],
            columns: [],
        };
        const mockWorkbook = {
            addWorksheet: jest.fn().mockReturnValue(mockWorksheet),
            addImage: jest.fn(),
            xlsx: {
                writeFile: jest.fn().mockResolvedValue(),
            },
        };
        exceljs.Workbook.mockReturnValue(mockWorkbook);

        await generateXlsx(columns, [{ f1: 'd1' }], outputPath, mockHeaderData);

        expect(exceljs.Workbook).toHaveBeenCalled();
        expect(mockWorkbook.xlsx.writeFile).toHaveBeenCalledWith(outputPath);
    });
  });

  describe('generateDocx', () => {
    it('should throw TEMPLATE_NOT_FOUND if the template does not exist', () => {
      fs.existsSync.mockReturnValue(false);
      const outputPath = path.join(tmpDir, 'test.docx');
      expect(() => {
        generateDocx('Title', [], [], outputPath, mockHeaderData);
      }).toThrow(/TEMPLATE_NOT_FOUND/);
    });

    it('should throw TEMPLATE_INVALID if the template is not a valid zip file', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('this is not a zip file');
      PizZip.mockImplementation(() => {
        throw new Error("Can't find end of central directory");
      });
      const outputPath = path.join(tmpDir, 'test.docx');
      expect(() => {
        generateDocx('Title', [], [], outputPath, mockHeaderData);
      }).toThrow(/TEMPLATE_INVALID/);
    });
  });
});
