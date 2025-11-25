// tests/studentFeeHandlers.spec.js

// Mock dependencies FIRST before importing modules
jest.mock('../src/db/db');
jest.mock('../src/main/logger');
jest.mock('../src/main/authMiddleware', () => ({
  requireRoles: jest.fn(() => (handler) => handler),
}));
jest.mock('../src/main/settingsManager');
// Mock validationSchemas to avoid Joi.when() issues during module loading
jest.mock('../src/main/validationSchemas', () => ({
  studentPaymentValidationSchema: {
    validateAsync: jest.fn(),
  },
}));

const { ipcMain } = require('electron');
const {
  registerStudentFeeHandlers,
  generateAnnualFeeCharges,
  generateMonthlyFeeCharges,
  refreshStudentCharges,
  refreshAllStudentCharges,
  getStudentFeeStatus,
  recordStudentPayment,
  checkAndGenerateChargesForAllStudents,
  getCurrentAcademicYear,
  calculateStudentMonthlyCharges,
  triggerChargeRegenerationForStudent,
} = require('../src/main/handlers/studentFeeHandlers');
const db = require('../src/db/db');

describe('Student Fee Handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ============================================
  // HELPER FUNCTIONS
  // ============================================

  describe('getCurrentAcademicYear', () => {
    it('should return correct academic year when month >= start month', () => {
      // September (month 9) or later should start new academic year
      const septemberDate = new Date(2024, 8, 1); // September 1, 2024
      const result = getCurrentAcademicYear(9, septemberDate);
      expect(result).toBe('2024-2025');
    });

    it('should return correct academic year when month < start month', () => {
      // August (month 8) should still be in previous academic year
      const augustDate = new Date(2024, 7, 1); // August 1, 2024
      const result = getCurrentAcademicYear(9, augustDate);
      expect(result).toBe('2023-2024');
    });

    it('should use default start month of September', () => {
      const octoberDate = new Date(2024, 9, 1); // October 1, 2024
      const result = getCurrentAcademicYear(undefined, octoberDate);
      expect(result).toBe('2024-2025');
    });

    it('should handle custom start months', () => {
      // Academic year starting in January
      const januaryDate = new Date(2024, 0, 1); // January 1, 2024
      const result = getCurrentAcademicYear(1, januaryDate);
      expect(result).toBe('2024-2025');

      const decemberDate = new Date(2024, 11, 1); // December 1, 2024
      const resultDec = getCurrentAcademicYear(1, decemberDate);
      expect(resultDec).toBe('2024-2025');
    });
  });

  // ============================================
  // CHARGE GENERATION
  // ============================================

  describe('generateAnnualFeeCharges', () => {
    it('should generate annual charges for eligible students', async () => {
      const academicYear = '2024-2025';
      db.allQuery.mockResolvedValueOnce([
        { id: 1 },
        { id: 2 },
      ]);
      db.getQuery.mockResolvedValue({ value: '100' }); // Annual fee setting
      db.runQuery.mockResolvedValue({ changes: 1 });

      await generateAnnualFeeCharges(academicYear);

      expect(db.runQuery).toHaveBeenCalledWith('BEGIN TRANSACTION;');
      expect(db.allQuery).toHaveBeenCalledWith(
        expect.stringContaining("fee_category = 'CAN_PAY' OR fee_category = 'SPONSORED'"),
      );
      expect(db.runQuery).toHaveBeenCalledWith('COMMIT;');
    });

    it('should rollback transaction on error', async () => {
      const academicYear = '2024-2025';
      db.runQuery.mockResolvedValueOnce({ changes: 1 }); // BEGIN
      db.allQuery.mockRejectedValue(new Error('Database error'));

      await expect(generateAnnualFeeCharges(academicYear)).rejects.toThrow();

      expect(db.runQuery).toHaveBeenCalledWith('BEGIN TRANSACTION;');
      expect(db.runQuery).toHaveBeenCalledWith('ROLLBACK;');
    });
  });

  describe('generateMonthlyFeeCharges', () => {
    it('should generate monthly charges for eligible students', async () => {
      const academicYear = '2024-2025';
      const month = 10; // October
      db.allQuery.mockResolvedValueOnce([
        { id: 1, gender: 'Male', discount_percentage: 0 },
        { id: 2, gender: 'Female', discount_percentage: 10 },
      ]);
      db.getQuery.mockResolvedValue({ value: '50' }); // Monthly fee setting
      db.allQuery.mockResolvedValue([]); // No existing charges
      db.runQuery.mockResolvedValue({ changes: 1 });

      await generateMonthlyFeeCharges(academicYear, month, false, false);

      expect(db.allQuery).toHaveBeenCalledWith(
        expect.stringContaining("fee_category = 'CAN_PAY' OR fee_category = 'SPONSORED'"),
      );
    });

    it('should skip generation if charges exist and force=false', async () => {
      const academicYear = '2024-2025';
      const month = 10;
      db.allQuery.mockResolvedValueOnce([{ id: 1 }]); // Students
      db.allQuery.mockResolvedValueOnce([{ id: 1 }]); // Existing charges
      db.runQuery.mockResolvedValue({ changes: 1 });

      await generateMonthlyFeeCharges(academicYear, month, false, false);

      // Should check for existing charges but not delete them
      expect(db.allQuery).toHaveBeenCalled();
    });

    it('should force regenerate charges when force=true', async () => {
      const academicYear = '2024-2025';
      const month = 10;
      db.allQuery
        .mockResolvedValueOnce([{ id: 1, gender: 'Male', discount_percentage: 0 }])
        .mockResolvedValueOnce([{ id: 1 }]); // Existing charges
      db.getQuery.mockResolvedValue({ value: '50' });
      db.runQuery.mockResolvedValue({ changes: 1 });

      await generateMonthlyFeeCharges(academicYear, month, false, true);

      expect(db.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM student_fee_charges'),
        expect.any(Array),
      );
    });
  });

  // ============================================
  // ENROLLMENT-TRIGGERED CHARGES
  // ============================================

  describe('calculateStudentMonthlyCharges', () => {
    it('should calculate total monthly charges from enrollments', async () => {
      const studentId = 1;
      const month = 10;
      const academicYear = '2024-2025';

      db.allQuery.mockResolvedValueOnce([
        { class_id: 1, has_custom_fee: 0 },
        { class_id: 2, has_custom_fee: 1, custom_fee: 30 },
      ]);
      db.getQuery
        .mockResolvedValueOnce({ value: '50' }) // Monthly fee for males
        .mockResolvedValueOnce({ discount_percentage: 10 }); // Student discount

      const result = await calculateStudentMonthlyCharges(studentId, month, academicYear);

      expect(result).toHaveProperty('standard');
      expect(result).toHaveProperty('custom');
      expect(result).toHaveProperty('total');
      expect(db.allQuery).toHaveBeenCalledWith(
        expect.stringContaining('SELECT c.id, c.name, c.fee_type, c.monthly_fee FROM classes c'),
        [studentId],
      );
    });

    it('should return zero when no enrollments found', async () => {
      const studentId = 1;
      const month = 10;
      const academicYear = '2024-2025';

      db.allQuery.mockResolvedValueOnce([]); // No enrollments

      const result = await calculateStudentMonthlyCharges(studentId, month, academicYear);

      expect(result.total).toBe(0);
      expect(result.standard).toBe(0);
      expect(result.custom).toBe(0);
    });
  });

  describe('triggerChargeRegenerationForStudent', () => {
    it('should regenerate charges for current month on enrollment', async () => {
      const studentId = 1;
      const options = { userId: 1 };

      db.getQuery
        .mockResolvedValueOnce({ value: '9' }) // Academic year start month
        .mockResolvedValueOnce({ id: 1, name: 'Student 1', status: 'active', fee_category: 'CAN_PAY' }); // Student details
      db.allQuery.mockResolvedValue([]); // No existing charges
      db.runQuery.mockResolvedValue({ changes: 1 });

      await triggerChargeRegenerationForStudent(studentId, options);

      expect(db.runQuery).toHaveBeenCalledWith('BEGIN TRANSACTION;');
      expect(db.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM student_fee_charges'),
        expect.any(Array),
      );
      expect(db.runQuery).toHaveBeenCalledWith('COMMIT;');
    });

    it('should prevent race conditions with lock mechanism', async () => {
      const studentId = 1;

      // First call should succeed
      db.getQuery
        .mockResolvedValue({ value: '9' })
        .mockResolvedValue({ id: 1, name: 'Student 1', status: 'active', fee_category: 'CAN_PAY' });
      db.allQuery.mockResolvedValue([]);
      db.runQuery.mockResolvedValue({ changes: 1 });

      const promise1 = triggerChargeRegenerationForStudent(studentId);

      // Second concurrent call should be prevented
      const promise2 = triggerChargeRegenerationForStudent(studentId);

      const [result1, result2] = await Promise.all([promise1, promise2]);

      // One should succeed, one should indicate lock
      const results = [result1, result2];
      expect(results.some((r) => r.message && r.message.includes('already in progress'))).toBe(
        true,
      );
    });
  });

  // ============================================
  // CHARGE REFRESH FUNCTIONS
  // ============================================

  describe('refreshStudentCharges', () => {
    it('should refresh charges for a single student', async () => {
      const studentId = 1;
      const academicYear = '2024-2025';
      const userId = 1;

      db.getQuery
        .mockResolvedValueOnce({ id: 1, name: 'Student 1', status: 'active', fee_category: 'CAN_PAY' }) // Student
        .mockResolvedValueOnce({ value: '9' }) // Academic year start
        .mockResolvedValueOnce(null); // No existing annual charge
      db.allQuery.mockResolvedValue([]); // No charges
      db.runQuery.mockResolvedValue({ changes: 1 });

      const result = await refreshStudentCharges(studentId, academicYear, userId);

      expect(result.success).toBe(true);
      expect(db.runQuery).toHaveBeenCalledWith('BEGIN TRANSACTION;');
      expect(db.runQuery).toHaveBeenCalledWith('COMMIT;');
    });

    it('should handle errors and rollback transaction', async () => {
      const studentId = 1;
      db.runQuery.mockResolvedValueOnce({ changes: 1 }); // BEGIN
      db.getQuery.mockRejectedValue(new Error('Database error'));

      const result = await refreshStudentCharges(studentId);

      expect(result.success).toBe(false);
      expect(db.runQuery).toHaveBeenCalledWith('ROLLBACK;');
    });
  });

  describe('refreshAllStudentCharges', () => {
    it('should refresh charges for all active students', async () => {
      const academicYear = '2024-2025';
      const userId = 1;

      db.allQuery.mockResolvedValueOnce([
        { id: 1, name: 'Student 1', matricule: 'S-001', fee_category: 'CAN_PAY' },
        { id: 2, name: 'Student 2', matricule: 'S-002', fee_category: 'SPONSORED' },
      ]);
      db.getQuery.mockResolvedValue({ value: '9' });
      db.runQuery.mockResolvedValue({ changes: 1 });

      const result = await refreshAllStudentCharges(academicYear, userId);

      expect(result.success).toBe(true);
      expect(result.chargesGenerated).toBeGreaterThan(0);
    });
  });

  // ============================================
  // FEE STATUS & PAYMENT
  // ============================================

  describe('getStudentFeeStatus', () => {
    it('should return fee status for a student', async () => {
      const studentId = 1;

      db.allQuery.mockResolvedValueOnce([
        {
          id: 1,
          amount: 100,
          amount_paid: 50,
          fee_type: 'MONTHLY',
          month: 10,
          academic_year: '2024-2025',
        },
      ]);

      const result = await getStudentFeeStatus(studentId);

      expect(result).toHaveProperty('totalDue');
      expect(result).toHaveProperty('totalPaid');
      expect(result).toHaveProperty('balance');
      expect(result).toHaveProperty('charges');
    });
  });

  describe('recordStudentPayment', () => {
    it('should record payment with sponsor information', async () => {
      const paymentDetails = {
        student_id: 1,
        amount: 100,
        payment_method: 'نقدي',
        payment_type: 'رسوم الطلاب',
        academic_year: '2024-2025',
        sponsor_name: 'Ahmed Ali',
        sponsor_phone: '0123456789',
      };

      db.runQuery.mockResolvedValue({ id: 1, changes: 1 });
      db.getQuery.mockResolvedValue(null); // No duplicate receipt
      db.allQuery.mockResolvedValue([]); // No existing charges

      const result = await recordStudentPayment(null, paymentDetails);

      expect(db.runQuery).toHaveBeenCalledWith('BEGIN TRANSACTION;');
      expect(db.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO student_payments'),
        expect.arrayContaining([
          paymentDetails.student_id,
          paymentDetails.amount,
          paymentDetails.payment_method,
          paymentDetails.payment_type,
          paymentDetails.academic_year,
          undefined, // notes
          undefined, // check_number
          undefined, // receipt_number
          undefined, // class_id
          paymentDetails.sponsor_name,
          paymentDetails.sponsor_phone,
        ]),
      );
      expect(db.runQuery).toHaveBeenCalledWith('COMMIT;');
    });

    it('should reject duplicate receipt numbers', async () => {
      const paymentDetails = {
        student_id: 1,
        amount: 100,
        payment_method: 'نقدي',
        receipt_number: 'RCP-001',
      };

      db.runQuery.mockResolvedValueOnce({ changes: 1 }); // BEGIN
      db.getQuery.mockResolvedValueOnce({ id: 1 }); // Duplicate receipt found

      await expect(recordStudentPayment(null, paymentDetails)).rejects.toThrow(
        'فشل في تسجيل الدفعة. يرجى المحاولة مرة أخرى.',
      );

      expect(db.runQuery).toHaveBeenCalledWith('ROLLBACK;');
    });

    it('should handle payment allocation to charges', async () => {
      const paymentDetails = {
        student_id: 1,
        amount: 150,
        payment_method: 'نقدي',
      };

      db.runQuery.mockResolvedValue({ id: 1, changes: 1 });
      db.getQuery.mockResolvedValue(null);
      db.allQuery
        .mockResolvedValueOnce([]) // No credit charges
        .mockResolvedValueOnce([
          // Unpaid charges
          { id: 1, amount: 100, amount_paid: 0 },
          { id: 2, amount: 100, amount_paid: 0 },
        ]);

      await recordStudentPayment(null, paymentDetails);

      // Should update charges with payment
      expect(db.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE student_fee_charges'),
        expect.any(Array),
      );
    });
  });

  // ============================================
  // IPC HANDLERS
  // ============================================

  describe('registerStudentFeeHandlers', () => {
    it('should register all IPC handlers', () => {
      const handleSpy = jest.spyOn(ipcMain, 'handle');

      registerStudentFeeHandlers();

      // Verify key handlers are registered
      expect(handleSpy).toHaveBeenCalledWith('student-fees:generateAnnualCharges', expect.any(Function));
      expect(handleSpy).toHaveBeenCalledWith('student-fees:generateMonthlyCharges', expect.any(Function));
      expect(handleSpy).toHaveBeenCalledWith('student-fees:getStatus', expect.any(Function));
      expect(handleSpy).toHaveBeenCalledWith('student-fees:recordPayment', expect.any(Function));
      expect(handleSpy).toHaveBeenCalledWith('student-fees:refreshStudentCharges', expect.any(Function));
    });
  });

  describe('checkAndGenerateChargesForAllStudents', () => {
    it('should generate missing charges for all students', async () => {
      const settings = {
        academic_year_start_month: '9',
        current_academic_year: '2024-2025',
      };

      db.allQuery.mockResolvedValueOnce([{ id: 1 }, { id: 2 }]); // Students
      db.getQuery.mockResolvedValue({ value: '50' });
      db.runQuery.mockResolvedValue({ changes: 1 });

      await checkAndGenerateChargesForAllStudents(settings);

      expect(db.allQuery).toHaveBeenCalledWith(
        expect.stringContaining("fee_category = 'CAN_PAY' OR fee_category = 'SPONSORED'"),
      );
    });
  });
});
