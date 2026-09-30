const { ipcMain } = require('electron');
const {
  registerStudentFeeHandlers,
  triggerChargeRegenerationForStudent,
  calculateStudentMonthlyCharges,
} = require('../src/main/handlers/studentFeeHandlers');
const db = require('../src/db/db');
const { error: logError } = require('../src/main/logger');

// Mock dependencies
jest.mock('../src/main/logger');
jest.mock('../src/main/authMiddleware', () => ({
  requireRoles: jest.fn(() => (handler) => handler),
}));
jest.mock('../src/main/services/receiptService', () => ({
  generateReceiptNumber: jest.fn(),
  getReceiptBookStats: jest.fn(),
  validateReceiptNumber: jest.fn(),
}));
jest.mock('../src/main/validationSchemas', () => ({
  studentPaymentValidationSchema: {
    validateAsync: jest.fn(),
  },
}));

describe('Student Fee Handlers - Comprehensive Tests', () => {
  beforeAll(() => {
    registerStudentFeeHandlers();
  });

  afterEach(() => {
    db.resetMocks();
    jest.clearAllMocks();
  });

  // ============================================
  // MISSING IPC HANDLER TESTS
  // ============================================

  describe('student-fees:generateAllCharges', () => {
    const currentMonth = new Date().getMonth() + 1;
    const billingMonth = `2024-2025-${String(currentMonth).padStart(2, '0')}`;

    const mockBranch = ({ existingMonthly = null } = {}) => {
      db.getQuery.mockImplementation((sql, params) => {
        if (sql.includes('FROM settings')) {
          if (params[0] === 'annual_fee') return Promise.resolve({ value: '100' });
          if (params[0] === 'standard_monthly_fee') return Promise.resolve({ value: '50' });
          return Promise.resolve(null);
        }
        if (sql.includes('billing_month')) return Promise.resolve(existingMonthly);
        return Promise.resolve(null);
      });
      db.allQuery.mockImplementation((sql) =>
        Promise.resolve(sql.includes('FROM students') ? [{ id: 1, discount_percentage: 0 }] : []),
      );
      db.runQuery.mockResolvedValue({ changes: 1 });
    };

    it('bills the annual fee and the current month only, in one transaction', async () => {
      mockBranch();

      const result = await ipcMain.invoke('student-fees:generateAllCharges', '2024-2025');

      expect(result).toEqual({ success: true, message: 'تم إنشاء جميع الرسوم بنجاح' });
      const inserts = db.runQuery.mock.calls.filter(([sql]) =>
        sql.includes('INSERT INTO student_fee_charges'),
      );
      expect(inserts).toHaveLength(2);
      expect(inserts[0][0]).toContain("'ANNUAL'");
      expect(inserts[0][1]).toEqual([
        1,
        expect.any(String),
        'رسوم سنوية - 2024-2025',
        100,
        '2024-2025',
      ]);
      expect(inserts[1][0]).toContain("'MONTHLY'");
      expect(inserts[1][1][3]).toBe(50);
      expect(inserts[1][1][6]).toBe(billingMonth);
    });

    it('passes a failure on to the renderer', async () => {
      db.withTransaction.mockRejectedValueOnce(new Error('Database error'));

      await expect(ipcMain.invoke('student-fees:generateAllCharges', '2024-2025')).rejects.toThrow(
        'Database error',
      );
    });

    it('replaces the unpaid charge of the current month when forced', async () => {
      mockBranch({ existingMonthly: { id: 12, amount_paid: 0 } });

      await ipcMain.invoke('student-fees:generateAllCharges', '2024-2025', true);

      expect(db.runQuery).toHaveBeenCalledWith(
        'DELETE FROM student_fee_charges WHERE id = ?',
        [12],
      );
    });
  });

  describe('student-fees:refreshAllStudentCharges', () => {
    it('should refresh charges for all eligible students', async () => {
      const mockStudents = [
        { id: 1, name: 'Ahmed', matricule: 'S-001' },
        { id: 2, name: 'Sara', matricule: 'S-002' },
      ];

      db.allQuery
        .mockResolvedValueOnce(mockStudents) // eligible students query
        .mockResolvedValue([]); // fallback for any nested queries

      const result = await ipcMain.invoke('student-fees:refreshAllStudentCharges', {
        academicYear: '2024-2025',
      });

      expect(result.success).toBe(true);
      expect(result.studentsProcessed).toBe(2);
      expect(db.allQuery).toHaveBeenCalledWith(
        expect.stringContaining("fee_category IN ('CAN_PAY', 'SPONSORED')"),
      );
    });

    it('should return success message when no eligible students exist', async () => {
      db.allQuery.mockResolvedValue([]); // no eligible students

      const result = await ipcMain.invoke('student-fees:refreshAllStudentCharges', {
        academicYear: '2024-2025',
      });

      expect(result.success).toBe(true);
      expect(result.studentsProcessed).toBe(0);
      expect(result.chargesGenerated).toBe(0);
      expect(result.message).toContain('لا توجد طلاب مؤهلون لتوليد الرسوم');
    });
  });

  // ============================================
  // RECEIPT MANAGEMENT TESTS
  // ============================================

  describe('Receipt Management Handlers', () => {
    const mockReceiptService = require('../src/main/services/receiptService');

    it('receipts:generate should generate receipt number', async () => {
      mockReceiptService.generateReceiptNumber.mockResolvedValue({
        receiptNumber: 'RCP-2024-001',
        bookId: 1,
        isUsed: false,
      });

      const result = await ipcMain.invoke('receipts:generate', { receiptType: 'fee_payment' });

      // Recorded under the logged-in user of the session (the mock invoke logs in user 1).
      expect(mockReceiptService.generateReceiptNumber).toHaveBeenCalledWith('fee_payment', 1);
      expect(result).toHaveProperty('receiptNumber', 'RCP-2024-001');
    });

    it('receipts:getStats should return receipt book statistics', async () => {
      const mockStats = {
        totalReceipts: 100,
        usedReceipts: 75,
        availableReceipts: 25,
        nextReceiptNumber: 'RCP-2024-076',
      };
      mockReceiptService.getReceiptBookStats.mockResolvedValue(mockStats);

      const result = await ipcMain.invoke('receipts:getStats', 2024);

      expect(mockReceiptService.getReceiptBookStats).toHaveBeenCalledWith(2024);
      expect(result).toEqual(mockStats);
    });

    it('receipts:validate should validate receipt number format', async () => {
      const mockValidation = { isValid: true, normalized: 'RCP-2024-001' };
      mockReceiptService.validateReceiptNumber.mockResolvedValue(mockValidation);

      const result = await ipcMain.invoke('receipts:validate', 'RCP-2024-001');

      expect(mockReceiptService.validateReceiptNumber).toHaveBeenCalledWith('RCP-2024-001');
      expect(result).toEqual(mockValidation);
    });
  });

  // ============================================
  // RACE CONDITION HANDLING TESTS
  // ============================================

  describe('Charge Regeneration Lock Mechanism', () => {
    it('should prevent concurrent charge regeneration for same student', async () => {
      const studentId = 123;

      // Ensure student query returns valid student so it doesn't exit early
      db.getQuery
        .mockResolvedValueOnce({ value: '9' }) // academic_year_start_month setting for first call
        .mockResolvedValueOnce({
          id: studentId,
          name: 'Student 1',
          status: 'active',
          fee_category: 'CAN_PAY',
        }) // student details for first call
        .mockResolvedValueOnce({ value: '9' }) // academic_year_start_month setting for second call
        .mockResolvedValueOnce({
          id: studentId,
          name: 'Student 1',
          status: 'active',
          fee_category: 'CAN_PAY',
        }); // student details for second call
      db.allQuery.mockResolvedValue([]); // No existing charges
      db.runQuery.mockResolvedValue({ changes: 1 });

      const promise1 = triggerChargeRegenerationForStudent(studentId);
      const promise2 = triggerChargeRegenerationForStudent(studentId);

      const [result1, result2] = await Promise.all([promise1, promise2]);

      // One should succeed, one should fail with lock message
      const hasLockError =
        result1.message?.includes('already in progress') ||
        result2.message?.includes('already in progress');
      expect(hasLockError).toBe(true);
      // Explicitly check for the lock message on the failed result
      if (result1.success === false) {
        expect(result1.message).toContain('already in progress');
      } else {
        expect(result2.message).toContain('already in progress');
      }
    });

    it('should release lock after successful regeneration', async () => {
      const studentId = 456;

      db.getQuery.mockImplementation((sql) =>
        Promise.resolve(
          sql.includes('FROM students WHERE id = ?')
            ? { id: studentId, name: 'Test Student 2', status: 'active', fee_category: 'CAN_PAY' }
            : null,
        ),
      );
      db.allQuery.mockResolvedValue([]); // No existing charges
      db.runQuery.mockResolvedValue({ changes: 1 });

      const result = await triggerChargeRegenerationForStudent(studentId);
      expect(result).toEqual({ success: true, message: 'Charges regenerated successfully' });

      // After successful completion, another call runs too (the lock was released)
      const result2 = await triggerChargeRegenerationForStudent(studentId);
      expect(result2).toEqual({ success: true, message: 'Charges regenerated successfully' });
    });

    it('should release lock even when errors occur', async () => {
      const studentId = 789;

      // Outer failure: student lookup rejects -> outer catch must release the lock
      db.getQuery.mockRejectedValue(new Error('Database error'));

      const result = await triggerChargeRegenerationForStudent(studentId);
      expect(result.success).toBe(false);
      expect(result.message).toBe('Database error');

      // Lock should be released even after error, so next call should succeed
      db.getQuery.mockReset();
      db.allQuery.mockReset();
      db.getQuery
        .mockResolvedValueOnce({
          id: studentId,
          name: 'Test Student 3',
          status: 'active',
          fee_category: 'CAN_PAY',
        }) // student details
        .mockResolvedValueOnce({ value: '9' }); // academic_year_start_month
      db.allQuery.mockResolvedValue([]); // No existing charges
      db.runQuery.mockResolvedValue({ changes: 1 });

      const result2 = await triggerChargeRegenerationForStudent(studentId);
      expect(result2).toEqual({ success: true, message: 'Charges regenerated successfully' });
    });

    it('never bills a deleted student', async () => {
      db.getQuery.mockResolvedValue({
        id: 5,
        status: 'active',
        fee_category: 'CAN_PAY',
        deleted_at: '2026-09-29 10:00:00',
      });

      const result = await triggerChargeRegenerationForStudent(5);

      expect(result).toEqual({ success: false, message: 'Student not found' });
      expect(db.runQuery).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // MONTHLY CHARGES CALCULATION TESTS
  // ============================================

  describe('calculateStudentMonthlyCharges', () => {
    // The student's classes; their age groups have no fees of their own (branch fee applies).
    const mockClasses = (classes) =>
      db.allQuery.mockImplementation((sql) =>
        Promise.resolve(sql.includes('GROUP BY ag.id') ? [] : classes),
      );

    it('should calculate fees for student with standard classes only', async () => {
      const studentId = 1;
      const month = 10;
      const academicYear = '2024-2025';

      db.getQuery.mockImplementation((sql, params) => {
        if (sql.includes('FROM settings')) {
          return Promise.resolve(params[0] === 'standard_monthly_fee' ? { value: '50' } : null);
        }
        return Promise.resolve({ discount_percentage: 0, fee_age_group_id: null });
      });
      mockClasses([{ id: 1, name: 'Standard Class', fee_type: 'standard', monthly_fee: 50 }]);

      const result = await calculateStudentMonthlyCharges(studentId, month, academicYear);

      expect(result.standard).toBe(50);
      expect(result.custom).toBe(0);
      expect(result.total).toBe(50);
    });

    it('should calculate fees for student with special classes', async () => {
      const studentId = 2;
      const month = 10;
      const academicYear = '2024-2025';

      db.getQuery.mockImplementation((sql, params) => {
        if (sql.includes('FROM settings')) {
          return Promise.resolve(params[0] === 'standard_monthly_fee' ? { value: '50' } : null);
        }
        return Promise.resolve({ discount_percentage: 0, fee_age_group_id: null });
      });
      mockClasses([
        { id: 1, name: 'Standard Class', fee_type: 'standard', monthly_fee: 50 },
        { id: 2, name: 'Special Class', fee_type: 'special', monthly_fee: 30 },
      ]);

      const result = await calculateStudentMonthlyCharges(studentId, month, academicYear);

      expect(result.standard).toBe(50);
      expect(result.custom).toBe(30);
      expect(result.total).toBe(80);
    });

    it('should apply discount correctly', async () => {
      const studentId = 3;
      const month = 10;
      const academicYear = '2024-2025';

      db.getQuery.mockImplementation((sql, params) => {
        if (sql.includes('FROM settings')) {
          return Promise.resolve(params[0] === 'standard_monthly_fee' ? { value: '50' } : null);
        }
        return Promise.resolve({ discount_percentage: 20, fee_age_group_id: null });
      });
      mockClasses([{ id: 1, name: 'Standard Class', fee_type: 'standard', monthly_fee: 50 }]);

      const result = await calculateStudentMonthlyCharges(studentId, month, academicYear);

      expect(result.standard).toBe(50);
      expect(result.custom).toBe(0);
      expect(result.total).toBe(40); // 50 * (1 - 0.2) = 40
    });

    it('should handle student with no classes (standard fee only)', async () => {
      const studentId = 4;
      const month = 10;
      const academicYear = '2024-2025';

      db.getQuery.mockImplementation((sql, params) => {
        if (sql.includes('FROM settings')) {
          return Promise.resolve(params[0] === 'standard_monthly_fee' ? { value: '50' } : null);
        }
        return Promise.resolve({ discount_percentage: 0, fee_age_group_id: null });
      });
      db.allQuery.mockResolvedValue([]); // No classes

      const result = await calculateStudentMonthlyCharges(studentId, month, academicYear);

      expect(result.standard).toBe(50); // Standard fee applies even without classes
      expect(result.custom).toBe(0);
      expect(result.total).toBe(50);
    });

    it('should return zero when no standard fee is configured', async () => {
      const studentId = 5;
      const month = 10;
      const academicYear = '2024-2025';

      db.getQuery.mockResolvedValue({ value: '0' }); // No standard fee set
      db.allQuery.mockResolvedValue([]);

      const result = await calculateStudentMonthlyCharges(studentId, month, academicYear);

      expect(result.standard).toBe(0);
      expect(result.custom).toBe(0);
      expect(result.total).toBe(0);
    });

    it('should handle database errors gracefully', async () => {
      const studentId = 6;
      const month = 10;
      const academicYear = '2024-2025';

      db.getQuery.mockRejectedValue(new Error('Database connection failed'));

      const result = await calculateStudentMonthlyCharges(studentId, month, academicYear);

      expect(result.standard).toBe(0);
      expect(result.custom).toBe(0);
      expect(result.total).toBe(0);
    });

    it('should return zero monthly fees for ANNUAL-frequency students (annual-only billing)', async () => {
      const studentId = 7;
      const month = 10;
      const academicYear = '2024-2025';

      db.getQuery.mockReset();
      db.allQuery.mockReset();

      db.getQuery.mockImplementation((sql, params) => {
        if (sql.includes('FROM settings')) {
          return Promise.resolve(params[0] === 'standard_monthly_fee' ? { value: '50' } : null);
        }
        return Promise.resolve({ discount_percentage: 0, fee_age_group_id: null });
      });
      // The standard class's age group pays annually.
      db.allQuery.mockImplementation((sql) =>
        Promise.resolve(
          sql.includes('GROUP BY ag.id')
            ? []
            : [
                {
                  id: 1,
                  name: 'Standard Class',
                  fee_type: 'standard',
                  monthly_fee: 50,
                  payment_frequency: 'ANNUAL',
                },
                {
                  id: 2,
                  name: 'Special Class',
                  fee_type: 'special',
                  monthly_fee: 30,
                  payment_frequency: 'MONTHLY',
                },
              ],
        ),
      );

      const result = await calculateStudentMonthlyCharges(studentId, month, academicYear);

      expect(result).toEqual({ standard: 0, custom: 0, total: 0, relatedClassId: null });
      expect(logError).not.toHaveBeenCalled();
    });
  });

  // ============================================
  // DELETE / REFUND STUDENT PAYMENT
  // ============================================

  describe('deleteStudentPayment', () => {
    let deleteStudentPayment;

    beforeEach(() => {
      ({ deleteStudentPayment } = require('../src/main/handlers/studentFeeHandlers'));
    });

    const payment = {
      id: 10,
      student_id: 2,
      amount: 100,
      refunded: 0,
      transaction_id: 55,
      payment_method: 'CASH',
    };

    it('should reverse charges, breakdown, credit and balance, then void the payment and its transaction', async () => {
      db.getQuery
        .mockResolvedValueOnce(payment) // payment lookup
        .mockResolvedValueOnce(undefined) // its credit was not used by a later payment
        .mockResolvedValueOnce({ amount: 100, account_id: 1, type: 'INCOME' }); // linked txn
      db.allQuery.mockResolvedValue([
        { student_fee_charge_id: 3, amount: 60 },
        { student_fee_charge_id: 4, amount: 40 },
      ]);

      const result = await deleteStudentPayment(10, 5);

      expect(result).toEqual({ success: true, message: 'تم إلغاء الدفعة بنجاح' });

      // charge reversal
      const chargeUpdate = db.runQuery.mock.calls.find(([sql]) =>
        sql.includes('UPDATE student_fee_charges'),
      );
      expect(chargeUpdate[1]).toEqual([60, 60, 60, 3]);

      // breakdown delete
      expect(db.runQuery).toHaveBeenCalledWith(
        'DELETE FROM student_payment_breakdown WHERE student_payment_id = ?',
        [10],
      );

      // credit removal
      expect(db.runQuery).toHaveBeenCalledWith(
        'DELETE FROM student_fee_charges WHERE source_payment_id = ?',
        [10],
      );

      // balance reversal
      expect(db.runQuery).toHaveBeenCalledWith(
        'UPDATE accounts SET current_balance = current_balance - ? WHERE id = ?',
        [100, 1],
      );

      // transaction + payment are voided (kept for history), never deleted
      expect(db.runQuery).toHaveBeenCalledWith(
        'UPDATE transactions SET voided_at = ?, voided_by = ? WHERE id = ?',
        [expect.any(String), 5, 55],
      );
      expect(db.runQuery).toHaveBeenCalledWith(
        'UPDATE student_payments SET voided_at = ?, voided_by = ? WHERE id = ?',
        [expect.any(String), 5, 10],
      );
      expect(db.runQuery).not.toHaveBeenCalledWith(
        'DELETE FROM transactions WHERE id = ?',
        expect.anything(),
      );
      expect(db.runQuery).not.toHaveBeenCalledWith(
        'DELETE FROM student_payments WHERE id = ?',
        expect.anything(),
      );
    });

    it('should refuse to void a payment twice', async () => {
      db.getQuery.mockResolvedValueOnce({ ...payment, voided_at: '2026-09-29 10:00:00' });

      await expect(deleteStudentPayment(10)).rejects.toThrow('ملغاة بالفعل');
      expect(db.runQuery).not.toHaveBeenCalled();
    });

    it('should throw when the payment does not exist', async () => {
      db.getQuery.mockResolvedValue(null);

      await expect(deleteStudentPayment(999)).rejects.toThrow('الدفعة غير موجودة');
    });

    it('should throw when the payment is already refunded', async () => {
      db.getQuery.mockResolvedValue({ ...payment, refunded: 1 });

      await expect(deleteStudentPayment(10)).rejects.toThrow('لا يمكن حذف دفعة مسترجعة');
    });

    it('should give back the credit the payment used', async () => {
      db.getQuery
        .mockResolvedValueOnce(payment)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ amount: 100, account_id: 1, type: 'INCOME' });
      // 20 of credit from credit charge 90 plus 80 cash paid charge 3
      db.allQuery.mockResolvedValue([
        { student_fee_charge_id: 3, amount: 100 },
        { student_fee_charge_id: 90, amount: -20 },
      ]);

      await deleteStudentPayment(10);

      // amount_paid - (-20) puts the 20 back on the credit charge
      const creditUpdate = db.runQuery.mock.calls.find(
        ([sql, params]) => sql.includes('UPDATE student_fee_charges') && params[3] === 90,
      );
      expect(creditUpdate[1]).toEqual([-20, -20, -20, 90]);
    });

    it('should refuse when a later payment already used the credit it created', async () => {
      db.getQuery.mockResolvedValueOnce(payment).mockResolvedValueOnce({ id: 7 });

      await expect(deleteStudentPayment(10)).rejects.toThrow('استُعمل في دفعة لاحقة');
      expect(db.runQuery).not.toHaveBeenCalled();
    });
  });

  describe('refundStudentPayment', () => {
    let refundStudentPayment;

    beforeEach(() => {
      ({ refundStudentPayment } = require('../src/main/handlers/studentFeeHandlers'));
    });

    const payment = {
      id: 10,
      student_id: 2,
      amount: 100,
      refunded: 0,
      transaction_id: 55,
      payment_method: 'CASH',
    };

    it('should reverse charges/credit/balance, mark refunded and record an EXPENSE', async () => {
      db.getQuery
        .mockResolvedValueOnce(payment) // payment lookup
        .mockResolvedValueOnce(undefined) // its credit was not used by a later payment
        .mockResolvedValueOnce({ amount: 100, account_id: 1, type: 'INCOME' }); // linked txn
      db.allQuery.mockResolvedValue([{ student_fee_charge_id: 3, amount: 60 }]);

      const result = await refundStudentPayment(10, 9);

      expect(result).toEqual({ success: true, message: 'تم استرجاع الدفعة بنجاح' });

      // balance reversal
      expect(db.runQuery).toHaveBeenCalledWith(
        'UPDATE accounts SET current_balance = current_balance - ? WHERE id = ?',
        [100, 1],
      );

      // EXPENSE reversal transaction
      const expenseInsert = db.runQuery.mock.calls.find(
        ([sql]) => sql.includes('INSERT INTO transactions') && sql.includes("'EXPENSE'"),
      );
      expect(expenseInsert).toBeDefined();
      expect(expenseInsert[1][0]).toBe(100);
      expect(expenseInsert[1][3]).toBe('CASH');

      // payment kept, marked refunded
      expect(db.runQuery).toHaveBeenCalledWith(
        'UPDATE student_payments SET refunded = 1 WHERE id = ?',
        [10],
      );
    });

    it('should throw when the payment is already refunded', async () => {
      db.getQuery.mockResolvedValue({ ...payment, refunded: 1 });

      await expect(refundStudentPayment(10)).rejects.toThrow('الدفعة مسترجعة بالفعل');
    });
  });
});
