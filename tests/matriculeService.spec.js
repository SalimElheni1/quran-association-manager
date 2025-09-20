// Mock dependencies
jest.mock('../src/main/logger');
jest.mock('../src/main/settingsManager');

const { log } = require('../src/main/logger');
const { getSetting } = require('../src/main/settingsManager');
const { generateMatricule } = require('../src/main/matriculeService');

describe('matriculeService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateMatricule', () => {
    it('should generate student matricule with default format', async () => {
      getSetting.mockResolvedValue(null); // No custom format

      const result = await generateMatricule('student');

      expect(result).toMatch(/^S-\d{6}$/);
      expect(getSetting).toHaveBeenCalledWith('student_matricule_format');
    });

    it('should generate teacher matricule with default format', async () => {
      getSetting.mockResolvedValue(null);

      const result = await generateMatricule('teacher');

      expect(result).toMatch(/^T-\d{6}$/);
      expect(getSetting).toHaveBeenCalledWith('teacher_matricule_format');
    });

    it('should generate user matricule with default format', async () => {
      getSetting.mockResolvedValue(null);

      const result = await generateMatricule('user');

      expect(result).toMatch(/^U-\d{6}$/);
      expect(getSetting).toHaveBeenCalledWith('user_matricule_format');
    });

    it('should generate inventory matricule with default format', async () => {
      getSetting.mockResolvedValue(null);

      const result = await generateMatricule('inventory');

      expect(result).toMatch(/^I-\d{6}$/);
      expect(getSetting).toHaveBeenCalledWith('inventory_matricule_format');
    });

    it('should use custom format when provided', async () => {
      getSetting.mockResolvedValue('CUSTOM-{number}');

      const result = await generateMatricule('student');

      expect(result).toMatch(/^CUSTOM-\d{6}$/);
    });

    it('should handle unknown entity type', async () => {
      getSetting.mockResolvedValue(null);

      const result = await generateMatricule('unknown');

      expect(result).toMatch(/^UNKNOWN-\d{6}$/);
      expect(getSetting).toHaveBeenCalledWith('unknown_matricule_format');
    });

    it('should generate unique numbers for consecutive calls', async () => {
      getSetting.mockResolvedValue(null);

      const result1 = await generateMatricule('student');
      const result2 = await generateMatricule('student');

      expect(result1).not.toBe(result2);
      
      // Extract numbers and verify they're different
      const num1 = parseInt(result1.split('-')[1]);
      const num2 = parseInt(result2.split('-')[1]);
      expect(num1).not.toBe(num2);
    });

    it('should handle custom format with multiple placeholders', async () => {
      getSetting.mockResolvedValue('PREFIX-{number}-SUFFIX');

      const result = await generateMatricule('student');

      expect(result).toMatch(/^PREFIX-\d{6}-SUFFIX$/);
    });

    it('should handle format without placeholder', async () => {
      getSetting.mockResolvedValue('FIXED-FORMAT');

      const result = await generateMatricule('student');

      // Should append number even if no placeholder
      expect(result).toBe('FIXED-FORMAT');
    });

    it('should pad numbers to 6 digits', async () => {
      getSetting.mockResolvedValue('TEST-{number}');

      const result = await generateMatricule('student');
      const numberPart = result.split('-')[1];

      expect(numberPart).toHaveLength(6);
      expect(numberPart).toMatch(/^\d{6}$/);
    });

    it('should generate different prefixes for different entity types', async () => {
      getSetting.mockResolvedValue(null);

      const studentResult = await generateMatricule('student');
      const teacherResult = await generateMatricule('teacher');
      const userResult = await generateMatricule('user');
      const inventoryResult = await generateMatricule('inventory');

      expect(studentResult).toMatch(/^S-/);
      expect(teacherResult).toMatch(/^T-/);
      expect(userResult).toMatch(/^U-/);
      expect(inventoryResult).toMatch(/^I-/);
    });

    it('should handle empty custom format', async () => {
      getSetting.mockResolvedValue('');

      const result = await generateMatricule('student');

      // Should fall back to default format
      expect(result).toMatch(/^S-\d{6}$/);
    });

    it('should handle null entity type gracefully', async () => {
      getSetting.mockResolvedValue(null);

      const result = await generateMatricule(null);

      expect(result).toMatch(/^NULL-\d{6}$/);
    });

    it('should handle undefined entity type gracefully', async () => {
      getSetting.mockResolvedValue(null);

      const result = await generateMatricule(undefined);

      expect(result).toMatch(/^UNDEFINED-\d{6}$/);
    });
  });
});