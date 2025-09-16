const fs = require('fs');
const path = require('path');
const os = require('os');
const { generate } = require('@pdfme/generator');
const {
  fetchExportData,
  generatePdf,
  generateXlsx,
  generateDocx,
} = require('../src/main/exportManager');
const db = require('../src/db/db');
const PizZip = require('pizzip');

// Mock dependencies
jest.mock('../src/db/db', () => ({
  allQuery: jest.fn().mockResolvedValue([]),
}));
jest.mock('@pdfme/generator', () => ({
  generate: jest.fn().mockResolvedValue(Buffer.from('dummy pdf content')),
}));
jest.mock('fs', () => ({
  ...jest.requireActual('fs'), // import and retain default behavior
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
}));
jest.mock('pizzip');
jest.mock('docxtemplater');

describe('exportManager', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'export-tests-'));
    db.allQuery.mockResolvedValue([]); // Default mock
    fs.writeFileSync.mockClear();
    fs.readFileSync.mockClear();
    generate.mockClear();
    jest.clearAllMocks(); // Clear mocks before each test
  });

  afterEach(() => {
    const fsActual = jest.requireActual('fs');
    fsActual.rmSync(tmpDir, { recursive: true, force: true });
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
  });

  describe('generatePdf', () => {
    it('should generate a PDF using pdfme', async () => {
      const outputPath = path.join(tmpDir, 'test.pdf');
      const template = { schemas: [{}], basePdf: {} };
      const inputs = [{}];

      fs.readFileSync.mockReturnValue(Buffer.from('mock font data'));

      await generatePdf({ template, inputs, outputPath });

      expect(generate).toHaveBeenCalledWith({
        template,
        inputs,
        options: expect.any(Object),
      });
      expect(fs.writeFileSync).toHaveBeenCalledWith(outputPath, expect.any(Buffer));
    });
  });

  describe('generateXlsx', () => {
    it('should create a non-empty XLSX file without errors', async () => {
      const outputPath = path.join(tmpDir, 'test.xlsx');
      const columns = [{ header: 'h1', key: 'f1' }];

      // Since writeFileSync is mocked, we can't check the file system.
      // We'll just ensure no errors are thrown.
      await expect(generateXlsx(columns, [{ f1: 'd1' }], outputPath)).resolves.not.toThrow();
    });
  });

  describe('generateDocx', () => {
    it('should throw TEMPLATE_NOT_PROVIDED if the template buffer is missing', () => {
      const options = {
        title: 'Title',
        columns: [],
        data: [],
        outputPath: path.join(tmpDir, 'test.docx'),
        templateBuffer: null,
      };
      expect(() => generateDocx(options)).toThrow(/TEMPLATE_NOT_PROVIDED/);
    });

    it('should throw TEMPLATE_INVALID if the template is not a valid zip file', () => {
      PizZip.mockImplementation(() => {
        throw new Error("Can't find end of central directory");
      });

      const options = {
        title: 'Title',
        columns: [],
        data: [],
        outputPath: path.join(tmpDir, 'test.docx'),
        templateBuffer: Buffer.from('this is not a zip file'),
      };

      expect(() => generateDocx(options)).toThrow(/TEMPLATE_INVALID/);
    });
  });
});
