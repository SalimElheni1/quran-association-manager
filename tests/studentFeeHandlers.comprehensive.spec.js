const { ipcMain } = require('electron');
const {
  registerStudentFeeHandlers,
  triggerChargeRegenerationForStudent,
  getCurrentAcademicYear,
  calculateStudentMonthlyCharges,
} = require('../src/main/handlers/studentFeeHandlers');
const db = require('../src/db/db');

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
    it('should generate both annual and monthly charges in a transaction', async () => {
      const academicYear = '2024-2025';

      db.runQuery.mockResolvedValue({ changes: 1 });
      db.getQuery.mockResolvedValue({ value: '100' }); // annual_fee setting
      db.getQuery.mockResolvedValueOnce({ value: '50' }); // standard_monthly_fee setting
      db.allQuery.mockResolvedValue([{ id: 1 }, { id: 2 }]); // students

      const result = await ipcMain.invoke('student-fees:generateAllCharges', academicYear);

      expect(db.runQuery).toHaveBeenCalledWith('BEGIN TRANSACTION;');
      expect(db.runQuery).toHaveBeenCalledWith('COMMIT;');
      expect(result).toEqual({ success: true, message: 'تم إنشاء جميع الرسوم بنجاح' });
    });

    it('should handle transaction rollback on error', async () => {
      const academicYear = '2024-2025';

      db.runQuery.mockResolvedValueOnce({ changes: 1 }); // BEGIN
      db.runQuery.mockRejectedValue(new Error('Database error'));
      db.getQuery.mockResolvedValue({ value: '100' }); // annual_fee setting
      db.getQuery.mockResolvedValueOnce({ value: '50' }); // standard_monthly_fee setting
      db.allQuery.mockResolvedValue([{ id: 1 }]); // students

      await expect(ipcMain.invoke('student-fees:generateAllCharges', academicYear)).rejects.toThrow(
        'Database error',
      );

      expect(db.runQuery).toHaveBeenCalledWith('BEGIN TRANSACTION;');
      expect(db.runQuery).toHaveBeenCalledWith('ROLLBACK;');
    });

    it('should support force regeneration of existing charges', async () => {
      const academicYear = '2024-2025';

      db.runQuery.mockResolvedValue({ changes: 1 });
      db.getQuery.mockResolvedValue({ value: '100' }); // annual_fee setting
      db.getQuery.mockResolvedValueOnce({ value: '50' }); // standard_monthly_fee setting
      db.allQuery.mockResolvedValue([{ id: 1 }]); // students

      await ipcMain.invoke('student-fees:generateAllCharges', academicYear, true);

      // Should call generateMonthlyFeeCharges with force=true
      expect(db.allQuery).toHaveBeenCalledWith(
        expect.stringContaining("fee_category = 'CAN_PAY' OR fee_category = 'SPONSORED'"),
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

      expect(mockReceiptService.generateReceiptNumber).toHaveBeenCalledWith(
        'fee_payment',
        undefined,
      );
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

      db.getQuery
        .mockResolvedValueOnce({ value: '9' }) // academic_year_start_month setting
        .mockResolvedValueOnce({
          id: studentId,
          name: 'Test Student 2',
          status: 'active',
          fee_category: 'CAN_PAY',
        }) // student details
        .mockResolvedValueOnce({ value: '9' }) // academic_year_start_month setting for second call
        .mockResolvedValueOnce({
          id: studentId,
          name: 'Test Student 2',
          status: 'active',
          fee_category: 'CAN_PAY',
        }); // student details for second call
      db.allQuery.mockResolvedValue([]); // No existing charges
      db.runQuery.mockResolvedValue({ changes: 1 });

      const result = await triggerChargeRegenerationForStudent(studentId);
      expect(result.success).toBe(true);

      // After successful completion, another call should succeed (lock was released)
      const result2 = await triggerChargeRegenerationForStudent(studentId);
      expect(result2.success).toBe(true);
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
      expect(result2.success).toBe(true);
    });
  });

  // ============================================
  // ACADEMIC YEAR CALCULATION TESTS
  // ============================================

  describe('getCurrentAcademicYear', () => {
    it('should calculate correct academic year for September start', () => {
      // September 2024 should start 2024-2025
      const sept2024 = new Date(2024, 8, 1); // Month 8 = September (0-based)
      const result = getCurrentAcademicYear(9, sept2024);
      expect(result).toBe('2024-2025');
    });

    it('should handle academic year crossing', () => {
      // August 2024 should still be in 2023-2024
      const aug2024 = new Date(2024, 7, 1); // Month 7 = August (0-based)
      const result = getCurrentAcademicYear(9, aug2024);
      expect(result).toBe('2023-2024');
    });

    it('should handle custom start months', () => {
      // January start
      const jan2024 = new Date(2024, 0, 15); // Month 0 = January
      const result = getCurrentAcademicYear(1, jan2024);
      expect(result).toBe('2024-2025');

      // December should cross to next year
      const dec2024 = new Date(2024, 11, 15); // Month 11 = December
      const result2 = getCurrentAcademicYear(1, dec2024);
      expect(result2).toBe('2024-2025');
    });
  });

  // ============================================
  // MONTHLY CHARGES CALCULATION TESTS
  // ============================================

  describe('calculateStudentMonthlyCharges', () => {
    it('should calculate fees for student with standard classes only', async () => {
      const studentId = 1;
      const month = 10;
      const academicYear = '2024-2025';

      db.getQuery
        .mockResolvedValueOnce({ value: '50' }) // standard_monthly_fee setting
        .mockResolvedValueOnce({ discount_percentage: 0 }); // Student discount
      db.allQuery.mockResolvedValue([
        { id: 1, name: 'Standard Class', fee_type: 'standard', monthly_fee: 50 },
      ]);

      const result = await calculateStudentMonthlyCharges(studentId, month, academicYear);

      expect(result.standard).toBe(50);
      expect(result.custom).toBe(0);
      expect(result.total).toBe(50);
    });

    it('should calculate fees for student with special classes', async () => {
      const studentId = 2;
      const month = 10;
      const academicYear = '2024-2025';

      db.getQuery
        .mockResolvedValueOnce({ value: '50' }) // standard_monthly_fee setting
        .mockResolvedValueOnce({ discount_percentage: 0 }); // Student discount
      db.allQuery.mockResolvedValue([
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

      db.getQuery
        .mockResolvedValueOnce({ value: '50' }) // standard_monthly_fee setting
        .mockResolvedValueOnce({ discount_percentage: 20 }); // 20% discount
      db.allQuery.mockResolvedValue([
        { id: 1, name: 'Standard Class', fee_type: 'standard', monthly_fee: 50 },
      ]);

      const result = await calculateStudentMonthlyCharges(studentId, month, academicYear);

      expect(result.standard).toBe(50);
      expect(result.custom).toBe(0);
      expect(result.total).toBe(40); // 50 * (1 - 0.2) = 40
    });

    it('should handle student with no classes (standard fee only)', async () => {
      const studentId = 4;
      const month = 10;
      const academicYear = '2024-2025';

      db.getQuery
        .mockResolvedValueOnce({ value: '50' }) // standard_monthly_fee setting
        .mockResolvedValueOnce({ discount_percentage: 0 });
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

      db.getQuery
        .mockResolvedValueOnce({ value: '50' }) // standard_monthly_fee setting
        .mockResolvedValueOnce({ discount_percentage: 0 }) // Student discount
        .mockResolvedValueOnce({ value: 'ANNUAL' }) // men_payment_frequency
        .mockResolvedValueOnce({ value: 'ANNUAL' }) // women_payment_frequency
        .mockResolvedValueOnce({ value: 'ANNUAL' }); // kids_payment_frequency
      db.allQuery.mockResolvedValueOnce([
        { id: 1, name: 'Standard Class', fee_type: 'standard', monthly_fee: 50, gender: 'men' },
        { id: 2, name: 'Special Class', fee_type: 'special', monthly_fee: 30, gender: 'men' },
      ]);

      const result = await calculateStudentMonthlyCharges(studentId, month, academicYear);

      expect(result.standard).toBe(0);
      expect(result.custom).toBe(0);
      expect(result.total).toBe(0);
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

    it('should reverse charges, breakdown, credit, transaction and balance, then delete', async () => {
      db.getQuery
        .mockResolvedValueOnce(payment) // payment lookup
        .mockResolvedValueOnce({ amount: 100, account_id: 1, type: 'INCOME' }); // linked txn
      db.allQuery.mockResolvedValue([
        { student_fee_charge_id: 3, amount: 60 },
        { student_fee_charge_id: 4, amount: 40 },
      ]);

      const result = await deleteStudentPayment(10);

      expect(result).toEqual({ success: true, message: 'تم حذف الدفعة بنجاح' });

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

      // transaction + payment deletion
      expect(db.runQuery).toHaveBeenCalledWith('DELETE FROM transactions WHERE id = ?', [55]);
      expect(db.runQuery).toHaveBeenCalledWith('DELETE FROM student_payments WHERE id = ?', [10]);
    });

    it('should throw when the payment does not exist', async () => {
      db.getQuery.mockResolvedValue(null);

      await expect(deleteStudentPayment(999)).rejects.toThrow('الدفعة غير موجودة');
    });

    it('should throw when the payment is already refunded', async () => {
      db.getQuery.mockResolvedValue({ ...payment, refunded: 1 });

      await expect(deleteStudentPayment(10)).rejects.toThrow('لا يمكن حذف دفعة مسترجعة');
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
