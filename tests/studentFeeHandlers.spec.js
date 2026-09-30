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
  getStudentBalanceSummary,
  getStudentPreviousYearsArrears,
  resolveStudentFeeGroup,
  setStudentFeeGroup,
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
    const standardClass = { id: 7, fee_type: 'standard', monthly_fee: null };

    // Branch fees from the settings; classes per student (payment system from the age group).
    const mockMonthlyBilling = ({
      monthlyFee = 50,
      students,
      classesOf,
      existingCharge = null,
    }) => {
      db.getQuery.mockImplementation((sql, params) => {
        if (sql.includes('FROM settings')) {
          return Promise.resolve(
            params[0] === 'standard_monthly_fee' && monthlyFee
              ? { value: String(monthlyFee) }
              : null,
          );
        }
        if (sql.includes('billing_month')) return Promise.resolve(existingCharge);
        return Promise.resolve(null);
      });
      db.allQuery.mockImplementation((sql, params) => {
        if (sql.includes('FROM students')) return Promise.resolve(students);
        if (sql.includes('GROUP BY ag.id')) return Promise.resolve([]); // no age group fees
        return Promise.resolve(classesOf(params[0]));
      });
      db.runQuery.mockResolvedValue({ changes: 1 });
    };

    const insertedCharges = () =>
      db.runQuery.mock.calls
        .filter(([sql]) => sql.includes('INSERT INTO student_fee_charges'))
        .map(([, params]) => params);

    it('bills each eligible student the monthly fee, less their discount', async () => {
      mockMonthlyBilling({
        students: [
          { id: 1, discount_percentage: 0 },
          { id: 2, discount_percentage: 10 },
        ],
        classesOf: () => [{ ...standardClass, payment_frequency: 'MONTHLY' }],
      });

      const result = await generateMonthlyFeeCharges('2024-2025', 10);

      expect(result).toEqual({ success: true, createdCount: 2 });
      expect(db.allQuery).toHaveBeenCalledWith(
        expect.stringContaining("fee_category = 'CAN_PAY' OR fee_category = 'SPONSORED'"),
      );
      const charges = insertedCharges();
      expect(charges).toHaveLength(2);
      // [student_id, charge_date, description, amount, academic_year, frequency, billing_month, class]
      expect(charges[0]).toEqual([
        1,
        expect.any(String),
        'رسوم شهرية أكتوبر - 2024-2025',
        50,
        '2024-2025',
        'MONTHLY',
        '2024-2025-10',
        7,
      ]);
      expect(charges[1][0]).toBe(2);
      expect(charges[1][3]).toBe(45);
    });

    it('skips students already billed for the month when not forced', async () => {
      mockMonthlyBilling({
        students: [{ id: 1, discount_percentage: 0 }],
        classesOf: () => [{ ...standardClass, payment_frequency: 'MONTHLY' }],
        existingCharge: { id: 1, amount_paid: 0 },
      });

      const result = await generateMonthlyFeeCharges('2024-2025', 10, { force: false });

      expect(result).toEqual({ success: true, createdCount: 0 });
      expect(db.runQuery).not.toHaveBeenCalled();
    });

    it('replaces an unpaid charge of the month when forced', async () => {
      mockMonthlyBilling({
        students: [{ id: 1, discount_percentage: 0 }],
        classesOf: () => [{ ...standardClass, payment_frequency: 'MONTHLY' }],
        existingCharge: { id: 1, amount_paid: 0 },
      });

      await generateMonthlyFeeCharges('2024-2025', 10, { force: true });

      expect(db.runQuery).toHaveBeenCalledWith('DELETE FROM student_fee_charges WHERE id = ?', [1]);
      expect(insertedCharges()).toHaveLength(1);
    });

    it('never replaces a charge that already has a payment, even when forced', async () => {
      mockMonthlyBilling({
        students: [{ id: 1, discount_percentage: 0 }],
        classesOf: () => [{ ...standardClass, payment_frequency: 'MONTHLY' }],
        existingCharge: { id: 1, amount_paid: 20 },
      });

      await generateMonthlyFeeCharges('2024-2025', 10, { force: true });

      expect(db.runQuery).not.toHaveBeenCalled();
    });

    it('gives no monthly charge to a student whose age group pays annually', async () => {
      mockMonthlyBilling({
        students: [
          { id: 1, discount_percentage: 0 },
          { id: 2, discount_percentage: 0 },
        ],
        // Student 1's standard class is in an ANNUAL age group; student 2's in a MONTHLY one.
        classesOf: (studentId) => [
          { ...standardClass, payment_frequency: studentId === 1 ? 'ANNUAL' : 'MONTHLY' },
        ],
      });

      const result = await generateMonthlyFeeCharges('2024-2025', 10);

      expect(result.createdCount).toBe(1);
      expect(insertedCharges().map(([studentId]) => studentId)).toEqual([2]);
    });

    it('adds the fee of a special class to the standard fee', async () => {
      mockMonthlyBilling({
        students: [{ id: 1, discount_percentage: 0 }],
        classesOf: () => [
          { ...standardClass, payment_frequency: 'MONTHLY' },
          { id: 8, fee_type: 'special', monthly_fee: 30, payment_frequency: 'MONTHLY' },
        ],
      });

      await generateMonthlyFeeCharges('2024-2025', 10);

      const [charge] = insertedCharges();
      expect(charge[3]).toBe(80);
      expect(charge[7]).toBeNull(); // two classes: no single related class
    });

    it('does nothing when no monthly fee and no special class is configured', async () => {
      mockMonthlyBilling({ monthlyFee: 0, students: [{ id: 1 }], classesOf: () => [] });

      const result = await generateMonthlyFeeCharges('2024-2025', 10);

      expect(result).toEqual({ success: true, message: 'Skipped: Fee not configured' });
      expect(db.allQuery).not.toHaveBeenCalled();
      expect(db.runQuery).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // ENROLLMENT-TRIGGERED CHARGES
  // ============================================

  describe('calculateStudentMonthlyCharges', () => {
    it('adds special class fees to the standard fee, then applies the discount', async () => {
      db.getQuery.mockImplementation((sql, params) => {
        if (sql.includes('FROM settings')) {
          return Promise.resolve(params[0] === 'standard_monthly_fee' ? { value: '50' } : null);
        }
        return Promise.resolve({ discount_percentage: 10, fee_age_group_id: null });
      });
      db.allQuery.mockImplementation((sql) => {
        if (sql.includes('GROUP BY ag.id')) return Promise.resolve([]); // no age group fees
        return Promise.resolve([
          {
            id: 1,
            name: 'حلقة',
            fee_type: 'standard',
            monthly_fee: null,
            payment_frequency: 'MONTHLY',
          },
          {
            id: 2,
            name: 'تجويد',
            fee_type: 'special',
            monthly_fee: 30,
            payment_frequency: 'MONTHLY',
          },
        ]);
      });

      const result = await calculateStudentMonthlyCharges(1, 10, '2024-2025');

      expect(result).toEqual({ standard: 50, custom: 30, total: 72, relatedClassId: null });
      // Classes are read with their age group's payment system.
      expect(db.allQuery).toHaveBeenCalledWith(
        expect.stringContaining('LEFT JOIN age_groups ag ON ag.id = c.age_group_id'),
        [1],
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
    });

    it('should handle errors and rollback transaction', async () => {
      const studentId = 1;
      db.getQuery
        .mockResolvedValueOnce({
          id: 1,
          name: 'Student 1',
          status: 'active',
          fee_category: 'CAN_PAY',
        }) // Student details
        .mockResolvedValueOnce({ value: '9' }) // academic_year_start_month
        .mockRejectedValueOnce(new Error('Database error')); // failure during refresh

      await expect(refreshStudentCharges(studentId)).rejects.toThrow(
        'فشل في تحديث الرسوم: Database error',
      );
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
      db.allQuery.mockResolvedValue([]); // no monthly work in this test
      // Settings return 120; neither student has an annual charge yet.
      db.getQuery.mockImplementation(async (sql) =>
        sql.includes('FROM settings') ? { value: '120' } : null,
      );
      db.runQuery.mockResolvedValue({ changes: 1 });

      const result = await refreshAllStudentCharges(academicYear, userId);

      expect(result.success).toBe(true);
      expect(result.chargesGenerated).toBe(2);
      expect(db.runQuery).toHaveBeenCalledWith(
        expect.stringContaining("VALUES (?, ?, 'ANNUAL'"),
        expect.arrayContaining([1, 120]),
      );
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

      expect(result).toMatchObject({ totalDue: 100, totalPaid: 50, balance: 50 });
      expect(result.charges).toHaveLength(1);
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

    it('counts credit from any year with the requested year and keeps it out of arrears', async () => {
      const studentId = 5;
      db.allQuery.mockResolvedValueOnce([
        { id: 1, amount: 30, amount_paid: 0, fee_type: 'MONTHLY', academic_year: '2026-2027' },
        { id: 2, amount: 0, amount_paid: 20, fee_type: 'CREDIT', academic_year: '2025-2026' },
      ]);

      const result = await getStudentFeeStatus(studentId, '2026-2027');

      expect(db.allQuery).toHaveBeenCalledWith(
        expect.stringContaining("(academic_year = ? OR fee_type = 'CREDIT')"),
        [studentId, '2026-2027'],
      );
      expect(result.totalCredit).toBe(20);
      expect(result.balance).toBe(10);

      db.allQuery.mockResolvedValueOnce([]);
      await getStudentPreviousYearsArrears(studentId, '2026-2027');
      expect(db.allQuery).toHaveBeenLastCalledWith(
        expect.stringContaining("fee_type != 'CREDIT'"),
        [studentId, '2026-2027'],
      );
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
        if (sql.includes('FROM settings')) {
          return Promise.resolve({ value: '2024-2025' });
        }
        if (sql.includes('FROM student_payments') && sql.includes('WHERE id =')) {
          return Promise.resolve({ id: 1, student_id: 1, amount: 100 });
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

      db.getQuery.mockImplementation((sql) => {
        if (sql.includes('receipt_number')) {
          return Promise.resolve({ id: 1 });
        }
        return Promise.resolve(null);
      });

      await expect(recordStudentPayment(null, paymentDetails)).rejects.toThrow(
        'رقم الوصل الذي أدخلته موجود بالفعل. يرجى استخدام رقم وصل جديد.',
      );
    });

    it('should reject a receipt already used in the unified transactions table', async () => {
      const paymentDetails = {
        student_id: 1,
        amount: 100,
        payment_method: 'نقدي',
        receipt_number: 'RCP-2024-0042',
      };

      // Only the unified transactions table already holds this receipt (as a voucher number).
      db.getQuery.mockImplementation((sql) =>
        Promise.resolve(
          sql.includes('FROM transactions WHERE voucher_number = ? AND voided_at IS NULL')
            ? { id: 99 }
            : null,
        ),
      );

      await expect(recordStudentPayment(null, paymentDetails)).rejects.toThrow(
        'رقم الوصل الذي أدخلته موجود بالفعل. يرجى استخدام رقم وصل جديد.',
      );
      expect(db.runQuery).not.toHaveBeenCalled();
    });

    it('lets a receipt number of a voided payment be used again', async () => {
      db.runQuery.mockResolvedValue({ id: 1, changes: 1 });
      db.getQuery.mockResolvedValue(null);
      db.allQuery.mockResolvedValue([]);

      await recordStudentPayment(null, {
        student_id: 1,
        amount: 10,
        payment_method: 'CASH',
        academic_year: '2025-2026',
        receipt_number: 'RCP-7',
      });

      expect(db.getQuery).toHaveBeenCalledWith(
        'SELECT id FROM student_payments WHERE receipt_number = ? AND voided_at IS NULL',
        ['RCP-7'],
      );
      expect(db.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO student_payments'),
        expect.any(Array),
      );
    });

    it('refuses a payment for a deleted student', async () => {
      db.getQuery.mockImplementation((sql) =>
        Promise.resolve(
          sql.includes('SELECT deleted_at FROM students') ? { deleted_at: '2026-09-29' } : null,
        ),
      );

      await expect(
        recordStudentPayment(null, { student_id: 1, amount: 10, payment_method: 'CASH' }),
      ).rejects.toThrow('هذا الطالب محذوف. استعِده أولاً لتسجيل دفعة له.');
      expect(db.runQuery).not.toHaveBeenCalled();
    });

    it('hides a database error behind a message the user can act on', async () => {
      db.getQuery.mockResolvedValue(null);
      db.runQuery.mockRejectedValue(new Error('SQLITE_CONSTRAINT: something internal'));

      await expect(
        recordStudentPayment(null, {
          student_id: 1,
          amount: 10,
          payment_method: 'CASH',
          academic_year: '2025-2026',
        }),
      ).rejects.toThrow('فشل في تسجيل الدفعة. يرجى المحاولة مرة أخرى.');
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

      // Oldest charge first: 100 settles charge 1, the remaining 50 partly pays charge 2.
      expect(db.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE student_fee_charges'),
        [100, 'PAID', 1],
      );
      expect(db.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE student_fee_charges'),
        [50, 'PARTIALLY_PAID', 2],
      );
      // Nothing left over, so no credit is created.
      expect(db.runQuery).not.toHaveBeenCalledWith(
        expect.stringContaining("'CREDIT'"),
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

      // The 40 of credit it used is recorded against the credit charge, so a delete or
      // refund of this payment gives it back
      expect(db.runQuery).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO student_payment_breakdown'),
        [expect.any(Number), 90, -40],
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
        expect.stringContaining("'fee_payment'"),
        expect.any(Array),
      );
    });
  });

  // ============================================
  // IPC HANDLERS
  // ============================================

  describe('fees per age group', () => {
    const branch = { annual: 30, monthly: 20 };
    const kids = { id: 1, name: 'الأطفال', annual_fee: null, monthly_fee: null };
    const men = { id: 2, name: 'الرجال', annual_fee: 50, monthly_fee: 35 };

    const mockGroups = (groups, feeAgeGroupId = null) => {
      db.allQuery.mockImplementation((sql) =>
        Promise.resolve(sql.includes('age_groups ag') ? groups : []),
      );
      db.getQuery.mockImplementation((sql) =>
        Promise.resolve(
          sql.includes('FROM students')
            ? {
                id: 7,
                name: 'Student',
                status: 'active',
                fee_category: 'CAN_PAY',
                fee_age_group_id: feeAgeGroupId,
              }
            : null,
        ),
      );
    };

    it('uses the branch fees for a student in no age group', async () => {
      mockGroups([]);
      await expect(resolveStudentFeeGroup(1, branch)).resolves.toMatchObject({
        annualFee: 30,
        monthlyFee: 20,
        group: null,
        needsChoice: false,
      });
    });

    it('uses the group fees, falling back to the branch fees when a group has none', async () => {
      mockGroups([men]);
      await expect(resolveStudentFeeGroup(1, branch)).resolves.toMatchObject({
        annualFee: 50,
        monthlyFee: 35,
        needsChoice: false,
      });
      mockGroups([kids]);
      await expect(resolveStudentFeeGroup(1, branch)).resolves.toMatchObject({
        annualFee: 30,
        monthlyFee: 20,
      });
    });

    it('applies the higher fee and asks for a choice when groups differ', async () => {
      mockGroups([kids, men]);
      await expect(resolveStudentFeeGroup(1, branch)).resolves.toMatchObject({
        monthlyFee: 35,
        group: expect.objectContaining({ id: 2 }),
        needsChoice: true,
      });
    });

    it('defaults an annually billed student to the ANNUAL group with the higher annual fee', async () => {
      const monthlyGroup = {
        ...men,
        monthly_fee: 40,
        payment_frequency: 'MONTHLY',
        has_standard: 1,
      };
      const annualGroup = {
        id: 4,
        name: 'الكبار',
        annual_fee: 120,
        monthly_fee: 10,
        payment_frequency: 'ANNUAL',
        has_standard: 1,
      };
      mockGroups([monthlyGroup, annualGroup]);
      await expect(resolveStudentFeeGroup(1, branch)).resolves.toMatchObject({
        annualFee: 120,
        group: expect.objectContaining({ id: 4 }),
        needsChoice: true,
      });
    });

    it('ignores an ANNUAL group reached only through a special class', async () => {
      const monthlyGroup = { ...men, payment_frequency: 'MONTHLY', has_standard: 1 };
      const annualSpecialOnly = {
        id: 4,
        name: 'الكبار',
        annual_fee: 120,
        monthly_fee: 10,
        payment_frequency: 'ANNUAL',
        has_standard: 0,
      };
      mockGroups([monthlyGroup, annualSpecialOnly]);
      await expect(resolveStudentFeeGroup(1, branch)).resolves.toMatchObject({
        monthlyFee: 35,
        group: expect.objectContaining({ id: 2 }),
      });
    });

    it("uses the administrator's choice", async () => {
      mockGroups([kids, men], 1);
      await expect(resolveStudentFeeGroup(1, branch)).resolves.toMatchObject({
        annualFee: 30,
        monthlyFee: 20,
        group: expect.objectContaining({ id: 1 }),
        needsChoice: false,
      });
    });

    it('needs no choice when the groups have the same fees', async () => {
      mockGroups([kids, { ...kids, id: 3, name: 'الناشئون' }]);
      await expect(resolveStudentFeeGroup(1, branch)).resolves.toMatchObject({
        needsChoice: false,
      });
    });

    it('rejects a group that is not one of the student classes', async () => {
      mockGroups([kids, men]);
      await expect(setStudentFeeGroup(1, 99)).rejects.toThrow('ليست من فئات فصول هذا الطالب');
      expect(db.runQuery).not.toHaveBeenCalledWith(
        expect.stringContaining('UPDATE students SET fee_age_group_id'),
        expect.anything(),
      );
    });

    it('saves the choice and re-bills the unpaid annual charge', async () => {
      mockGroups([kids, men]);
      db.runQuery.mockResolvedValue({ changes: 1 });
      await setStudentFeeGroup(7, 1);
      expect(db.runQuery).toHaveBeenCalledWith(
        'UPDATE students SET fee_age_group_id = ? WHERE id = ?',
        [1, 7],
      );
      expect(db.runQuery).toHaveBeenCalledWith(
        expect.stringContaining("fee_type = 'ANNUAL'"),
        expect.arrayContaining([7]),
      );
    });
  });

  describe('previous academic years', () => {
    const charges = [
      // 2025-2026: 20 of 30 paid, with 5 of credit left -> 5 owed
      { id: 1, academic_year: '2025-2026', fee_type: 'ANNUAL', amount: 30, amount_paid: 20 },
      { id: 2, academic_year: '2025-2026', fee_type: 'CREDIT', amount: 0, amount_paid: 5 },
      // 2024-2025: fully paid -> not arrears
      { id: 3, academic_year: '2024-2025', fee_type: 'MONTHLY', amount: 20, amount_paid: 20 },
    ];

    it('lists only earlier years that still have a balance, with their totals', async () => {
      db.allQuery.mockResolvedValue(charges);

      const arrears = await getStudentPreviousYearsArrears(7, '2026-2027');

      expect(db.allQuery).toHaveBeenCalledWith(expect.stringContaining('academic_year < ?'), [
        7,
        '2026-2027',
      ]);
      expect(arrears).toEqual([
        expect.objectContaining({
          academicYear: '2025-2026',
          totalDue: 30,
          totalPaid: 20,
          totalCredit: 5,
          balance: 5,
        }),
      ]);
    });

    it('keeps earlier years out of the balance summary of an academic year', async () => {
      const current = [
        { id: 9, academic_year: '2026-2027', fee_type: 'ANNUAL', amount: 30, amount_paid: 30 },
      ];
      db.allQuery.mockImplementation((sql) =>
        Promise.resolve(sql.includes('academic_year < ?') ? charges : current),
      );

      const summary = await getStudentBalanceSummary(7, '2026-2027');

      expect(summary).toMatchObject({
        totalDue: 30,
        totalPaid: 30,
        balance: 0,
        previousYearsBalance: 5,
        displayType: 'owed',
        displayAmount: 0,
      });
      expect(summary.previousYears).toHaveLength(1);
    });

    it('only settles charges of the payment academic year', async () => {
      db.runQuery.mockResolvedValue({ id: 1, changes: 1 });
      db.getQuery.mockImplementation((sql) =>
        Promise.resolve(sql.includes('FROM students') ? { id: 1, name: 'Student 1' } : null),
      );
      db.allQuery.mockResolvedValue([]);

      await recordStudentPayment(
        { sender: { userId: 1 } },
        { student_id: 1, amount: 20, payment_method: 'CASH', academic_year: '2025-2026' },
      );

      expect(db.allQuery).toHaveBeenCalledWith(
        expect.stringMatching(/fee_type != 'CREDIT'\s+AND academic_year = \?/),
        [1, '2025-2026'],
      );
    });
  });

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
    const settings = { academic_year_start_month: 9, annual_fee: '100', standard_monthly_fee: '0' };

    it('skips everything while no fee is configured for the branch or an age group', async () => {
      const result = await checkAndGenerateChargesForAllStudents({
        ...settings,
        annual_fee: '0',
      });

      expect(result).toEqual({
        success: true,
        studentsProcessed: 0,
        skipped: true,
        message: 'Fees not configured',
      });
      expect(db.runQuery).not.toHaveBeenCalled();
    });

    it('bills the annual fee of the current academic year to every eligible student', async () => {
      db.getQuery.mockImplementation((sql, params) =>
        Promise.resolve(
          sql.includes('FROM settings') && params[0] === 'annual_fee' ? { value: '100' } : null,
        ),
      );
      db.allQuery.mockImplementation((sql) =>
        Promise.resolve(sql.includes('FROM students') ? [{ id: 1 }, { id: 2 }] : []),
      );
      db.runQuery.mockResolvedValue({ changes: 1 });

      const result = await checkAndGenerateChargesForAllStudents(settings);

      expect(result).toEqual({ success: true, studentsProcessed: 2 });
      const annual = db.runQuery.mock.calls.filter(([sql]) => sql.includes("'ANNUAL'"));
      expect(annual.map(([, params]) => [params[0], params[3], params[4]])).toEqual([
        [1, 100, getCurrentAcademicYear(9)],
        [2, 100, getCurrentAcademicYear(9)],
      ]);
      // No monthly fee configured: no monthly charges.
      expect(db.runQuery).not.toHaveBeenCalledWith(
        expect.stringContaining("'MONTHLY'"),
        expect.any(Array),
      );
    });
  });
});
