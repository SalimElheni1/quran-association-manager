/**
 * @fileoverview IPC handlers for student fee management
 * @author Quran Branch Manager Team
 * @version 1.0.0
 */

const { ipcMain } = require('electron');
const db = require('../../db/db');
const { requireRoles } = require('../authMiddleware');
const { error: logError } = require('../logger');
const { generateReceiptNumber, getReceiptBookStats } = require('../services/receiptService');
const { studentPaymentValidationSchema } = require('../validationSchemas');
const { internalGetSettingsHandler } = require('./settingsHandlers');

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Gets a setting value from the database.
 * @param {string} key The key of the setting to retrieve.
 * @returns {Promise<string|null>} The value of the setting, or null if not found.
 */
async function getSetting(key) {
  const setting = await db.getQuery('SELECT value FROM settings WHERE key = ?', [key]);
  return setting?.value;
}

// ============================================
// CHARGE GENERATION
// ============================================

/**
 * Generates annual fee charges for all eligible students.
 * @param {string} academicYear The academic year for which to generate charges.
 */
async function generateAnnualFeeCharges(academicYear) {
  await db.runQuery('BEGIN TRANSACTION;');
  try {
    const annualFee = parseFloat(await getSetting('annual_fee') || '0');
    if (annualFee <= 0) {
      console.log('Annual fee is not set or is zero. Skipping charge generation.');
      await db.runQuery('COMMIT;');
      return;
    }

    const students = await db.allQuery(
      "SELECT id FROM students WHERE status = 'active' AND fee_category = 'CAN_PAY'"
    );

    const chargeDate = new Date().toISOString().split('T')[0];

    for (const student of students) {
      // Check if an annual fee charge already exists for this student and academic year
      const existingCharge = await db.getQuery(`
        SELECT id FROM student_fee_charges
        WHERE student_id = ? AND fee_type = 'ANNUAL' AND academic_year = ?
      `, [student.id, academicYear]);

      if (!existingCharge) {
        await db.runQuery(`
          INSERT INTO student_fee_charges (student_id, charge_date, fee_type, description, amount, academic_year, status)
          VALUES (?, ?, 'ANNUAL', 'Annual Fee', ?, ?, 'UNPAID')
        `, [student.id, chargeDate, annualFee, academicYear]);
      }
    }

    await db.runQuery('COMMIT;');
  } catch (error) {
    await db.runQuery('ROLLBACK;');
    logError('Error in generateAnnualFeeCharges:', error);
    throw new Error('Failed to generate annual fee charges.');
  }
}

/**
 * Generates monthly fee charges for all eligible students.
 * @param {string} academicYear The academic year for which to generate charges.
 * @param {number} month The month for which to generate charges (1-12).
 */
async function generateMonthlyFeeCharges(academicYear, month) {
  await db.runQuery('BEGIN TRANSACTION;');
  try {
    const standardMonthlyFee = parseFloat(await getSetting('standard_monthly_fee') || '0');
    const chargeDate = new Date().toISOString().split('T')[0];

    // Get all active, paying students
    const students = await db.allQuery(
      "SELECT id FROM students WHERE status = 'active' AND fee_category = 'CAN_PAY'"
    );

    for (const student of students) {
      // Check if a monthly fee charge already exists for this student, academic year, and month
      const existingCharge = await db.getQuery(`
        SELECT id FROM student_fee_charges
        WHERE student_id = ? AND fee_type = 'MONTHLY' AND academic_year = ? AND strftime('%m', charge_date) = ?
      `, [student.id, academicYear, month.toString().padStart(2, '0')]);

      if (existingCharge) continue;

      // Get the student's enrolled classes
      const enrolledClasses = await db.allQuery(`
        SELECT c.fee_type, c.monthly_fee FROM classes c
        JOIN class_students cs ON c.id = cs.class_id
        WHERE cs.student_id = ? AND c.status = 'active'
      `, [student.id]);

      let totalMonthlyFee = 0;
      const hasStandardClass = enrolledClasses.some(c => c.fee_type === 'standard');
      if (hasStandardClass && standardMonthlyFee > 0) {
        totalMonthlyFee += standardMonthlyFee;
      }

      // Add custom monthly fees from all enrolled classes (both standard and special)
      enrolledClasses.forEach(c => {
        if (c.monthly_fee > 0) {
          totalMonthlyFee += c.monthly_fee;
        }
      });

      if (totalMonthlyFee > 0) {
        await db.runQuery(`
          INSERT INTO student_fee_charges (student_id, charge_date, fee_type, description, amount, academic_year, status)
          VALUES (?, ?, 'MONTHLY', 'Monthly Fee', ?, ?, 'UNPAID')
        `, [student.id, chargeDate, totalMonthlyFee, academicYear]);
      }
    }

    await db.runQuery('COMMIT;');
  } catch (error) {
    await db.runQuery('ROLLBACK;');
    logError('Error in generateMonthlyFeeCharges:', error);
    throw new Error('Failed to generate monthly fee charges.');
  }
}

// ============================================
// FEE STATUS & PAYMENT
// ============================================

/**
 * Gets the fee status for a single student.
 * @param {number} studentId The ID of the student.
 * @returns {Promise<object>} An object containing the student's fee status.
 */
async function getStudentFeeStatus(studentId) {
  try {
    const charges = await db.allQuery(
      'SELECT * FROM student_fee_charges WHERE student_id = ?',
      [studentId]
    );

    const totalDue = charges.reduce((acc, charge) => acc + charge.amount, 0);
    const totalPaid = charges.reduce((acc, charge) => acc + charge.amount_paid, 0);
    const balance = totalDue - totalPaid;

    return {
      charges,
      totalDue,
      totalPaid,
      balance,
    };
  } catch (error) {
    logError('Error in getStudentFeeStatus:', error);
    throw new Error('Failed to get student fee status.');
  }
}

/**
 * Records a payment for a student.
 * @param {object} event The IPC event object.
 * @param {object} paymentDetails The details of the payment.
 * @returns {Promise<object>} The newly created student payment record.
 */
async function recordStudentPayment(event, paymentDetails) {
  const { student_id, amount, payment_method, check_number, payment_type, notes, academic_year, receipt_number, class_id } = paymentDetails;

  await db.runQuery('BEGIN TRANSACTION;');
  try {
    // Validate receipt number uniqueness across all income tables
    if (receipt_number) {
      // Check payments table
      const existingPayment = await db.getQuery(
        'SELECT id FROM payments WHERE receipt_number = ?',
        [receipt_number]
      );

      // Check donations table
      const existingDonation = await db.getQuery(
        'SELECT id FROM donations WHERE receipt_number = ?',
        [receipt_number]
      );

      // Check student_payments table (exclude current payment if updating)
      const existingStudentPayment = await db.getQuery(
        'SELECT id FROM student_payments WHERE receipt_number = ?',
        [receipt_number]
      );

      if (existingPayment || existingDonation || existingStudentPayment) {
        throw new Error('DUPLICATE_RECEIPT');
      }
    }

    // 1. Create a student_payment record
    const paymentResult = await db.runQuery(`
      INSERT INTO student_payments (student_id, amount, payment_method, payment_type, academic_year, notes, check_number, receipt_number, class_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [student_id, amount, payment_method, payment_type || 'CUSTOM', academic_year || new Date().getFullYear().toString(), notes, check_number, receipt_number, class_id]);

    const studentPaymentId = paymentResult.id;

    // 2. Apply the payment to outstanding charges (FIFO)
    const outstandingCharges = await db.allQuery(`
      SELECT * FROM student_fee_charges
      WHERE student_id = ? AND status IN ('UNPAID', 'PARTIALLY_PAID')
      ORDER BY due_date ASC, created_at ASC
    `, [student_id]);

    let remainingAmountToApply = amount;

    for (const charge of outstandingCharges) {
      if (remainingAmountToApply <= 0) break;

      const chargeBalance = charge.amount - charge.amount_paid;
      const amountToApplyToCharge = Math.min(remainingAmountToApply, chargeBalance);

      // Create a breakdown record
      await db.runQuery(`
        INSERT INTO student_payment_breakdown (student_payment_id, student_fee_charge_id, amount)
        VALUES (?, ?, ?)
      `, [studentPaymentId, charge.id, amountToApplyToCharge]);

      // Update the charge record
      const newAmountPaid = charge.amount_paid + amountToApplyToCharge;
      const newStatus = newAmountPaid >= charge.amount ? 'PAID' : 'PARTIALLY_PAID';

      await db.runQuery(`
        UPDATE student_fee_charges
        SET amount_paid = ?, status = ?
        WHERE id = ?
      `, [newAmountPaid, newStatus, charge.id]);

      remainingAmountToApply -= amountToApplyToCharge;
    }

    // 3. Create a corresponding transaction record
    const student = await db.getQuery('SELECT name, matricule FROM students WHERE id = ?', [student_id]);
    const transactionDescription = `دفعة رسوم من الطالب: ${student.name} - ${payment_type || 'رسوم'}`;

    // Note: You might want to make the account_id dynamic
    const transactionResult = await db.runQuery(`
      INSERT INTO transactions (type, category, amount, transaction_date, description, payment_method, check_number, receipt_number, receipt_type, account_id, related_person_name, related_entity_type, related_entity_id, created_by_user_id, matricule)
      VALUES ('INCOME', 'رسوم الطلاب', ?, ?, ?, ?, ?, ?, ?, 1, ?, 'Student', ?, ?, ?)
    `, [amount, new Date().toISOString().split('T')[0], transactionDescription, payment_method, check_number, receipt_number, payment_type, student.name, student_id, event.sender.userId, student.matricule]);

    // Link the transaction to the payment
    await db.runQuery(
      'UPDATE student_payments SET transaction_id = ? WHERE id = ?',
      [transactionResult.id, studentPaymentId]
    );

    await db.runQuery('COMMIT;');

    return await db.getQuery('SELECT * FROM student_payments WHERE id = ?', [studentPaymentId]);
  } catch (error) {
    await db.runQuery('ROLLBACK;');
    logError('Error in recordStudentPayment:', error);
    if (error.message === 'DUPLICATE_RECEIPT') {
      throw new Error('رقم الوصل الذي أدخلته موجود بالفعل. يرجى استخدام رقم وصل جديد.');
    }
    throw new Error('فشل في تسجيل الدفعة. يرجى المحاولة مرة أخرى.');
  }
}

// ============================================
// IPC HANDLERS
// ============================================

function registerStudentFeeHandlers() {
  ipcMain.handle('student-fees:getPaymentHistory', requireRoles(['Superadmin', 'Administrator', 'FinanceManager'])(async (event, { studentId, academicYear }) => {
    try {
      return await db.allQuery(
        'SELECT * FROM student_payments WHERE student_id = ? AND academic_year = ?',
        [studentId, academicYear]
      );
    } catch (error) {
      logError('Error getting student payment history:', error);
      throw new Error('Failed to get student payment history.');
    }
  }));

  ipcMain.handle('student-fees:getClassesWithSpecialFees', requireRoles(['Superadmin', 'Administrator', 'FinanceManager'])(async (event, studentId) => {
    try {
      return await db.allQuery(`
        SELECT c.id, c.name FROM classes c
        JOIN class_students cs ON c.id = cs.class_id
        WHERE cs.student_id = ? AND c.status = 'active' AND c.fee_type = 'special'
      `, [studentId]);
    } catch (error) {
      logError('Error getting classes with special fees:', error);
      throw new Error('Failed to get classes with special fees.');
    }
  }));
  ipcMain.handle('student-fees:getStatus', requireRoles(['Superadmin', 'Administrator', 'FinanceManager'])(async (event, studentId) => {
    try {
      return await getStudentFeeStatus(studentId);
    } catch (error) {
      logError('Error getting student fee status:', error);
      throw new Error('Failed to get student fee status.');
    }
  }));

  ipcMain.handle('student-fees:recordPayment', requireRoles(['Superadmin', 'Administrator', 'FinanceManager'])(async (event, paymentDetails) => {
    try {
      // Validate payment details
      await studentPaymentValidationSchema.validateAsync(paymentDetails, {
        abortEarly: false,
        stripUnknown: false,
      });

      return await recordStudentPayment(event, paymentDetails);
    } catch (error) {
      if (error.isJoi) {
        throw new Error(`بيانات غير صالحة: ${error.details.map((d) => d.message).join('; ')}`);
      }
      logError('Error recording student payment:', error);
      throw new Error('Failed to record student payment.');
    }
  }));

  ipcMain.handle('student-fees:getAll', requireRoles(['Superadmin', 'Administrator', 'FinanceManager'])(async (_event) => {
    try {
      const students = await db.allQuery(
        'SELECT id, name, matricule, fee_category FROM students WHERE status = ? ORDER BY name',
        ['active']
      );

      // Get fee status for each student, filtering out exempt/sponsored students
      const studentsWithFees = await Promise.all(
        students.map(async (student) => {
          if (student.fee_category === 'EXEMPT' || student.fee_category === 'SPONSORED') {
            return {
              ...student,
              totalDue: 0,
              totalPaid: 0,
              balance: 0,
            };
          }

          const feeStatus = await getStudentFeeStatus(student.id);
          return {
            id: student.id,
            name: student.name,
            matricule: student.matricule,
            fee_category: student.fee_category,
            totalDue: feeStatus.totalDue,
            totalPaid: feeStatus.totalPaid,
            balance: feeStatus.balance,
          };
        })
      );

      return studentsWithFees;
    } catch (error) {
      logError('Error getting all students with fee status:', error);
      throw new Error('Failed to get students with fee status.');
    }
  }));

  // Charge generation handlers
  ipcMain.handle('student-fees:generateAnnualCharges', requireRoles(['Superadmin', 'Administrator', 'FinanceManager'])(async (_event, academicYear) => {
    try {
      await generateAnnualFeeCharges(academicYear);
      return { success: true, message: 'تم إنشاء الرسوم السنوية بنجاح' };
    } catch (error) {
      logError('Error generating annual charges:', error);
      throw new Error('فشل في إنشاء الرسوم السنوية');
    }
  }));

  ipcMain.handle('student-fees:generateMonthlyCharges', requireRoles(['Superadmin', 'Administrator', 'FinanceManager'])(async (_event, data) => {
    try {
      const { academicYear, month } = data;
      await generateMonthlyFeeCharges(academicYear, month);
      return { success: true, message: 'تم إنشاء الرسوم الشهرية بنجاح' };
    } catch (error) {
      logError('Error generating monthly charges:', error);
      throw new Error('فشل في إنشاء الرسوم الشهرية');
    }
  }));

  ipcMain.handle('student-fees:generateAllCharges', requireRoles(['Superadmin', 'Administrator', 'FinanceManager'])(async (_event, academicYear, force = false) => {
    try {
      // Generate annual charges for the year
      await generateAnnualFeeCharges(academicYear);

      // Generate monthly charges for upcoming months
      const currentMonth = new Date().getMonth() + 1; // JavaScript months are 0-indexed
      const monthsToGenerate = [currentMonth, currentMonth + 1, currentMonth + 2]; // Current + next 2 months

      for (const month of monthsToGenerate) {
        if (month <= 12) {
          await generateMonthlyFeeCharges(academicYear, month, force);
        } else {
          // Handle year rollover
          const nextYear = academicYear + 1;
          await generateMonthlyFeeCharges(nextYear.toString(), month - 12, force);
        }
      }

      return { success: true, message: 'تم إنشاء جميع الرسوم بنجاح' };
    } catch (error) {
      logError('Error generating all charges:', error);
      throw new Error('فشل في إنشاء جميع الرسوم');
    }
  }));



  // Receipt management handlers
  ipcMain.handle('receipts:generate', requireRoles(['Superadmin', 'Administrator', 'FinanceManager'])(async (event, options = {}) => {
    try {
      const receiptType = options.receiptType || 'fee_payment';
      const result = await generateReceiptNumber(receiptType, event.sender.userId);
      return result;
    } catch (error) {
      logError('Error generating receipt number:', error);
      throw new Error('Failed to generate receipt number.');
    }
  }));

  ipcMain.handle('receipts:getStats', requireRoles(['Superadmin', 'Administrator', 'FinanceManager'])(async (_event, year = null) => {
    try {
      return await getReceiptBookStats(year);
    } catch (error) {
      logError('Error getting receipt book stats:', error);
      throw new Error('Failed to get receipt book statistics.');
    }
  }));

  ipcMain.handle('receipts:validate', requireRoles(['Superadmin', 'Administrator', 'FinanceManager'])(async (_event, receiptNumber) => {
    try {
      const { validateReceiptNumber } = require('../services/receiptService');
      return validateReceiptNumber(receiptNumber);
    } catch (error) {
      logError('Error validating receipt number:', error);
      throw new Error('Failed to validate receipt number.');
    }
  }));
}

module.exports = {
  registerStudentFeeHandlers,
  generateAnnualFeeCharges,
  generateMonthlyFeeCharges,
  getStudentFeeStatus,
  recordStudentPayment,
};
