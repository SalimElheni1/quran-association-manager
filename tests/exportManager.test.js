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

describe('exportManager', () => {
  let tmpDir;
  const templateDir = path.resolve(__dirname, '../src/main/export_templates');
  const docxTemplatePath = path.join(templateDir, 'export_template.docx');

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'export-tests-'));
    db.allQuery.mockResolvedValue([]); // Default mock
    jest.clearAllMocks(); // Clear mocks before each test
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (fs.existsSync(docxTemplatePath)) {
      fs.unlinkSync(docxTemplatePath);
    }
  });

  describe('fetchExportData', () => {
    it('should call the correct query for students', async () => {
      db.allQuery.mockResolvedValueOnce([]);
      await fetchExportData({ type: 'students', fields: ['id', 'name'] });
      expect(db.allQuery).toHaveBeenCalledWith(
        'SELECT id, name FROM students WHERE 1=1 ORDER BY name',
        [],
      );
    });

    it('should correctly filter attendance by classId', async () => {
      db.allQuery.mockResolvedValueOnce([]);
      const options = {
        type: 'attendance',
        fields: ['student_name', 'status'],
        options: {
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          classId: 5,
        },
      };
      await fetchExportData(options);
      const expectedQuery = `SELECT s.name as student_name, a.status
               FROM attendance a
               JOIN students s ON s.id = a.student_id
               JOIN classes c ON c.id = a.class_id WHERE a.date BETWEEN ? AND ? AND c.id = ? ORDER BY a.date`;
      const expectedParams = ['2024-01-01', '2024-01-31', 5];
      // We are doing a string comparison without worrying about whitespace
      expect(db.allQuery.mock.calls[0][0].replace(/\s+/g, ' ')).toBe(
        expectedQuery.replace(/\s+/g, ' '),
      );
      expect(db.allQuery).toHaveBeenCalledWith(expect.any(String), expectedParams);
    });
  });

  describe('generatePdf', () => {
    it('should create a PDF using the printToPDF method', async () => {
      const outputPath = path.join(tmpDir, 'test.pdf');
      const columns = [{ header: 'h1', key: 'f1' }];
      const data = [{ f1: 'd1' }];

      await generatePdf('Test Report', columns, data, outputPath);

      expect(BrowserWindow).toHaveBeenCalled();
      const instance = BrowserWindow.mock.results[0].value;
      expect(instance.loadFile).toHaveBeenCalledWith(expect.any(String)); // Check it loads a temp file
      expect(instance.webContents.printToPDF).toHaveBeenCalled();

      const writtenContent = fs.readFileSync(outputPath);
      expect(writtenContent.toString()).toBe('dummy pdf content');
    });
  });

  describe('generateXlsx', () => {
    it('should create a non-empty XLSX file without errors', async () => {
      const outputPath = path.join(tmpDir, 'test.xlsx');
      const columns = [{ header: 'h1', key: 'f1' }];
      await generateXlsx(columns, [{ f1: 'd1' }], outputPath);

      expect(fs.existsSync(outputPath)).toBe(true);
      const stats = fs.statSync(outputPath);
      expect(stats.size).toBeGreaterThan(0);
    });
  });

  describe('generateDocx', () => {
    it('should throw TEMPLATE_NOT_FOUND if the template does not exist', () => {
      const outputPath = path.join(tmpDir, 'test.docx');
      expect(() => {
        generateDocx('Title', [], [], outputPath);
      }).toThrow(/TEMPLATE_NOT_FOUND/);
    });

    it('should throw TEMPLATE_INVALID if the template is not a valid zip file', () => {
      const outputPath = path.join(tmpDir, 'test.docx');
      if (!fs.existsSync(templateDir)) {
        fs.mkdirSync(templateDir, { recursive: true });
      }
      fs.writeFileSync(docxTemplatePath, 'this is not a zip file');

      // Configure the PizZip mock to throw an error when instantiated
      PizZip.mockImplementation(() => {
        throw new Error("Can't find end of central directory : is this a zip file ?");
      });

      expect(() => {
        generateDocx('Title', [], [], outputPath);
      }).toThrow(/TEMPLATE_INVALID/);
    });
  });
});
