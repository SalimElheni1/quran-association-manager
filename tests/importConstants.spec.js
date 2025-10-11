const {
  AVAILABLE_SHEETS,
  getAvailableSheets,
  getSheetInfo,
  getAllSheets,
  isSheetAvailable,
} = require('../src/main/importConstants');

describe('Import Constants', () => {
  describe('AVAILABLE_SHEETS', () => {
    it('should contain all expected sheets', () => {
      expect(AVAILABLE_SHEETS).toHaveLength(8);
      const sheetNames = AVAILABLE_SHEETS.map(s => s.name);
      expect(sheetNames).toContain('المستخدمون');
      expect(sheetNames).toContain('المعلمون');
      expect(sheetNames).toContain('الطلاب');
      expect(sheetNames).toContain('الفصول');
      expect(sheetNames).toContain('العمليات المالية');
      expect(sheetNames).toContain('الحضور');
      expect(sheetNames).toContain('المجموعات');
      expect(sheetNames).toContain('المخزون');
    });

    it('should have required columns for each sheet', () => {
      AVAILABLE_SHEETS.forEach(sheet => {
        expect(sheet).toHaveProperty('name');
        expect(sheet).toHaveProperty('requiredColumns');
        expect(Array.isArray(sheet.requiredColumns)).toBe(true);
        expect(sheet.requiredColumns.length).toBeGreaterThan(0);
      });
    });
  });

  describe('getAvailableSheets', () => {
    it('should return array of all sheet names', () => {
      const result = getAvailableSheets();
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(8);
      expect(result).toContain('المستخدمون');
      expect(result).toContain('المعلمون');
    });

    it('should return only names without other properties', () => {
      const result = getAvailableSheets();
      result.forEach(name => {
        expect(typeof name).toBe('string');
      });
    });
  });

  describe('getSheetInfo', () => {
    it('should return sheet configuration for valid sheet name', () => {
      const result = getSheetInfo('المستخدمون');
      expect(result).toEqual({
        name: 'المستخدمون',
        requiredColumns: ['اسم المستخدم', 'الاسم الأول', 'اللقب', 'الدور', 'نوع التوظيف'],
      });
    });

    it('should return sheet info for teachers', () => {
      const result = getSheetInfo('المعلمون');
      expect(result).toEqual({
        name: 'المعلمون',
        requiredColumns: ['الاسم واللقب'],
      });
    });

    it('should return sheet info for students', () => {
      const result = getSheetInfo('الطلاب');
      expect(result.name).toBe('الطلاب');
      expect(result.requiredColumns).toContain('الاسم واللقب');
    });

    it('should return null for invalid sheet name', () => {
      const result = getSheetInfo('InvalidSheet');
      expect(result).toBeNull();
    });

    it('should return null for empty string', () => {
      const result = getSheetInfo('');
      expect(result).toBeNull();
    });
  });

  describe('isSheetAvailable', () => {
    it('should return true for valid sheet names', () => {
      expect(isSheetAvailable('المستخدمون')).toBe(true);
      expect(isSheetAvailable('المعلمون')).toBe(true);
      expect(isSheetAvailable('الطلاب')).toBe(true);
      expect(isSheetAvailable('الفصول')).toBe(true);
      expect(isSheetAvailable('العمليات المالية')).toBe(true);
      expect(isSheetAvailable('الحضور')).toBe(true);
      expect(isSheetAvailable('المجموعات')).toBe(true);
      expect(isSheetAvailable('المخزون')).toBe(true);
    });

    it('should return false for invalid sheet names', () => {
      expect(isSheetAvailable('InvalidSheet')).toBe(false);
      expect(isSheetAvailable('NonExistent')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isSheetAvailable('')).toBe(false);
    });

    it('should return false for null or undefined', () => {
      expect(isSheetAvailable(null)).toBe(false);
      expect(isSheetAvailable(undefined)).toBe(false);
    });
  });

  describe('getAllSheets', () => {
    it('should return all sheet configurations', () => {
      const result = getAllSheets();
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(8);
      expect(result).toEqual(AVAILABLE_SHEETS);
    });

    it('should return sheets with complete structure', () => {
      const result = getAllSheets();
      result.forEach(sheet => {
        expect(sheet).toHaveProperty('name');
        expect(sheet).toHaveProperty('requiredColumns');
        expect(typeof sheet.name).toBe('string');
        expect(Array.isArray(sheet.requiredColumns)).toBe(true);
      });
    });
  });
});
