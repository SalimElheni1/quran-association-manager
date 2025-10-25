/**
 * @fileoverview IPC handlers for student fee management
 * @author Quran Branch Manager Team
 * @version 1.0.0
 */

const { ipcMain } = require('electron');
const db = require('../../db/db');
const { requireRoles } = require('../authMiddleware');
const { error: logError } = require('../logger');

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

      enrolledClasses.forEach(c => {
        if (c.fee_type === 'special' && c.monthly_fee > 0) {
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
  const { student_id, amount, payment_method, check_number, payment_type, notes, academic_year, receipt_number } = paymentDetails;

  await db.runQuery('BEGIN TRANSACTION;');
  try {
    // 1. Create a student_payment record
    const paymentResult = await db.runQuery(`
      INSERT INTO student_payments (student_id, amount, payment_method, payment_type, academic_year, notes, check_number, receipt_number)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [student_id, amount, payment_method, payment_type || 'CUSTOM', academic_year || new Date().getFullYear().toString(), notes, check_number, receipt_number]);

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
    const student = await db.getQuery('SELECT name FROM students WHERE id = ?', [student_id]);
    const transactionDescription = `Payment for ${student.name} - ${payment_type || 'Fee'}`;

    // Note: You might want to make the account_id dynamic
    const transactionResult = await db.runQuery(`
      INSERT INTO transactions (type, category, amount, transaction_date, description, payment_method, check_number, account_id, related_person_name, related_entity_type, related_entity_id, created_by_user_id)
      VALUES ('INCOME', 'Student Fees', ?, ?, ?, ?, ?, 1, ?, 'Student', ?, ?)
    `, [amount, new Date().toISOString().split('T')[0], transactionDescription, payment_method, check_number, student.name, student_id, event.sender.userId]);

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
    throw new Error('Failed to record student payment.');
  }
}

// ============================================
// IPC HANDLERS
// ============================================

function registerStudentFeeHandlers() {
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
      return await recordStudentPayment(event, paymentDetails);
    } catch (error) {
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
}

module.exports = {
  registerStudentFeeHandlers,
  generateAnnualFeeCharges,
  generateMonthlyFeeCharges,
  getStudentFeeStatus,
  recordStudentPayment,
};
