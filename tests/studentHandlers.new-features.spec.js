const { ipcMain } = require('electron');
const { registerStudentHandlers } = require('../src/main/handlers/studentHandlers');
const db = require('../src/db/db');

// Mock dependencies
jest.mock('../src/db/db');
jest.mock('../src/main/logger');
jest.mock('../src/main/authMiddleware', () => ({
  requireRoles: jest.fn(() => (handler) => handler),
}));

// A birth date the given number of years before today, so ages never drift out of range.
const yearsAgo = (years) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - years);
  return d.toISOString().slice(0, 10);
};

describe('Student Handlers - New Features', () => {
  beforeAll(() => {
    registerStudentHandlers();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ============================================
  // NEW MEMORIZATION FEATURES TESTS
  // ============================================

  describe('students:getByAgeGroup', () => {
    it('should retrieve students matching an age group criteria', async () => {
      const mockAgeGroup = {
        id: 1,
        name: 'Kids Group',
        min_age: 8,
        max_age: 12,
        gender: 'male_only',
        gender_policy: 'M',
      };

      const mockStudents = [
        {
          id: 1,
          name: 'Ahmed',
          matricule: 'S-001',
          gender: 'male',
          date_of_birth: yearsAgo(10),
          status: 'active',
        },
        {
          id: 2,
          name: 'Sara',
          matricule: 'S-002',
          gender: 'female',
          date_of_birth: yearsAgo(11),
          status: 'active',
        },
      ];

      db.getQuery.mockResolvedValue(mockAgeGroup);
      db.allQuery.mockResolvedValue(mockStudents);

      const result = await ipcMain.invoke('students:getByAgeGroup', 1);

      expect(result.success).toBe(true);
      expect(result.ageGroup).toEqual(mockAgeGroup);
      // Sara is a girl: left out of a male-only group.
      expect(result.students.map((s) => s.name)).toEqual(['Ahmed']);
      expect(result.count).toBe(1);
      expect(db.allQuery).toHaveBeenCalledWith(expect.stringContaining('deleted_at IS NULL'), []);
    });

    it('should return error for invalid age group ID', async () => {
      db.getQuery.mockResolvedValue(null);

      const result = await ipcMain.invoke('students:getByAgeGroup', 999);

      expect(result.success).toBe(false);
      expect(result.message).toContain('غير موجودة');
    });
  });

  describe('surahs and hizbs handlers', () => {
    it('should retrieve all surahs', async () => {
      const mockSurahs = [
        { id: 1, name_ar: 'الفاتحة', name_en: 'Al-Fatiha' },
        { id: 2, name_ar: 'البقرة', name_en: 'Al-Baqarah' },
      ];
      db.allQuery.mockResolvedValue(mockSurahs);

      const result = await ipcMain.invoke('surahs:get');

      expect(result).toEqual(mockSurahs);
      expect(db.allQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id, name_ar, name_en FROM surahs ORDER BY id'),
      );
    });

    it('should retrieve all hizbs', async () => {
      const mockHizbs = [
        { id: 1, hizb_number: 1 },
        { id: 2, hizb_number: 2 },
      ];
      db.allQuery.mockResolvedValue(mockHizbs);

      const result = await ipcMain.invoke('hizbs:get');

      expect(result).toEqual(mockHizbs);
      expect(db.allQuery).toHaveBeenCalledWith('SELECT id, hizb_number FROM hizbs ORDER BY id');
    });
  });
});
