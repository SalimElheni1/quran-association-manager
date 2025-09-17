const fs = require('fs');
const os = 'os';
const path = require('path');
const { BrowserWindow } = require('electron');
const { generatePdf, generateDocx } = require('../src/main/exportManager');
const docx = require('docx');

// Mock dependencies
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  readFileSync: jest.fn().mockReturnValue('<html><body>{report_title} on {date} and {report_title}</body></html>'),
  writeFileSync: jest.fn(),
  unlinkSync: jest.fn(),
  existsSync: jest.fn().mockReturnValue(true),
}));

jest.mock('electron', () => ({
  ...jest.requireActual('electron'),
  BrowserWindow: jest.fn(() => ({
    loadFile: jest.fn().mockResolvedValue(),
    webContents: {
      printToPDF: jest.fn().mockResolvedValue(Buffer.from('pdf content')),
    },
    close: jest.fn(),
  })),
}));

// Mock the docx library
jest.mock('docx', () => {
    const originalDocx = jest.requireActual('docx');
    return {
        ...originalDocx,
        Packer: {
            toBuffer: jest.fn().mockResolvedValue(Buffer.from('docx content')),
        },
        Table: jest.fn(),
        Header: jest.fn(),
        ImageRun: jest.fn(),
    };
});

describe('Export Manager Unit Tests', () => {

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generatePdf', () => {
    const mockHeaderData = { nationalAssociationName: 'Test' };
    const mockData = [{ f1: 'd1' }];

    it('should NOT set landscape mode for 4 or less columns', async () => {
      const columns = [
        { header: 'h1', key: 'f1' },
        { header: 'h2', key: 'f2' },
        { header: 'h3', key: 'f3' },
        { header: 'h4', key: 'f4' },
      ];
      await generatePdf('Test', columns, mockData, 'test.pdf', mockHeaderData);

      const printOptions = BrowserWindow.mock.results[0].value.webContents.printToPDF.mock.calls[0][0];
      expect(printOptions.landscape).toBe(false);
    });

    it('should set landscape mode for more than 4 columns', async () => {
      const columns = [
        { header: 'h1', key: 'f1' },
        { header: 'h2', key: 'f2' },
        { header: 'h3', key: 'f3' },
        { header: 'h4', key: 'f4' },
        { header: 'h5', key: 'f5' },
      ];
      await generatePdf('Test', columns, mockData, 'test.pdf', mockHeaderData);

      const printOptions = BrowserWindow.mock.results[0].value.webContents.printToPDF.mock.calls[0][0];
      expect(printOptions.landscape).toBe(true);
    });
  });

});
