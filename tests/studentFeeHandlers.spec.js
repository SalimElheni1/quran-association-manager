// tests/studentFeeHandlers.spec.js

// Mock dependencies FIRST before importing modules
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
  normalizeAcademicYear,
  calculateStudentMonthlyCharges,
  triggerChargeRegenerationForStudent,
} = require('../src/main/handlers/studentFeeHandlers');
const db = require('../src/db/db');

describe('Student Fee Handlers', () => {
  beforeEach(() => {
    db.resetMocks();
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
      db.getQuery.mockReset();
      db.allQuery.mockReset();
      db.getQuery.mockResolvedValueOnce({ value: '100' }); // Annual fee setting
      db.getQuery.mockResolvedValue(null); // No existing annual charge
      db.allQuery.mockResolvedValueOnce([{ id: 1 }, { id: 2 }]); // Students
      db.runQuery.mockResolvedValue({ changes: 1 });

      const result = await generateAnnualFeeCharges(academicYear);

      expect(result).toEqual({ success: true, createdCount: 2 });
      expect(db.allQuery).toHaveBeenCalledWith(
        expect.stringContaining("fee_category = 'CAN_PAY' OR fee_category = 'SPONSORED'"),
      );
      expect(db.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO student_fee_charges'),
        expect.any(Array),
      );
    });

    it('should rethrow on mid-loop failure instead of swallowing (BUG-13, no partial commit)', async () => {
      const academicYear = '2024-2025';
      db.getQuery.mockReset();
      db.allQuery.mockReset();
      db.getQuery.mockResolvedValueOnce({ value: '100' }); // Annual fee setting
      db.getQuery.mockResolvedValue(null); // No existing annual charge
      db.allQuery.mockRejectedValue(new Error('Database error'));

      await expect(generateAnnualFeeCharges(academicYear)).rejects.toThrow('Database error');
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
      db.allQuery
        .mockResolvedValueOnce([{ id: 1, gender: 'men', discount_percentage: 0 }]) // Students
        .mockResolvedValueOnce([{ fee_type: 'standard', gender: 'men', monthly_fee: 50 }]); // Enrolled classes
      db.getQuery
        .mockResolvedValueOnce({ value: '50' }) // standard_monthly_fee
        .mockResolvedValueOnce({ value: 'MONTHLY' }) // men_payment_frequency
        .mockResolvedValueOnce({ value: 'MONTHLY' }) // women_payment_frequency
        .mockResolvedValueOnce({ value: 'MONTHLY' }) // kids_payment_frequency
        .mockResolvedValueOnce({ id: 1, amount_paid: 0 }); // Existing charge
      db.runQuery.mockResolvedValue({ changes: 1 });

      await generateMonthlyFeeCharges(academicYear, month, { force: false });

      // Existing charge present + no force -> skip: no DELETE and no INSERT
      expect(db.runQuery).not.toHaveBeenCalledWith(
        expect.stringContaining('DELETE'),
        expect.any(Array),
      );
      expect(db.runQuery).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO student_fee_charges'),
        expect.any(Array),
      );
    });

    it('should force regenerate charges when force=true', async () => {
      const academicYear = '2024-2025';
      const month = 10;
      db.allQuery
        .mockResolvedValueOnce([{ id: 1, gender: 'men', discount_percentage: 0 }]) // Students
        .mockResolvedValueOnce([{ fee_type: 'standard', gender: 'men', monthly_fee: 50 }]); // Enrolled classes
      db.getQuery
        .mockResolvedValueOnce({ value: '50' }) // standard_monthly_fee
        .mockResolvedValueOnce({ value: 'MONTHLY' }) // men_payment_frequency
        .mockResolvedValueOnce({ value: 'MONTHLY' }) // women_payment_frequency
        .mockResolvedValueOnce({ value: 'MONTHLY' }) // kids_payment_frequency
        .mockResolvedValueOnce({ id: 1, amount_paid: 0 }); // Existing unpaid charge
      db.runQuery.mockResolvedValue({ changes: 1 });

      await generateMonthlyFeeCharges(academicYear, month, { force: true });

      // Per-student delete of the unpaid existing charge, then re-insert
      expect(db.runQuery).toHaveBeenCalledWith(
        'DELETE FROM student_fee_charges WHERE id = ?',
        [1],
      );
      expect(db.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO student_fee_charges'),
        expect.any(Array),
      );
    });

    it('should skip ANNUAL-frequency students entirely (annual-only billing)', async () => {
      const academicYear = '2024-2025';
      const month = 10;
      db.getQuery.mockReset();
      db.allQuery.mockReset();
      db.allQuery
        .mockResolvedValueOnce([{ id: 1, gender: 'men', discount_percentage: 0 }]) // Students
        .mockResolvedValueOnce([{ fee_type: 'standard', gender: 'men', monthly_fee: 50 }]); // Enrolled classes
      db.getQuery
        .mockResolvedValueOnce({ value: '50' }) // standard_monthly_fee
        .mockResolvedValueOnce({ value: 'ANNUAL' }) // men_payment_frequency
        .mockResolvedValueOnce({ value: 'ANNUAL' }) // women_payment_frequency
        .mockResolvedValueOnce({ value: 'ANNUAL' }); // kids_payment_frequency
      db.runQuery.mockResolvedValue({ changes: 1 });

      await generateMonthlyFeeCharges(academicYear, month, false, false);

      expect(db.runQuery).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO student_fee_charges'),
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
        expect.stringContaining(
          'SELECT c.id, c.name, c.fee_type, c.monthly_fee, c.gender FROM classes c',
        ),
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
        .mockResolvedValueOnce({
          id: 1,
          name: 'Student 1',
          status: 'active',
          fee_category: 'CAN_PAY',
        }) // Student details
        .mockResolvedValueOnce({ value: '9' }); // Academic year start month
      db.allQuery.mockResolvedValue([]); // No existing charges / enrollments
      db.runQuery.mockResolvedValue({ changes: 1 });

      const result = await triggerChargeRegenerationForStudent(studentId, options);

      expect(result.success).toBe(true);
      // Recreates (deletes) current-month charges for the student, not wrapped in BEGIN/COMMIT
      expect(db.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM student_fee_charges'),
        expect.any(Array),
      );
      expect(db.runQuery).not.toHaveBeenCalledWith('BEGIN TRANSACTION;');
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
        .mockResolvedValueOnce({
          id: 1,
          name: 'Student 1',
          status: 'active',
          fee_category: 'CAN_PAY',
        }) // Student
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
      db.getQuery
        .mockResolvedValueOnce({
          id: 1,
          name: 'Student 1',
          status: 'active',
          fee_category: 'CAN_PAY',
        }) // Student details
        .mockResolvedValueOnce({ value: '9' }) // academic_year_start_month
        .mockRejectedValueOnce(new Error('Database error')); // failure after BEGIN

      await expect(refreshStudentCharges(studentId)).rejects.toThrow(
        'فشل في تحديث الرسوم: Database error',
      );
      expect(db.runQuery).toHaveBeenCalledWith('ROLLBACK;');
    });

    it('should reject a concurrent refresh for the same student (charge-regeneration lock)', async () => {
      db.runQuery.mockResolvedValue({ id: 1, changes: 1 });
      let release;
      db.getQuery.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      );

      const first = refreshStudentCharges(1);

      const second = await refreshStudentCharges(1);
      expect(second).toEqual({
        success: false,
        message: 'Charge refresh already in progress for this student',
      });

      release(null); // Student not found -> first call throws -> lock released
      await expect(first).rejects.toThrow('Student not found');
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

    it('should scope fee status to the given academic year', async () => {
      const studentId = 2;

      db.allQuery.mockResolvedValueOnce([
        { id: 2, amount: 60, amount_paid: 20, fee_type: 'MONTHLY', academic_year: '2025-2026' },
      ]);

      const result = await getStudentFeeStatus(studentId, '2025-2026');

      expect(db.allQuery).toHaveBeenCalledWith(expect.stringContaining('academic_year = ?'), [
        studentId,
        '2025-2026',
      ]);
      expect(result.totalDue).toBe(60);
      expect(result.totalPaid).toBe(20);
      expect(result.balance).toBe(40);
    });

    it('should round balances to cents (no floating-point residue)', async () => {
      const studentId = 3;

      db.allQuery.mockResolvedValueOnce([
        {
          id: 1,
          amount: 33.33,
          amount_paid: 33.33,
          fee_type: 'MONTHLY',
          academic_year: '2024-2025',
        },
        {
          id: 2,
          amount: 66.67,
          amount_paid: 66.67,
          fee_type: 'MONTHLY',
          academic_year: '2024-2025',
        },
      ]);

      const result = await getStudentFeeStatus(studentId);

      expect(result.totalDue).toBe(100);
      expect(result.totalPaid).toBe(100);
      expect(result.balance).toBe(0);
    });

    it('should normalize a bare year when scoping status', async () => {
      const studentId = 4;

      db.allQuery.mockResolvedValueOnce([]);

      await getStudentFeeStatus(studentId, '2026');

      expect(db.allQuery).toHaveBeenCalledWith(expect.stringContaining('academic_year = ?'), [
        studentId,
        '2025-2026',
      ]);
    });
  });

  describe('normalizeAcademicYear', () => {
    it('should keep the canonical YYYY-YYYY format as-is', () => {
      expect(normalizeAcademicYear('2025-2026')).toBe('2025-2026');
    });

    it('should convert a bare year to the academic year ending in it', () => {
      expect(normalizeAcademicYear('2026')).toBe('2025-2026');
    });

    it('should return null for absent values', () => {
      expect(normalizeAcademicYear(null)).toBeNull();
      expect(normalizeAcademicYear(undefined)).toBeNull();
      expect(normalizeAcademicYear('')).toBeNull();
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
      const event = { sender: { userId: 1 } };

      db.runQuery.mockResolvedValue({ id: 1, changes: 1 });
      db.getQuery.mockImplementation((sql) => {
        if (sql.includes('FROM students')) {
          return Promise.resolve({ id: 1, name: 'Student 1', matricule: 'S-001' });
        }
        return Promise.resolve(null); // No duplicate receipt
      });
      db.allQuery.mockImplementation((sql) => {
        if (sql.includes('fee_type !=') || sql.includes("fee_type = 'CREDIT'")) {
          return Promise.resolve([]); // No credit, no outstanding charges
        }
        return Promise.resolve([{ id: 1 }]); // Has unpaid charges -> skip auto-generation
      });

      await recordStudentPayment(event, paymentDetails);

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

    it('should respect custom account_id when passed in paymentDetails', async () => {
      const paymentDetails = {
        student_id: 1,
        amount: 200,
        payment_method: 'تحويل بنكي',
        payment_type: 'رسوم الطلاب',
        academic_year: '2024-2025',
        account_id: 2,
      };
      const event = { sender: { userId: 1 } };

      db.runQuery.mockResolvedValue({ id: 1, changes: 1 });
      db.getQuery.mockImplementation((sql) => {
        if (sql.includes('FROM students')) {
          return Promise.resolve({ id: 1, name: 'Student 1', matricule: 'S-001' });
        }
        return Promise.resolve(null);
      });
      db.allQuery.mockImplementation((sql) => {
        if (sql.includes("fee_type = 'CREDIT'") || sql.includes('fee_type !=')) {
          return Promise.resolve([]);
        }
        return Promise.resolve([{ id: 1 }]);
      });

      await recordStudentPayment(event, paymentDetails);

      expect(db.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO transactions'),
        expect.arrayContaining([2]), // account_id = 2
      );
      expect(db.runQuery).toHaveBeenCalledWith(
        'UPDATE accounts SET current_balance = current_balance + ? WHERE id = ?',
        [200, 2],
      );
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

    it('should reject a receipt already used in the unified transactions table', async () => {
      const paymentDetails = {
        student_id: 1,
        amount: 100,
        payment_method: 'نقدي',
        receipt_number: 'RCP-2024-0042',
      };

      // Student already has unpaid charges, so auto-generation is skipped
      db.allQuery.mockResolvedValueOnce([{ id: 1 }]);
      db.getQuery
        .mockResolvedValueOnce(null) // payments
        .mockResolvedValueOnce(null) // donations
        .mockResolvedValueOnce(null) // student_payments
        .mockResolvedValueOnce({ id: 99 }); // transactions.voucher_number -> duplicate

      await expect(recordStudentPayment(null, paymentDetails)).rejects.toThrow(
        'رقم الوصل الذي أدخلته موجود بالفعل. يرجى استخدام رقم وصل جديد.',
      );

      expect(db.runQuery).toHaveBeenCalledWith('ROLLBACK;');
    });

    it('should handle payment allocation to charges', async () => {
      const paymentDetails = {
        student_id: 1,
        amount: 150,
        payment_method: 'نقدي',
      };
      const event = { sender: { userId: 1 } };

      db.runQuery.mockResolvedValue({ id: 1, changes: 1 });
      db.getQuery.mockImplementation((sql) => {
        if (sql.includes('FROM students')) {
          return Promise.resolve({ id: 1, name: 'Student 1', matricule: 'S-001' });
        }
        return Promise.resolve(null); // No duplicate receipt
      });
      db.allQuery.mockImplementation((sql) => {
        if (sql.includes("fee_type = 'CREDIT'") && sql.includes('amount_paid > 0')) {
          return Promise.resolve([]); // No existing credit
        }
        if (sql.includes('fee_type !=')) {
          return Promise.resolve([
            { id: 1, amount: 100, amount_paid: 0, status: 'UNPAID', fee_type: 'MONTHLY' },
            { id: 2, amount: 100, amount_paid: 0, status: 'UNPAID', fee_type: 'MONTHLY' },
          ]);
        }
        return Promise.resolve([{ id: 1 }]); // Has unpaid charges -> skip auto-generation
      });

      await recordStudentPayment(event, paymentDetails);

      // Should update charges with payment
      expect(db.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE student_fee_charges'),
        expect.any(Array),
      );
    });

    it('should update accounts.current_balance when recording a payment', async () => {
      const paymentDetails = {
        student_id: 1,
        amount: 100,
        payment_method: 'نقدي',
        payment_type: 'رسوم الطلاب',
      };

      const event = { sender: { userId: 1 } };

      db.runQuery.mockResolvedValue({ id: 1, changes: 1 });
      db.getQuery.mockImplementation((sql) => {
        if (sql.includes('FROM students')) {
          return Promise.resolve({ id: 1, name: 'Student 1', matricule: 'S-001' });
        }
        return Promise.resolve(null); // No duplicate receipt
      });
      db.allQuery.mockImplementation((sql) => {
        if (sql.includes("fee_type = 'CREDIT'")) {
          return Promise.resolve([]); // No existing credit
        }
        if (sql.includes('fee_type !=')) {
          return Promise.resolve([]); // No outstanding charges
        }
        return Promise.resolve([{ id: 1 }]); // Has unpaid charges -> skip auto-generation
      });

      await recordStudentPayment(event, paymentDetails);

      expect(db.runQuery).toHaveBeenCalledWith(
        'UPDATE accounts SET current_balance = current_balance + ? WHERE id = ?',
        [paymentDetails.amount, 1],
      );
    });

    it('should apply existing credit to charges before using the new cash', async () => {
      const paymentDetails = {
        student_id: 1,
        amount: 100,
        payment_method: 'نقدي',
      };
      const event = { sender: { userId: 1 } };

      db.runQuery.mockResolvedValue({ id: 1, changes: 1 });
      db.getQuery.mockImplementation((sql) => {
        if (sql.includes('FROM students')) {
          return Promise.resolve({ id: 1, name: 'Student 1', matricule: 'S-001' });
        }
        return Promise.resolve(null); // No duplicate receipt
      });
      db.allQuery.mockImplementation((sql) => {
        if (sql.includes("fee_type = 'CREDIT'") && sql.includes('amount_paid > 0')) {
          return Promise.resolve([{ id: 90, fee_type: 'CREDIT', amount_paid: 40 }]);
        }
        if (sql.includes('fee_type !=')) {
          return Promise.resolve([
            { id: 5, amount: 100, amount_paid: 0, status: 'UNPAID', fee_type: 'MONTHLY' },
          ]);
        }
        return Promise.resolve([{ id: 1 }]); // Has unpaid charges -> skip auto-generation
      });

      await recordStudentPayment(event, paymentDetails);

      // Credit charge 90 fully consumed (40 -> 0)
      expect(db.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE student_fee_charges'),
        [0, 90],
      );

      // Charge 5 fully paid (40 credit + 60 cash)
      expect(db.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE student_fee_charges'),
        [100, 'PAID', 5],
      );

      // Breakdown records the full 100 applied to charge 5
      expect(db.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO student_payment_breakdown'),
        [expect.any(Number), 5, 100],
      );

      // Remaining 40 cash stored as overpayment credit
      expect(db.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO student_fee_charges'),
        expect.arrayContaining([40]),
      );
    });

    it('should prioritize charges of the given class (class_id) during allocation', async () => {
      const paymentDetails = {
        student_id: 1,
        amount: 100,
        payment_method: 'نقدي',
        class_id: 7,
      };
      const event = { sender: { userId: 1 } };

      db.getQuery.mockReset();
      db.allQuery.mockReset();
      db.runQuery.mockResolvedValue({ id: 1, changes: 1 });

      db.getQuery.mockImplementation((sql) => {
        if (sql.includes('FROM students')) {
          return Promise.resolve({ id: 1, name: 'Student 1', matricule: 'S-001' });
        }
        return Promise.resolve(null); // No duplicate receipt
      });
      db.allQuery.mockImplementation((sql) => {
        if (sql.includes("fee_type = 'CREDIT'") && sql.includes('amount_paid > 0')) {
          return Promise.resolve([]); // No existing credit
        }
        if (sql.includes('fee_type !=')) {
          // Class-7 charge is due LATER, so plain FIFO would pay the
          // wrong-class charge (id 2) first.
          return Promise.resolve([
            {
              id: 2,
              amount: 100,
              amount_paid: 0,
              status: 'UNPAID',
              fee_type: 'MONTHLY',
              related_class_id: 5,
              due_date: '2026-01-01',
            },
            {
              id: 1,
              amount: 100,
              amount_paid: 0,
              status: 'UNPAID',
              fee_type: 'MONTHLY',
              related_class_id: 7,
              due_date: '2026-02-01',
            },
          ]);
        }
        return Promise.resolve([{ id: 1 }]); // Has unpaid charges -> skip auto-generation
      });

      await recordStudentPayment(event, paymentDetails);

      // Charge 1 (class 7) is paid first despite the later due date
      expect(db.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO student_payment_breakdown'),
        [expect.any(Number), 1, 100],
      );
      expect(db.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE student_fee_charges'),
        [100, 'PAID', 1],
      );

      // Charge 2 (different class) receives no payment
      expect(db.runQuery).not.toHaveBeenCalledWith(
        expect.stringContaining('UPDATE student_fee_charges'),
        [100, 'PAID', 2],
      );
    });

    it('should write the unified receipt_type (fee_payment) on the payment transaction (D3)', async () => {
      const paymentDetails = {
        student_id: 1,
        amount: 100,
        payment_method: 'نقدي',
        payment_type: 'رسوم الطلاب',
      };
      const event = { sender: { userId: 1 } };

      db.getQuery.mockReset();
      db.allQuery.mockReset();
      db.runQuery.mockReset();
      db.runQuery.mockResolvedValue({ id: 1, changes: 1 });

      db.getQuery.mockImplementation((sql) => {
        if (sql.includes('FROM students')) {
          return Promise.resolve({ id: 1, name: 'Student 1', matricule: 'S-001' });
        }
        return Promise.resolve(null); // No duplicate receipt
      });
      db.allQuery.mockImplementation((sql) => {
        if (sql.includes("fee_type = 'CREDIT'") && sql.includes('amount_paid > 0')) {
          return Promise.resolve([]); // No existing credit
        }
        if (sql.includes('fee_type !=')) {
          return Promise.resolve([]); // No outstanding charges
        }
        return Promise.resolve([{ id: 1 }]); // Has unpaid charges -> skip auto-generation
      });

      await recordStudentPayment(event, paymentDetails);

      // Should create transaction with unified receipt_type
      expect(db.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO transactions'),
        expect.arrayContaining([
          expect.anything(),
          expect.anything(),
          expect.anything(),
          expect.anything(),
          expect.anything(),
          expect.anything(),
          'fee_payment', // receipt_type should be 'fee_payment'
        ]),
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
      expect(handleSpy).toHaveBeenCalledWith(
        'student-fees:generateAnnualCharges',
        expect.any(Function),
      );
      expect(handleSpy).toHaveBeenCalledWith(
        'student-fees:generateMonthlyCharges',
        expect.any(Function),
      );
      expect(handleSpy).toHaveBeenCalledWith('student-fees:getStatus', expect.any(Function));
      expect(handleSpy).toHaveBeenCalledWith('student-fees:recordPayment', expect.any(Function));
      expect(handleSpy).toHaveBeenCalledWith(
        'student-fees:refreshStudentCharges',
        expect.any(Function),
      );
    });
  });

  describe('checkAndGenerateChargesForAllStudents', () => {
    it('should generate missing charges for all students', async () => {
      const settings = {
        academic_year_start_month: '9',
        current_academic_year: '2024-2025',
        annual_fee: '100',
        standard_monthly_fee: '50',
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
