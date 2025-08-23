const mockFile = jest.fn();
const mockGenerate = jest.fn(() => 'mock-zip-content');

const mockZipInstance = {
  file: mockFile,
  generate: mockGenerate,
};

const PizZip = jest.fn(() => mockZipInstance);

// Add a way to access the mocks from tests
PizZip.mockInstance = mockZipInstance;

// Custom clear function to reset the internal mocks and the main mock itself
PizZip.mockClear = () => {
  mockFile.mockClear();
  mockGenerate.mockClear();
  // Manually reset the main mock's calls and results to avoid recursion
  PizZip.mock.calls = [];
  PizZip.mock.results = [];
};

module.exports = PizZip;
