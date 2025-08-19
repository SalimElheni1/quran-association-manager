const fs = require('fs');
const path = require('path');
const os = require('os');
const { fetchExportData, generatePdf, generateXlsx, generateDocx } = require('../src/main/exportManager');
const db = require('../src/db/db');

// We only mock the db module now.
jest.mock('../src/db/db', () => ({
  allQuery: jest.fn(),
}));

describe('exportManager', () => {
  let tmpDir;
  const templateDir = path.resolve(__dirname, '../src/main/export_templates');
  const templatePath = path.join(templateDir, 'export_template.docx');

  // Create a real temporary directory for test outputs
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'export-tests-'));
    db.allQuery.mockResolvedValue([]); // Default mock response
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
      const columns = [{ key: 'id' }, { key: 'name' }];
      await fetchExportData({ type: 'students', fields: columns.map(c => c.key) });
      expect(db.allQuery).toHaveBeenCalledWith('SELECT id, name FROM students ORDER BY name');
    });
  });

  describe('generatePdf', () => {
    it('should create a non-empty PDF file without errors', async () => {
      const outputPath = path.join(tmpDir, 'test.pdf');
      const mockTemplate = {
        drawHeader: jest.fn(),
        drawFooter: jest.fn(),
      };
      const columns = [{ header: 'h1', key: 'f1' }];
      const data = [{ f1: 'd1' }];

      await generatePdf('Test Report', columns, data, outputPath, mockTemplate);

      expect(fs.existsSync(outputPath)).toBe(true);
      const stats = fs.statSync(outputPath);
      expect(stats.size).toBeGreaterThan(0);
    });
  });

  describe('generateXlsx', () => {
    it('should create a non-empty XLSX file without errors', async () => {
      const outputPath = path.join(tmpDir, 'test.xlsx');
      const columns = [{ header: 'h1', key: 'f1' }];
      const data = [{ f1: 'd1' }];
      await generateXlsx(columns, data, outputPath);

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
        generateDocx('Title', [], [], outputPath);
      }).toThrow(/template not found/);
    });
  });
});
