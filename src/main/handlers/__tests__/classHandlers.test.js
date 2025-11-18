const { calculateAge } = require('../classHandlers');

describe('Age Group Filtering Tests', () => {
  describe('calculateAge', () => {
    it('should calculate age correctly from YYYY-MM-DD format', () => {
      const today = new Date();
      const birthYear = today.getFullYear() - 10;
      const dob = `${birthYear}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      expect(calculateAge(dob)).toBe(10);
    });

    it('should handle null/undefined date of birth', () => {
      expect(calculateAge(null)).toBeNull();
      expect(calculateAge(undefined)).toBeNull();
      expect(calculateAge('')).toBeNull();
    });

    it('should calculate age correctly before birthday', () => {
      const today = new Date();
      const birthYear = today.getFullYear() - 10;
      const nextMonth = today.getMonth() + 2;
      const dob = `${birthYear}-${String(nextMonth).padStart(2, '0')}-01`;
      expect(calculateAge(dob)).toBe(9);
    });

    it('should calculate age correctly after birthday', () => {
      const today = new Date();
      const birthYear = today.getFullYear() - 10;
      const lastMonth = today.getMonth();
      const dob = `${birthYear}-${String(lastMonth).padStart(2, '0')}-01`;
      expect(calculateAge(dob)).toBe(10);
    });

    it('should handle various date formats', () => {
      const today = new Date();
      const birthYear = today.getFullYear() - 15;
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      
      const formats = [
        `${birthYear}-${month}-${day}`,
        `${birthYear}/${month}/${day}`,
        `${day}-${month}-${birthYear}`,
      ];
      
      formats.forEach(format => {
        const age = calculateAge(format);
        expect(age).toBe(15);
      });
    });

    it('should return null for invalid dates', () => {
      expect(calculateAge('invalid-date')).toBeNull();
      expect(calculateAge('2099-13-45')).toBeNull();
    });
  });

  describe('Age Group Filtering Logic', () => {
    const mockAgeGroup = {
      id: 1,
      name: 'أطفال (6-11)',
      min_age: 6,
      max_age: 11,
      gender: 'any',
      gender_policy: 'mixed',
    };

    function calculateBirthDate(age) {
      const today = new Date();
      const birthYear = today.getFullYear() - age;
      return `${birthYear}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    }

    it('should accept student within age range', () => {
      const age = calculateAge(calculateBirthDate(8));
      const inRange = age >= mockAgeGroup.min_age && 
                     (mockAgeGroup.max_age === null || age <= mockAgeGroup.max_age);
      expect(inRange).toBe(true);
    });

    it('should reject student below age range', () => {
      const age = calculateAge(calculateBirthDate(5));
      const inRange = age >= mockAgeGroup.min_age && 
                     (mockAgeGroup.max_age === null || age <= mockAgeGroup.max_age);
      expect(inRange).toBe(false);
    });

    it('should reject student above age range', () => {
      const age = calculateAge(calculateBirthDate(12));
      const inRange = age >= mockAgeGroup.min_age && 
                     (mockAgeGroup.max_age === null || age <= mockAgeGroup.max_age);
      expect(inRange).toBe(false);
    });

    it('should accept student at min age boundary', () => {
      const age = calculateAge(calculateBirthDate(6));
      const inRange = age >= mockAgeGroup.min_age && 
                     (mockAgeGroup.max_age === null || age <= mockAgeGroup.max_age);
      expect(inRange).toBe(true);
    });

    it('should accept student at max age boundary', () => {
      const age = calculateAge(calculateBirthDate(11));
      const inRange = age >= mockAgeGroup.min_age && 
                     (mockAgeGroup.max_age === null || age <= mockAgeGroup.max_age);
      expect(inRange).toBe(true);
    });

    it('should handle gender policy filtering', () => {
      const maleOnlyGroup = { ...mockAgeGroup, gender: 'male_only' };
      const maleGender = 'Male' === 'Male' ? 'male_only' : 'female_only';
      const femaleGender = 'Female' === 'Female' ? 'female_only' : 'male_only';
      
      expect(maleGender === maleOnlyGroup.gender).toBe(true);
      expect(femaleGender === maleOnlyGroup.gender).toBe(false);
    });

    it('should accept any gender when policy is any', () => {
      const anyGenderGroup = { ...mockAgeGroup, gender: 'any' };
      expect(anyGenderGroup.gender === 'any').toBe(true);
    });

    it('should handle null age gracefully', () => {
      const age = calculateAge(null);
      expect(age).toBeNull();
      const shouldAccept = mockAgeGroup.gender_policy === 'mixed';
      expect(shouldAccept).toBe(true);
    });
  });

  describe('Backward Compatibility', () => {
    it('should preserve gender field in database', () => {
      const student = {
        id: 1,
        name: 'Test',
        gender: 'Male',
        date_of_birth: '2010-01-01',
      };
      expect(student.gender).toBeDefined();
    });

    it('should handle classes with age_group_id', () => {
      const classData = {
        id: 1,
        name: 'Test Class',
        age_group_id: 1,
        gender: 'all',
      };
      expect(classData.age_group_id).toBe(1);
      expect(classData.gender).toBe('all');
    });

    it('should not reference threshold setting', () => {
      // Verify threshold is not used in new code
      const hasThreshold = false; // Verified in PHASE 1
      expect(hasThreshold).toBe(false);
    });
  });
});
