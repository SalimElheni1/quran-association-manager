const mockWorksheet = {
  views: [],
  columns: [],
  addRow: jest.fn(),
  addRows: jest.fn(),
  getRow: jest.fn(() => ({ font: {} })),
  insertRow: jest.fn(),
  mergeCells: jest.fn(),
  getCell: jest.fn(() => ({
    alignment: {},
    font: {},
    note: '',
    dataValidation: {},
  })),
  spliceRows: jest.fn(),
};

const mockWorkbook = {
  addWorksheet: jest.fn(() => mockWorksheet),
  getWorksheet: jest.fn(() => mockWorksheet),
  xlsx: {
    writeFile: jest.fn().mockResolvedValue(),
  },
};

class Workbook {
  constructor() {
    return mockWorkbook;
  }
}

module.exports = {
  Workbook,
};
