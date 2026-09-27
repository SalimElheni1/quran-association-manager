const { app } = require('electron');
const fs = require('fs');
const path = require('path');

let logFilePath = null;

// SEC-015: Field names whose values must never reach the log file.
const SENSITIVE_FIELD_PATTERN = /pass(word)?|token|secret|transfer_key|national_id|credit|card/i;

/**
 * SEC-015: Deep-redact sensitive values from objects before logging.
 * Field names matching SENSITIVE_FIELD_PATTERN are replaced with '[REDACTED]'.
 * Plain strings and primitives pass through unchanged.
 * @param {*} value
 * @param {WeakSet} [seen] - Circular-reference guard
 * @returns {*}
 */
const sanitizeForLog = (value, seen = new WeakSet()) => {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForLog(item, seen));
  }
  if (value && typeof value === 'object') {
    if (seen.has(value)) {
      return '[Circular]';
    }
    seen.add(value);
    const sanitized = {};
    for (const [key, item] of Object.entries(value)) {
      sanitized[key] = SENSITIVE_FIELD_PATTERN.test(key)
        ? '[REDACTED]'
        : sanitizeForLog(item, seen);
    }
    return sanitized;
  }
  return value;
};

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
    // Try to initialize if not already done
    initializeLogFile();
  }

  if (logFilePath) {
    try {
      const timestamp = new Date().toISOString();
      const message = args
        .map((arg) => {
          if (typeof arg === 'object' && arg !== null) {
            return JSON.stringify(sanitizeForLog(arg));
          }
          return String(arg);
        })
        .join(' ');
      const logLine = `[${timestamp}] [${level}] ${message}\n`;

      fs.appendFileSync(logFilePath, logLine, 'utf-8');
    } catch (e) {
      // Silently fail if we can't write to file
      console.error('Failed to write to log file:', e);
    }
  }
};

const log = (...args) => {
  // In a plain Node.js script (like our verification script), `app` will be undefined.
  // In Electron, we check if the app is packaged.
  // This ensures console logs appear during development and in our script, but not in production.
  if (!app || (app && !app.isPackaged)) {
    console.log(...args);
  }

  // Always write to file
  writeToFile('LOG', args);
};

const warn = (...args) => {
  if (!app || (app && !app.isPackaged)) {
    console.warn(...args);
  }

  // Always write to file
  writeToFile('WARN', args);
};

const error = (...args) => {
  // Errors are important, so we always log them.
  // The production crash logger will handle uncaught exceptions,
  // but this is useful for handled errors.
  console.error(...args);

  // Always write to file
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
  if (logFilePath) {
    try {
      fs.writeFileSync(logFilePath, '', 'utf-8');
      console.log(`Log file cleared: ${logFilePath}`);
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
