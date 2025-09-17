const { ipcMain } = require('electron');
const { registerSystemHandlers } = require('../src/main/handlers/systemHandlers');
const exportManager = require('../src/main/exportManager');
const { dialog } = require('electron');

// Mock the dependencies
jest.mock('../src/main/exportManager', () => ({
  getExportHeaderData: jest.fn().mockResolvedValue({
    nationalAssociationName: 'National Assoc',
    localBranchName: 'Local Branch',
    nationalLogoPath: 'path/to/national.png',
    regionalLocalLogoPath: 'path/to/local.png',
  }),
  fetchExportData: jest.fn().mockResolvedValue([{ id: 1, name: 'Test Data' }]),
  generatePdf: jest.fn().mockResolvedValue(),
  generateXlsx: jest.fn().mockResolvedValue(),
  generateDocx: jest.fn().mockResolvedValue(),
}));

jest.mock('electron', () => ({
  ipcMain: {
    handle: jest.fn(),
  },
  dialog: {
    showSaveDialog: jest.fn().mockResolvedValue({ filePath: 'test.pdf' }),
  },
  app: {
    getVersion: jest.fn(),
  },
}));

describe('Export Generation Handler', () => {
  let exportGenerateHandler;

  beforeAll(() => {
    registerSystemHandlers();
    // Find the 'export:generate' handler among the registered handlers
    exportGenerateHandler = ipcMain.handle.mock.calls.find(
      (call) => call[0] === 'export:generate',
    )[1];
  });

  beforeEach(() => {
    // Clear mock history before each test
    jest.clearAllMocks();
    // Reset to a default successful save dialog
    dialog.showSaveDialog.mockResolvedValue({ filePath: 'test.out' });
  });

  it('should call getExportHeaderData for every export type', async () => {
    const options = {
      exportType: 'students',
      format: 'pdf',
      columns: [{ key: 'name', header: 'Name' }],
      options: {},
    };
    await exportGenerateHandler({}, options);
    expect(exportManager.getExportHeaderData).toHaveBeenCalledTimes(1);
  });

  it('should pass headerData to generatePdf', async () => {
    const options = {
      exportType: 'students',
      format: 'pdf',
      columns: [{ key: 'name', header: 'Name' }],
      options: {},
    };
    await exportGenerateHandler({}, options);
    const expectedHeaderData = await exportManager.getExportHeaderData();
    expect(exportManager.generatePdf).toHaveBeenCalledWith(
      expect.any(String), // title
      options.columns,
      expect.any(Array), // data
      'test.out',
      expectedHeaderData,
    );
  });

  it('should pass headerData to generateXlsx', async () => {
    const options = {
      exportType: 'teachers',
      format: 'xlsx',
      columns: [{ key: 'name', header: 'Name' }],
      options: {},
    };
    dialog.showSaveDialog.mockResolvedValue({ filePath: 'test.xlsx' });
    await exportGenerateHandler({}, options);
    const expectedHeaderData = await exportManager.getExportHeaderData();
    expect(exportManager.generateXlsx).toHaveBeenCalledWith(
      options.columns,
      expect.any(Array),
      'test.xlsx',
      expectedHeaderData,
    );
  });

  it('should pass headerData to generateDocx', async () => {
    const options = {
      exportType: 'admins',
      format: 'docx',
      columns: [{ key: 'name', header: 'Name' }],
      options: {},
    };
    dialog.showSaveDialog.mockResolvedValue({ filePath: 'test.docx' });
    await exportGenerateHandler({}, options);
    const expectedHeaderData = await exportManager.getExportHeaderData();
    expect(exportManager.generateDocx).toHaveBeenCalledWith(
      expect.any(String),
      options.columns,
      expect.any(Array),
      'test.docx',
      expectedHeaderData,
    );
  });
});
