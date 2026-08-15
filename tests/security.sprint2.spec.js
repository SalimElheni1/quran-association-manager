const {
  checkLoginRateLimit,
  recordFailedLoginAttempt,
  clearLoginAttempts,
} = require('../src/main/handlers/authHandlers');
const { strongPasswordPattern } = require('../src/main/validationSchemas');

describe('Sprint 2 Security Features', () => {
  describe('SEC-008: Login Rate Limiting', () => {
    const testUsername = 'test_rate_limit_user';

    beforeEach(() => {
      clearLoginAttempts(testUsername);
    });

    it('should allow login attempts under threshold', () => {
      for (let i = 0; i < 4; i++) {
        recordFailedLoginAttempt(testUsername);
      }
      const status = checkLoginRateLimit(testUsername);
      expect(status.isLimited).toBe(false);
    });

    it('should block login attempts when 5 failed attempts reached', () => {
      for (let i = 0; i < 5; i++) {
        recordFailedLoginAttempt(testUsername);
      }
      const status = checkLoginRateLimit(testUsername);
      expect(status.isLimited).toBe(true);
      expect(status.retryAfter).toBeGreaterThan(0);
    });

    it('should clear attempts on clearLoginAttempts', () => {
      for (let i = 0; i < 5; i++) {
        recordFailedLoginAttempt(testUsername);
      }
      clearLoginAttempts(testUsername);
      const status = checkLoginRateLimit(testUsername);
      expect(status.isLimited).toBe(false);
    });
  });

  describe('SEC-010: Password Strength Standards', () => {
    it('should reject passwords shorter than 12 characters', () => {
      expect(strongPasswordPattern.test('Short1!')).toBe(false);
    });

    it('should reject passwords missing special characters or uppercase', () => {
      expect(strongPasswordPattern.test('alllowercasepassword123')).toBe(false);
    });

    it('should accept 12+ character complex passwords', () => {
      expect(strongPasswordPattern.test('ComplexP@ssw0rd123!')).toBe(true);
    });
  });
});
