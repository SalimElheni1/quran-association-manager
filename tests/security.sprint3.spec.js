const { sanitizeForLog } = require('../src/main/logger');

describe('Sprint 3 Security Features', () => {
  describe('SEC-015: Log Sanitization', () => {
    it('should redact sensitive keys in flat objects', () => {
      const input = {
        username: 'admin',
        password: 'SuperSecretPassword123!',
        token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
        national_id: '12345678',
        public_data: 'normal value',
      };

      const sanitized = sanitizeForLog(input);

      expect(sanitized.username).toBe('admin');
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.token).toBe('[REDACTED]');
      expect(sanitized.national_id).toBe('[REDACTED]');
      expect(sanitized.public_data).toBe('normal value');
    });

    it('should redact sensitive keys in nested objects and arrays', () => {
      const input = {
        user: {
          username: 'user1',
          current_password: 'OldPassword123!',
          new_password: 'NewPassword123!',
        },
        items: [
          { name: 'item1', secret: 'secretVal' },
          { name: 'item2', publicVal: 42 },
        ],
      };

      const sanitized = sanitizeForLog(input);

      expect(sanitized.user.username).toBe('user1');
      expect(sanitized.user.current_password).toBe('[REDACTED]');
      expect(sanitized.user.new_password).toBe('[REDACTED]');
      expect(sanitized.items[0].secret).toBe('[REDACTED]');
      expect(sanitized.items[1].publicVal).toBe(42);
    });
  });
});
