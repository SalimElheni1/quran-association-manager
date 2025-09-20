const fs = {
  readFile: jest.fn(),
  writeFile: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  existsSync: jest.fn(),
  unlinkSync: jest.fn(),
  mkdirSync: jest.fn(),
  readdirSync: jest.fn(),
  statSync: jest.fn(),
  copyFileSync: jest.fn(),
  access: jest.fn(),
  mkdtempSync: jest.fn(),
  rmSync: jest.fn(),
  constants: {
    F_OK: 0,
    R_OK: 4,
    W_OK: 2,
    X_OK: 1,
  },
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    unlink: jest.fn(),
    mkdir: jest.fn(),
    readdir: jest.fn(),
    stat: jest.fn(),
    copyFile: jest.fn(),
    access: jest.fn(),
  },
};

// Set up default mock implementations
fs.readFile.mockImplementation((path, callback) => {
  if (typeof callback === 'function') {
    callback(null, Buffer.from('mock file content'));
  }
});

fs.promises.readFile.mockResolvedValue(Buffer.from('mock file content'));
fs.existsSync.mockReturnValue(true);
fs.promises.access.mockResolvedValue();
fs.mkdtempSync.mockReturnValue('/tmp/test-dir');
fs.rmSync.mockImplementation(() => {});
fs.readFileSync.mockReturnValue('mock file content');

module.exports = fs;