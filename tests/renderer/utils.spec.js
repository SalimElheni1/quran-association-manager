import {
  showSuccessToast,
  showErrorToast,
  showInfoToast,
  showWarningToast,
} from '../../src/renderer/utils/toast';

// Mock react-toastify
jest.mock('react-toastify', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  },
}));

// Loads a fresh copy of the real logger with the given packaged flag from the main process.
async function loadLogger(isPackagedPromise) {
  window.electronAPI = { isPackaged: jest.fn(() => isPackagedPromise) };
  let logger;
  jest.isolateModules(() => {
    logger = require('../../src/renderer/utils/logger');
  });
  await Promise.resolve(); // let the flag arrive
  return logger;
}

describe('Logger Utils', () => {
  const originalElectronAPI = window.electronAPI;
  let consoleSpy;

  beforeEach(() => {
    consoleSpy = {
      log: jest.spyOn(console, 'log').mockImplementation(() => {}),
      warn: jest.spyOn(console, 'warn').mockImplementation(() => {}),
      error: jest.spyOn(console, 'error').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    consoleSpy.log.mockRestore();
    consoleSpy.warn.mockRestore();
    consoleSpy.error.mockRestore();
  });

  afterAll(() => {
    window.electronAPI = originalElectronAPI;
  });

  it('prints logs and warnings in development', async () => {
    const { log, warn } = await loadLogger(Promise.resolve(false));

    log('dev message', 1);
    warn('dev warning');

    expect(consoleSpy.log).toHaveBeenCalledWith('dev message', 1);
    expect(consoleSpy.warn).toHaveBeenCalledWith('dev warning');
  });

  it('stays silent in the packaged app, except for errors', async () => {
    const { log, warn, error } = await loadLogger(Promise.resolve(true));

    log('hidden');
    warn('hidden');
    error('shown', 42);

    expect(consoleSpy.log).not.toHaveBeenCalled();
    expect(consoleSpy.warn).not.toHaveBeenCalled();
    expect(consoleSpy.error).toHaveBeenCalledWith('shown', 42);
  });

  it('stays silent until the main process says it is a development build', async () => {
    const { log } = await loadLogger(new Promise(() => {}));

    log('too early');

    expect(consoleSpy.log).not.toHaveBeenCalled();
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
      autoClose: 8000,
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
      autoClose: 8000,
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
      autoClose: 8000,
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
      autoClose: 8000,
      hideProgressBar: false,
      closeOnClick: true,
      pauseOnHover: true,
      draggable: true,
      progress: undefined,
      theme: 'colored',
    });
  });
});
