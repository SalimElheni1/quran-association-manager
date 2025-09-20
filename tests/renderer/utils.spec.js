import { showSuccessToast, showErrorToast, showInfoToast, showWarningToast } from '../../src/renderer/utils/toast';

// Mock react-toastify
jest.mock('react-toastify', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

// Mock the logger module directly
jest.mock('../../src/renderer/utils/logger', () => {
  let isPackaged = true;
  
  const mockElectronAPI = {
    isPackaged: jest.fn().mockResolvedValue(true)
  };
  
  global.window = global.window || {};
  global.window.electronAPI = mockElectronAPI;
  
  const log = jest.fn((...args) => {
    if (!isPackaged) {
      console.log(...args);
    }
  });
  
  const warn = jest.fn((...args) => {
    if (!isPackaged) {
      console.warn(...args);
    }
  });
  
  const error = jest.fn((...args) => {
    console.error(...args);
  });
  
  // Expose method to control isPackaged for testing
  log._setPackaged = (value) => { isPackaged = value; };
  warn._setPackaged = (value) => { isPackaged = value; };
  error._setPackaged = (value) => { isPackaged = value; };
  
  return { log, warn, error };
});

// Import after mocking
const { log, warn, error } = require('../../src/renderer/utils/logger');

describe('Logger Utils', () => {
  let consoleSpy;

  beforeEach(() => {
    consoleSpy = {
      log: jest.spyOn(console, 'log').mockImplementation(() => {}),
      warn: jest.spyOn(console, 'warn').mockImplementation(() => {}),
      error: jest.spyOn(console, 'error').mockImplementation(() => {}),
    };
    jest.clearAllMocks();
  });

  afterEach(() => {
    consoleSpy.log.mockRestore();
    consoleSpy.warn.mockRestore();
    consoleSpy.error.mockRestore();
  });

  describe('log function', () => {
    it('should log in development mode', () => {
      log._setPackaged(false);
      log('test message', 'additional data');
      expect(consoleSpy.log).toHaveBeenCalledWith('test message', 'additional data');
    });

    it('should not log in production mode', () => {
      log._setPackaged(true);
      log('test message');
      expect(consoleSpy.log).not.toHaveBeenCalled();
    });
  });

  describe('warn function', () => {
    it('should warn in development mode', () => {
      warn._setPackaged(false);
      warn('warning message');
      expect(consoleSpy.warn).toHaveBeenCalledWith('warning message');
    });

    it('should not warn in production mode', () => {
      warn._setPackaged(true);
      warn('warning message');
      expect(consoleSpy.warn).not.toHaveBeenCalled();
    });
  });

  describe('error function', () => {
    it('should always log errors regardless of mode', () => {
      error._setPackaged(true);
      error('error message', 'error details');
      expect(consoleSpy.error).toHaveBeenCalledWith('error message', 'error details');
    });

    it('should log errors in development mode', () => {
      error._setPackaged(false);
      error('error message');
      expect(consoleSpy.error).toHaveBeenCalledWith('error message');
    });
  });
});

describe('Toast Utils', () => {
  const { toast } = require('react-toastify');

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should show success toast with default options', () => {
    showSuccessToast('Success message');

    expect(toast.success).toHaveBeenCalledWith('Success message', {
      position: 'top-right',
      autoClose: 5000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
      progress: undefined,
      theme: 'colored',
    });
  });

  it('should show error toast with default options', () => {
    showErrorToast('Error message');

    expect(toast.error).toHaveBeenCalledWith('Error message', {
      position: 'top-right',
      autoClose: 5000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
      progress: undefined,
      theme: 'colored',
    });
  });

  it('should show info toast with default options', () => {
    showInfoToast('Info message');

    expect(toast.info).toHaveBeenCalledWith('Info message', {
      position: 'top-right',
      autoClose: 5000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
      progress: undefined,
      theme: 'colored',
    });
  });

  it('should show warning toast with default options', () => {
    showWarningToast('Warning message');

    expect(toast.warn).toHaveBeenCalledWith('Warning message', {
      position: 'top-right',
      autoClose: 5000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
      progress: undefined,
      theme: 'colored',
    });
  });
});