import {
  getAcademicYearString,
  getAcademicYearStringFor,
} from '../../../src/renderer/utils/academicYear';

describe('academicYear util', () => {
  describe('getAcademicYearStringFor(date)', () => {
    it('starts a new academic year in September (month >= 9)', () => {
      expect(getAcademicYearStringFor(new Date(2026, 8, 10))).toBe('2026-2027'); // Sep
      expect(getAcademicYearStringFor(new Date(2026, 11, 31))).toBe('2026-2027'); // Dec
    });

    it('uses the previous year for months 1–8', () => {
      expect(getAcademicYearStringFor(new Date(2026, 1, 15))).toBe('2025-2026'); // Feb
      expect(getAcademicYearStringFor(new Date(2026, 7, 20))).toBe('2025-2026'); // Aug
    });

    it('crosses the boundary correctly at month 8 vs 9', () => {
      expect(getAcademicYearStringFor(new Date(2026, 7, 31))).toBe('2025-2026'); // Aug 31
      expect(getAcademicYearStringFor(new Date(2026, 8, 1))).toBe('2026-2027'); // Sep 1
    });
  });

  describe('getAcademicYearString()', () => {
    it('uses the current date with the same month rule', () => {
      const now = new Date();
      const expected = getAcademicYearStringFor(now);
      expect(getAcademicYearString()).toBe(expected);
    });
  });
});
