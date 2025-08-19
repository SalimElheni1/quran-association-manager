const fs = require('fs');
const path = require('path');
const os = require('os');
const { fetchExportData, generatePdf, generateXlsx, generateDocx } = require('../src/main/exportManager');
const db = require('../src/db/db');
const utils = require('../src/main/utils');

// Mock modules
jest.mock('../src/db/db', () => ({
  allQuery: jest.fn(),
}));
jest.mock('../src/main/utils', () => ({
    processArabicText: jest.fn(text => text), // Mock returns text as is
}));


describe('exportManager', () => {
  let tmpDir;
  const templateDir = path.resolve(__dirname, '../src/main/export_templates');
  const templatePath = path.join(templateDir, 'export_template.docx');

  // Create a real temporary directory for test outputs
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'export-tests-'));
    db.allQuery.mockResolvedValue([]); // Default mock response
    utils.processArabicText.mockClear(); // Clear mock calls before each test
  });

  // Clean up the temporary directory
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    jest.clearAllMocks();
    // Clean up template file if it was created
    if (fs.existsSync(templatePath)) {
      fs.unlinkSync(templatePath);
    }
    if (fs.existsSync(templateDir)) {
        // Check if directory is empty before removing
        if (fs.readdirSync(templateDir).length === 0) {
            fs.rmdirSync(templateDir);
        }
    }
  });

  describe('fetchExportData', () => {
    it('should call the correct query for students', async () => {
      await fetchExportData({ type: 'students', fields: ['id', 'name'] });
      expect(db.allQuery).toHaveBeenCalledWith('SELECT id, name FROM students ORDER BY name');
    });
  });

  describe('generatePdf', () => {
    it('should create a non-empty PDF file and process text for RTL', async () => {
      const outputPath = path.join(tmpDir, 'test.pdf');
      const mockTemplate = {
        drawHeader: jest.fn(),
        drawFooter: jest.fn(),
      };

      await generatePdf('Test Report', ['h1'], [{ f1: 'd1' }], ['f1'], outputPath, mockTemplate);

      expect(fs.existsSync(outputPath)).toBe(true);
      const stats = fs.statSync(outputPath);
      expect(stats.size).toBeGreaterThan(0);

      // Check that the text processor was called
      expect(utils.processArabicText).toHaveBeenCalledWith('h1');
      expect(utils.processArabicText).toHaveBeenCalledWith('d1');
    });
  });

  describe('generateXlsx', () => {
    it('should create a non-empty XLSX file without errors', async () => {
      const outputPath = path.join(tmpDir, 'test.xlsx');
      await generateXlsx(['h1'], [{ f1: 'd1' }], ['f1'], outputPath);

      expect(fs.existsSync(outputPath)).toBe(true);
      const stats = fs.statSync(outputPath);
      expect(stats.size).toBeGreaterThan(0);
    });
  });

  describe('generateDocx', () => {
    it('should throw an error if the template does not exist', () => {
      const outputPath = path.join(tmpDir, 'test.docx');
      if (fs.existsSync(templatePath)) {
        fs.unlinkSync(templatePath);
      }
      expect(() => {
        generateDocx('Title', [], [], [], outputPath);
      }).toThrow(/template not found/);
    });
  });
});
