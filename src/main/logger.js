const { app } = require('electron');
const fs = require('fs');
const path = require('path');

let logFilePath = null;

const SENSITIVE_KEYS = new Set([
  'password',
  'current_password',
  'new_password',
  'confirm_new_password',
  'token',
  'jwt',
  'secret',
  'jwt_secret',
  'national_id',
  'credit_card',
  'authorization',
]);

/**
 * Sanitizes sensitive properties in objects to prevent PII/credential leaks in logs.
 * @param {any} data
 * @returns {any}
 */
function sanitizeForLog(data) {
  if (data === null || data === undefined) return data;
  if (typeof data !== 'object') return data;

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeForLog(item));
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeForLog(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * Initialize log file path (called after app is ready)
 */
const initializeLogFile = () => {
  if (app && app.getPath) {
    logFilePath = path.join(app.getPath('userData'), 'app-logs.txt');
  }
};

/**
 * Write message to log file
 */
const writeToFile = (level, args) => {
  if (!logFilePath) {
    initializeLogFile();
  }

  if (logFilePath && typeof fs.appendFileSync === 'function') {
    try {
      const timestamp = new Date().toISOString();
      const sanitizedArgs = args.map((arg) => sanitizeForLog(arg));
      const message = sanitizedArgs
        .map((arg) => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg)))
        .join(' ');
      const logLine = `[${timestamp}] [${level}] ${message}\n`;

      fs.appendFileSync(logFilePath, logLine, 'utf-8');
    } catch (e) {
      // Silently ignore log write errors
    }
  }
};

const log = (...args) => {
  if (!app || (app && !app.isPackaged)) {
    const sanitizedArgs = args.map((arg) => sanitizeForLog(arg));
    console.log(...sanitizedArgs);
  }

  writeToFile('LOG', args);
};

const warn = (...args) => {
  if (!app || (app && !app.isPackaged)) {
    const sanitizedArgs = args.map((arg) => sanitizeForLog(arg));
    console.warn(...sanitizedArgs);
  }

  writeToFile('WARN', args);
};

const error = (...args) => {
  const sanitizedArgs = args.map((arg) => sanitizeForLog(arg));
  console.error(...sanitizedArgs);

  writeToFile('ERROR', args);
};

/**
 * Get the path to the log file (for reading during testing)
 */
const getLogFilePath = () => logFilePath;

/**
 * Clear the log file (useful before starting test scenarios)
 */
const clearLogFile = () => {
  if (logFilePath && typeof fs.writeFileSync === 'function') {
    try {
      fs.writeFileSync(logFilePath, '', 'utf-8');
    } catch (e) {
      console.error('Failed to clear log file:', e);
    }
  }
};

module.exports = {
  log,
  warn,
  error,
  initializeLogFile,
  getLogFilePath,
  clearLogFile,
  sanitizeForLog,
};
