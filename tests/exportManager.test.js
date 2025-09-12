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
jest.mock('docxtemplater', () => {
  return jest.fn().mockImplementation(() => ({
    render: jest.fn(),
    getZip: jest.fn().mockReturnValue({
      generate: jest.fn().mockReturnValue('dummy buffer'),
    }),
  }));
});

describe('exportManager', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'export-tests-'));
    db.allQuery.mockResolvedValue([]);
    jest.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  describe('fetchExportData', () => {
    it('should call the correct query for students', async () => {
      await fetchExportData({ type: 'students', fields: ['id', 'name'] });
      expect(db.allQuery).toHaveBeenCalledWith(
        'SELECT id, name FROM students WHERE 1=1 ORDER BY name',
        [],
      );
    });

    it('should correctly filter attendance by classId', async () => {
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
      jest.spyOn(fs, 'readFileSync').mockReturnValue('<html></html>');
      jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
      jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

      const outputPath = path.join(tmpDir, 'test.pdf');
      await generatePdf('Test Report', [], [], outputPath);

      expect(BrowserWindow).toHaveBeenCalled();
      expect(fs.writeFileSync).toHaveBeenCalledWith(outputPath, expect.any(Buffer));
    });
  });

  describe('generateXlsx', () => {
    it('should create a non-empty XLSX file without errors', async () => {
      const outputPath = path.join(tmpDir, 'test.xlsx');
      await generateXlsx([], [], outputPath);
      expect(fs.existsSync(outputPath)).toBe(true);
      expect(fs.statSync(outputPath).size).toBeGreaterThan(0);
    });
  });

  describe('generateDocx', () => {
    it('should throw TEMPLATE_NOT_FOUND if the template does not exist', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);
      expect(() => {
        generateDocx('Title', [], [], 'output.docx', 'non_existent_type');
      }).toThrow(/TEMPLATE_NOT_FOUND/);
    });

    it('should read the correct template based on exportType', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      const readFileSyncSpy = jest.spyOn(fs, 'readFileSync').mockReturnValue('dummy content');

      generateDocx('Title', [], [], 'output.docx', 'students');
      expect(readFileSyncSpy).toHaveBeenCalledWith(expect.stringContaining('students_template.docx'), 'binary');

      generateDocx('Title', [], [], 'output.docx', 'teachers');
      expect(readFileSyncSpy).toHaveBeenCalledWith(expect.stringContaining('teachers_template.docx'), 'binary');

      generateDocx('Title', [], [], 'output.docx', 'other_type');
      expect(readFileSyncSpy).toHaveBeenCalledWith(expect.stringContaining('general_template.docx'), 'binary');
    });
  });
});
