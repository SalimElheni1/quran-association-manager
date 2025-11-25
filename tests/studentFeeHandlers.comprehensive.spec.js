const { ipcMain } = require('electron');
const {
  registerStudentFeeHandlers,
  triggerChargeRegenerationForStudent,
  getCurrentAcademicYear,
  calculateStudentMonthlyCharges,
} = require('../src/main/handlers/studentFeeHandlers');
const db = require('../src/db/db');

// Mock dependencies
jest.mock('../src/db/db');
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
    it('should refresh charges for students needing special class updates', async () => {
      const mockStudentsNeedingRefresh = [
        {
          id: 1,
          name: 'Ahmed',
          matricule: 'S-001',
          classEnrollmentDate: '2024-09-15',
          firstChargeDate: '2024-09-01',
        },
      ];

      db.allQuery
        .mockResolvedValueOnce(mockStudentsNeedingRefresh) // identifyStudentsNeedingChargeRefresh
        .mockResolvedValue([]) // generateMonthlyFeeCharges calls
        .mockResolvedValue([]); // More generateMonthlyFeeCharges calls

      const result = await ipcMain.invoke('student-fees:refreshAllStudentCharges', {
        academicYear: '2024-2025',
      });

      expect(result.success).toBe(true);
      expect(result.studentsProcessed).toBe(1);
      expect(result.chargesGenerated).toBeGreaterThan(0);
    });

    it('should return success message when no students need refresh', async () => {
      db.allQuery.mockResolvedValue([]); // No students needing refresh

      const result = await ipcMain.invoke('student-fees:refreshAllStudentCharges', {
        academicYear: '2024-2025',
      });

      expect(result.success).toBe(true);
      expect(result.studentsProcessed).toBe(0);
      expect(result.chargesGenerated).toBe(0);
      expect(result.message).toContain('لا توجد طلاب يحتاجون تحديث الرسوم');
    });

    it('should handle partial failures gracefully', async () => {
      const mockStudentsNeedingRefresh = [
        {
          id: 1,
          name: 'Ahmed',
          matricule: 'S-001',
          classEnrollmentDate: '2024-09-15',
          firstChargeDate: '2024-09-01',
        },
        {
          id: 2,
          name: 'Sara',
          matricule: 'S-002',
          classEnrollmentDate: '2024-09-16',
          firstChargeDate: '2024-09-01',
        },
      ];

      db.allQuery
        .mockResolvedValueOnce(mockStudentsNeedingRefresh) // identifyStudentsNeedingChargeRefresh
        .mockResolvedValueOnce([]) // First student - success
        .mockRejectedValueOnce(new Error('Student 2 failed')) // Second student - failure
        .mockResolvedValue([]); // Cleanup calls

      const result = await ipcMain.invoke('student-fees:refreshAllStudentCharges', {
        academicYear: '2024-2025',
      });

      expect(result.success).toBe(true);
      expect(result.studentsProcessed).toBe(2);
      expect(result.failedResults).toHaveLength(1);
      expect(result.failedResults[0].studentId).toBe(2);
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
        .mockResolvedValueOnce({ id: studentId, name: 'Student 1', status: 'active', fee_category: 'CAN_PAY' }) // student details for first call
        .mockResolvedValueOnce({ value: '9' }) // academic_year_start_month setting for second call
        .mockResolvedValueOnce({ id: studentId, name: 'Student 1', status: 'active', fee_category: 'CAN_PAY' }); // student details for second call
      db.allQuery.mockResolvedValue([]); // No existing charges
      db.runQuery.mockResolvedValue({ changes: 1 });

      const promise1 = triggerChargeRegenerationForStudent(studentId);
      const promise2 = triggerChargeRegenerationForStudent(studentId);

      const [result1, result2] = await Promise.all([promise1, promise2]);

      // One should succeed, one should fail with lock message
      const hasLockError = result1.message?.includes('already in progress') || result2.message?.includes('already in progress');
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

      db.getQuery
        .mockResolvedValueOnce({ value: '9' }) // academic_year_start_month setting
        .mockResolvedValueOnce({ id: studentId, name: 'Student 1', status: 'active', fee_category: 'CAN_PAY' }); // student details
      db.allQuery.mockRejectedValue(new Error('Database error'));

      const result = await triggerChargeRegenerationForStudent(studentId);
      expect(result.success).toBe(false);
      expect(result.message).toBe('Database error');

      // Lock should be released even after error, so next call should succeed
      db.getQuery
        .mockResolvedValueOnce({ value: '9' })
        .mockResolvedValueOnce({
          id: studentId,
          name: 'Test Student 3',
          status: 'active',
          fee_category: 'CAN_PAY',
        });
      db.allQuery.mockResolvedValue([]);
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
  });
});
