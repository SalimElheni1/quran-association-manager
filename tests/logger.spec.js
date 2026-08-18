// tests/logger.spec.js
jest.mock('electron', () => ({
  app: { getPath: jest.fn(() => '/mock/user-data'), isPackaged: false },
}));

const fs = require('fs');
const logger = require('../src/main/logger');

describe('logger sanitizeForLog (SEC-015)', () => {
  it('redacts password field values', () => {
    const out = logger.sanitizeForLog({ username: 'admin', password: 'Sup3rSecret!' });
    expect(out).toEqual({ username: 'admin', password: '[REDACTED]' });
  });

  it('redacts tokens, transfer keys, national ids and card numbers', () => {
    const out = logger.sanitizeForLog({
      token: 'jwt.payload',
      association_transfer_key: '123456',
      national_id: '0987654321',
      card_number: '4111 1111 1111 1111',
    });
    expect(Object.values(out).every((v) => v === '[REDACTED]')).toBe(true);
  });

  it('redacts nested objects and arrays', () => {
    const out = logger.sanitizeForLog({
      settings: {
        backup: { association_transfer_key: 'secret-key' },
        users: [{ name: 'Salim', password: 'pass123' }],
      },
    });
    expect(out.settings.backup.association_transfer_key).toBe('[REDACTED]');
    expect(out.settings.users[0].password).toBe('[REDACTED]');
    expect(out.settings.users[0].name).toBe('Salim');
  });

  it('redacts error payloads containing sensitive fields', () => {
    const err = {
      _original: { association_transfer_key: '123456', president_full_name: 'راشد سوالمية' },
      details: [{ path: ['association_transfer_key'], type: 'object.unknown' }],
    };
    const out = logger.sanitizeForLog(err);
    expect(out._original.association_transfer_key).toBe('[REDACTED]');
    expect(out._original.president_full_name).toBe('راشد سوالمية');
    expect(out.details[0].type).toBe('object.unknown');
  });

  it('leaves non-sensitive objects and primitives untouched', () => {
    expect(logger.sanitizeForLog('plain string')).toBe('plain string');
    expect(logger.sanitizeForLog(42)).toBe(42);
    expect(logger.sanitizeForLog(null)).toBe(null);
    const out = logger.sanitizeForLog({ failCount: 1, lockedUntil: null, name: 'test' });
    expect(out).toEqual({ failCount: 1, lockedUntil: null, name: 'test' });
  });

  it('handles circular references without hanging', () => {
    const circular = { name: 'loop' };
    circular.self = circular;
    const out = logger.sanitizeForLog(circular);
    expect(out.self).toBe('[Circular]');
  });
});

describe('logger file output (SEC-015)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    logger.initializeLogFile();
  });

  it('writes redacted values to the log file', () => {
    logger.log('login', { username: 'admin', password: 'Sup3rSecret!' });
    expect(fs.appendFileSync).toHaveBeenCalledWith(
      expect.stringContaining('app-logs.txt'),
      expect.stringContaining('[REDACTED]'),
      'utf-8',
    );
    expect(fs.appendFileSync).not.toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('Sup3rSecret!'),
      expect.any(String),
    );
  });

  it('writes non-sensitive strings unchanged', () => {
    logger.log('Backup completed successfully.');
    expect(fs.appendFileSync).toHaveBeenCalledWith(
      expect.stringContaining('app-logs.txt'),
      expect.stringContaining('Backup completed successfully.'),
      'utf-8',
    );
  });
});
