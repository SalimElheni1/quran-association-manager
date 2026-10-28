// src/main/logger.js for the web server: one line per message on stdout/stderr, tagged with
// the branch, with the same redaction of sensitive fields. There is no shared log file, so
// one branch can never read another branch's log lines.

const context = require('../context');

const SENSITIVE_FIELD_PATTERN = /pass(word)?|token|secret|transfer_key|national_id|credit|card/i;
const quiet = process.env.LOG_LEVEL === 'warn' || process.env.LOG_LEVEL === 'error';
const errorsOnly = process.env.LOG_LEVEL === 'error';

const sanitizeForLog = (value, seen = new WeakSet()) => {
  if (Array.isArray(value)) return value.map((item) => sanitizeForLog(item, seen));
  if (value instanceof Error) return value;
  if (value && typeof value === 'object') {
    if (seen.has(value)) return '[Circular]';
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

function format(level, args) {
  const ctx = context.current();
  const where = ctx && ctx.branch ? ` [branch ${ctx.branch.id}]` : '';
  const text = args
    .map((arg) => {
      if (arg instanceof Error) return arg.stack || arg.message;
      if (arg && typeof arg === 'object') {
        try {
          return JSON.stringify(sanitizeForLog(arg));
        } catch {
          return '[Unserializable]';
        }
      }
      return String(arg);
    })
    .join(' ');
  return `${new Date().toISOString()} ${level}${where} ${text}`;
}

const log = (...args) => {
  if (!quiet) console.log(format('INFO', args));
};
const warn = (...args) => {
  if (!errorsOnly) console.warn(format('WARN', args));
};
const error = (...args) => {
  console.error(format('ERROR', args));
};

module.exports = {
  log,
  warn,
  error,
  initializeLogFile: () => {},
  getLogFilePath: () => null,
  clearLogFile: () => {},
  sanitizeForLog,
};
