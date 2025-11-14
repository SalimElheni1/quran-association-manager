/**
 * @fileoverview IPC handlers for student fee management
 * @author Quran Branch Manager Team
 * @version 1.0.0
 */

const { ipcMain } = require('electron');
const db = require('../../db/db');
const { requireRoles } = require('../authMiddleware');
const { log, error: logError } = require('../logger');
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

/**
 * Calculates the current academic year based on the configured start month.
 * @param {number} startMonth The month the academic year starts (1-12, default: 9 for September)
 * @param {Date} referenceDate Optional reference date (default: now)
 * @returns {string} Academic year in format "YYYY-YYYY" (e.g., "2024-2025")
 */
function getCurrentAcademicYear(startMonth = 9, referenceDate = new Date()) {
  const currentMonth = referenceDate.getMonth() + 1;
  const currentYear = referenceDate.getFullYear();
  
  if (currentMonth >= startMonth) {
    return `${currentYear}-${currentYear + 1}`;
  }
  return `${currentYear - 1}-${currentYear}`;
}

// ============================================
// CHARGE GENERATION
// ============================================

/**
 * Generates annual fee charges for all eligible students.
 * @param {string} academicYear The academic year for which to generate charges.
 * @param {boolean} useTransaction Whether to wrap in transaction (default: true)
 */
async function generateAnnualFeeCharges(academicYear, useTransaction = true) {
  if (useTransaction) await db.runQuery('BEGIN TRANSACTION;');
  try {
    const annualFee = parseFloat(await getSetting('annual_fee') || '0');
    if (annualFee <= 0) {
      const errorMsg = 'الرسوم السنوية غير محددة أو تساوي صفر. يرجى تحديدها في الإعدادات.';
      console.log(errorMsg);
      if (useTransaction) await db.runQuery('ROLLBACK;');
      throw new Error(errorMsg);
    }

    const students = await db.allQuery(
      "SELECT id FROM students WHERE status = 'active' AND (fee_category = 'CAN_PAY' OR fee_category = 'SPONSORED')"
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
          VALUES (?, ?, 'ANNUAL', ?, ?, ?, 'UNPAID')
        `, [student.id, chargeDate, `رسوم سنوية - ${academicYear}`, annualFee, academicYear]);
      }
    }

    if (useTransaction) await db.runQuery('COMMIT;');
  } catch (error) {
    if (useTransaction) await db.runQuery('ROLLBACK;');
    logError('Error in generateAnnualFeeCharges:', error);
    throw new Error('Failed to generate annual fee charges.');
  }
}

/**
 * Generates monthly fee charges for all eligible students.
 * @param {string} academicYear The academic year for which to generate charges.
 * @param {number} month The month for which to generate charges (1-12).
 * @param {boolean} useTransaction Whether to wrap in transaction (default: false)
 * @param {boolean} force Whether to force regeneration even if charges exist (default: false)
 */
async function generateMonthlyFeeCharges(academicYear, month, useTransaction = false, force = false) {
  if (useTransaction) await db.runQuery('BEGIN TRANSACTION;');
  try {
    const standardMonthlyFee = parseFloat(await getSetting('standard_monthly_fee') || '0');
    if (standardMonthlyFee <= 0) {
      const errorMsg = 'الرسوم الشهرية غير محددة أو تساوي صفر. يرجى تحديدها في الإعدادات.';
      console.log(errorMsg);
      if (useTransaction) await db.runQuery('ROLLBACK;');
      throw new Error(errorMsg);
    }
    const chargeDate = new Date().toISOString().split('T')[0];

    // Get all active students (including sponsored) with discount info
    const students = await db.allQuery(
      "SELECT id, gender, discount_percentage FROM students WHERE status = 'active' AND (fee_category = 'CAN_PAY' OR fee_category = 'SPONSORED')"
    );

    for (const student of students) {
      // Enhanced duplicate prevention: Check by academic_year, month name in description, and charge_date
      // Get Arabic month name for checking
      const monthNames = [
        'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
        'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
      ];
      const monthName = monthNames[month - 1];

      // Check for existing charge with multiple criteria to prevent duplicates
      const existingCharge = await db.getQuery(`
        SELECT id FROM student_fee_charges
        WHERE student_id = ?
        AND fee_type = 'MONTHLY'
        AND academic_year = ?
        AND description LIKE ?
        AND strftime('%m', charge_date) = ?
      `, [
        student.id,
        academicYear,
        `%${monthName}%`,
        month.toString().padStart(2, '0')
      ]);

      if (existingCharge && !force) {
        console.log(`[generateMonthlyFeeCharges] Skipping student ${student.id} - charge already exists for ${academicYear} month ${month} (${monthName})`);
        continue;
      } else if (existingCharge && force) {
        console.log(`[generateMonthlyFeeCharges] Force regenerating charge for student ${student.id} - replacing existing charge ${existingCharge.id}`);
        // Optionally delete the old charge if force is true
        await db.runQuery('DELETE FROM student_fee_charges WHERE id = ?', [existingCharge.id]);
      }

      // Get the student's enrolled classes
      const enrolledClasses = await db.allQuery(`
        SELECT c.fee_type, c.monthly_fee, c.gender FROM classes c
        JOIN class_students cs ON c.id = cs.class_id
        WHERE cs.student_id = ? AND c.status = 'active'
      `, [student.id]);

      let totalMonthlyFee = 0;
      const hasStandardClass = enrolledClasses.some(c => c.fee_type === 'standard');
      
      // If student has no classes OR has standard classes, apply standard monthly fee
      const shouldApplyStandardFee = enrolledClasses.length === 0 || hasStandardClass;
      
      if (shouldApplyStandardFee && standardMonthlyFee > 0) {
        // Check payment frequency based on all standard classes (most restrictive)
        const standardClasses = enrolledClasses.filter(c => c.fee_type === 'standard');
        let paymentFrequency = 'MONTHLY';  // Default
        
        // Check all standard classes and use most restrictive (ANNUAL)
        for (const stdClass of standardClasses) {
          let classFrequency = 'MONTHLY';
          if (stdClass.gender === 'men') {
            classFrequency = await getSetting('men_payment_frequency') || 'MONTHLY';
          } else if (stdClass.gender === 'women') {
            classFrequency = await getSetting('women_payment_frequency') || 'MONTHLY';
          } else if (stdClass.gender === 'kids') {
            classFrequency = await getSetting('kids_payment_frequency') || 'MONTHLY';
          }
          // If ANY class is ANNUAL, use ANNUAL (most restrictive)
          if (classFrequency === 'ANNUAL') {
            paymentFrequency = 'ANNUAL';
            break;
          }
        }

        // For ANNUAL payment, only generate charge once (in first month or if not exists)
        if (paymentFrequency === 'ANNUAL') {
          // Use reliable database column instead of fragile description search
          const existingAnnualMonthly = await db.getQuery(`
            SELECT id FROM student_fee_charges
            WHERE student_id = ? AND fee_type = 'MONTHLY' AND academic_year = ? AND payment_frequency = 'ANNUAL'
          `, [student.id, academicYear]);

          if (!existingAnnualMonthly) {
            totalMonthlyFee += standardMonthlyFee;
          }
        } else {
          // MONTHLY payment
          totalMonthlyFee += standardMonthlyFee;
        }
      }

      // Add custom monthly fees from special classes
      enrolledClasses.forEach(c => {
        if (c.fee_type === 'special' && c.monthly_fee > 0) {
          totalMonthlyFee += c.monthly_fee;
        }
      });

      if (totalMonthlyFee > 0) {
        // Apply student discount if exists
        const discount = student.discount_percentage || 0;
        if (discount > 0) {
          totalMonthlyFee = totalMonthlyFee * (1 - discount / 100);
        }

        // Get Arabic month name
        const monthNames = [
          'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
          'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
        ];
        const monthName = monthNames[month - 1];

        // Use the CONSISTENT paymentFrequency determined above (lines 176-192)
        // This fixes the bug: description now matches charge generation logic
        const description = paymentFrequency === 'ANNUAL'
          ? `رسوم شهرية ${monthName} (دفع سنوي) - ${academicYear}`
          : `رسوم شهرية ${monthName} - ${academicYear}`;

        await db.runQuery(`
          INSERT INTO student_fee_charges (student_id, charge_date, fee_type, description, amount, academic_year, status, payment_frequency)
          VALUES (?, ?, 'MONTHLY', ?, ?, ?, 'UNPAID', ?)
        `, [student.id, chargeDate, description, totalMonthlyFee, academicYear, paymentFrequency]);
      }
    }

    if (useTransaction) await db.runQuery('COMMIT;');
  } catch (error) {
    if (useTransaction) await db.runQuery('ROLLBACK;');
    logError('Error in generateMonthlyFeeCharges:', error);
    throw error;
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

    let totalDue = 0;
    let totalPaid = 0;
    let totalCredit = 0;

    for (const charge of charges) {
      if (charge.fee_type === 'CREDIT') {
        // Credit charges reduce the balance (they're prepaid amounts)
        totalCredit += charge.amount_paid;
      } else {
        // Regular charges increase the amount due
        totalDue += charge.amount;
        totalPaid += charge.amount_paid;
      }
    }

    // Balance = amount due - amount paid - credit
    const balance = totalDue - totalPaid - totalCredit;

    return {
      charges,
      totalDue,
      totalPaid,
      totalCredit,
      balance,
    };
  } catch (error) {
    logError('Error in getStudentFeeStatus:', error);
    throw new Error('Failed to get student fee status.');
  }
}

/**
 * Gets a student's balance summary with proper positive/credit handling
 * @param {number} studentId The ID of the student.
 * @returns {Promise<object>} Balance summary object
 */
async function getStudentBalanceSummary(studentId) {
  try {
    const feeStatus = await getStudentFeeStatus(studentId);

    // Base balance calculation remains the same for compatibility
    // But we provide better display properties
    const { balance, totalCredit } = feeStatus;

    // Positive balance means money owed
    // Negative balance means credit available
    if (balance >= 0) {
      return {
        ...feeStatus,
        displayType: 'owed',
        displayAmount: balance,
        displayLabel: 'المبلغ المستحق', // Amount Owed
        displayClass: 'text-danger fw-bold'
      };
    } else {
      return {
        ...feeStatus,
        displayType: 'credit',
        displayAmount: Math.abs(balance), // Make positive
        displayLabel: 'رصيد متاح', // Available Credit
        displayClass: 'text-success fw-bold'
      };
    }
  } catch (error) {
    logError('Error in getStudentBalanceSummary:', error);
    throw new Error('Failed to get student balance summary.');
  }
}

/**
 * Auto-generates charges for a student if they have no unpaid charges.
 * @param {number} studentId The student ID
 * @param {string} academicYear The academic year
 */
async function autoGenerateChargesIfNeeded(studentId, academicYear) {
  // Check if student has any unpaid/partially paid charges
  const unpaidCharges = await db.allQuery(`
    SELECT id FROM student_fee_charges
    WHERE student_id = ? AND status IN ('UNPAID', 'PARTIALLY_PAID')
  `, [studentId]);

  if (unpaidCharges.length > 0) {
    return; // Student has unpaid charges, no need to generate
  }

  // Student has no unpaid charges - generate next month's charges
  const currentMonth = new Date().getMonth() + 1;
  const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;

  // Use next calendar year for year-end charges
  let nextAcademicYear;
  if (currentMonth === 12) {
    nextAcademicYear = (new Date().getFullYear() + 1).toString();
  } else {
    nextAcademicYear = academicYear;
  }

  // Generate monthly charges for next month
  await generateMonthlyFeeCharges(nextAcademicYear, nextMonth, false);
}

/**
 * Records a payment for a student.
 * @param {object} event The IPC event object.
 * @param {object} paymentDetails The details of the payment.
 * @returns {Promise<object>} The newly created student payment record.
 */
async function recordStudentPayment(event, paymentDetails) {
  const { student_id, amount, payment_method, check_number, payment_type, notes, academic_year, receipt_number, class_id } = paymentDetails;

  console.log(`[PAYMENT_START] Recording payment for student ${student_id}, amount: ${amount}, method: ${payment_method}`);

  let transactionStarted = false;
  try {
    console.log(`[PAYMENT_DB] Starting transaction...`);
    await db.runQuery('BEGIN TRANSACTION;');
    transactionStarted = true;
    console.log(`[PAYMENT_DB] Transaction started successfully`);

    // Auto-generate charges if student has no unpaid charges
    console.log(`[PAYMENT_AUTO_GEN] Checking if auto-generation needed for student ${student_id}`);
    await autoGenerateChargesIfNeeded(student_id, academic_year || new Date().getFullYear().toString());
    console.log(`[PAYMENT_AUTO_GEN] Auto-generation check completed`);

    // Validate receipt number uniqueness across all income tables
    if (receipt_number) {
      console.log(`[PAYMENT_RECEIPT] Validating receipt number: ${receipt_number}`);
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
        console.log(`[PAYMENT_RECEIPT] Duplicate receipt found - existingPayment: ${!!existingPayment}, existingDonation: ${!!existingDonation}, existingStudentPayment: ${!!existingStudentPayment}`);
        throw new Error('DUPLICATE_RECEIPT');
      }
      console.log(`[PAYMENT_RECEIPT] Receipt validation passed`);
    }

    // 1. Create a student_payment record
    console.log(`[PAYMENT_DB] Creating payment record...`);
    const paymentResult = await db.runQuery(`
      INSERT INTO student_payments (student_id, amount, payment_method, payment_type, academic_year, notes, check_number, receipt_number, class_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [student_id, amount, payment_method, payment_type || 'CUSTOM', academic_year || new Date().getFullYear().toString(), notes, check_number, receipt_number, class_id]);

    const studentPaymentId = paymentResult.id;
    console.log(`[PAYMENT_DB] Payment record created with ID: ${studentPaymentId}`);

    // 2. First, apply payment to consume existing credit (if any)
    console.log(`[PAYMENT_CREDIT] Checking for existing credit for student ${student_id}...`);
    const existingCreditCharges = await db.allQuery(`
      SELECT * FROM student_fee_charges
      WHERE student_id = ? AND fee_type = 'CREDIT' AND amount_paid > 0
      ORDER BY created_at ASC
    `, [student_id]);

    console.log(`[PAYMENT_CREDIT] Found ${existingCreditCharges.length} credit charges`);
    let remainingAmountToApply = amount;
    let totalCreditConsumed = 0;

    // Consume credit first (oldest credit first)
    for (const creditCharge of existingCreditCharges) {
      if (remainingAmountToApply <= 0) break;

      const availableCredit = creditCharge.amount_paid; // Credit amount available
      const creditToConsume = Math.min(remainingAmountToApply, availableCredit);

      console.log(`[PAYMENT_CREDIT] Consuming ${creditToConsume} from credit charge ${creditCharge.id} (available: ${availableCredit})`);

      // Reduce the credit amount
      const newCreditAmount = availableCredit - creditToConsume;
      await db.runQuery(`
        UPDATE student_fee_charges
        SET amount_paid = ?
        WHERE id = ?
      `, [newCreditAmount, creditCharge.id]);

      remainingAmountToApply -= creditToConsume;
      totalCreditConsumed += creditToConsume;

      console.log(`[PAYMENT_CREDIT] Credit consumed. Remaining to apply: ${remainingAmountToApply}, Total credit consumed: ${totalCreditConsumed}`);
    }

    // 3. Apply remaining payment to outstanding charges (FIFO)
    console.log(`[PAYMENT_CHARGES] Applying remaining amount ${remainingAmountToApply} to outstanding charges...`);
    const outstandingCharges = await db.allQuery(`
      SELECT * FROM student_fee_charges
      WHERE student_id = ? AND status IN ('UNPAID', 'PARTIALLY_PAID') AND fee_type != 'CREDIT'
      ORDER BY due_date ASC, created_at ASC
    `, [student_id]);

    console.log(`[PAYMENT_CHARGES] Found ${outstandingCharges.length} outstanding charges to apply payment to`);

    for (const charge of outstandingCharges) {
      if (remainingAmountToApply <= 0) break;

      const chargeBalance = charge.amount - charge.amount_paid;
      const amountToApplyToCharge = Math.min(remainingAmountToApply, chargeBalance);

      console.log(`[PAYMENT_CHARGES] Applying ${amountToApplyToCharge} to charge ${charge.id} (${charge.description}) - balance was ${chargeBalance}`);

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
      console.log(`[PAYMENT_CHARGES] Charge ${charge.id} updated. New status: ${newStatus}, remaining to apply: ${remainingAmountToApply}`);
    }

    // 2.5. Handle overpayment - store as credit for future charges
    if (remainingAmountToApply > 0) {
      console.log(`[PAYMENT_OVERPAYMENT] Student ${student_id} overpaid by ${remainingAmountToApply}. Storing as credit.`);

      // Update the payment record to reflect the credit amount
      await db.runQuery(`
        UPDATE student_payments
        SET notes = COALESCE(notes, '') || ' | رصيد زائد: ' || ? || ' د.ت'
        WHERE id = ?
      `, [remainingAmountToApply.toFixed(2), studentPaymentId]);

      // Create a special "credit" charge that can be applied to future charges
      // This ensures the credit appears in the student's balance calculations
      await db.runQuery(`
        INSERT INTO student_fee_charges (
          student_id,
          charge_date,
          due_date,
          fee_type,
          description,
          amount,
          amount_paid,
          status,
          academic_year
        ) VALUES (?, ?, ?, 'CREDIT', ?, ?, ?, 'PAID', ?)
      `, [
        student_id,
        new Date().toISOString().split('T')[0], // charge_date
        new Date().toISOString().split('T')[0], // due_date (immediate)
        `رصيد زائد من دفعة سابقة (${remainingAmountToApply.toFixed(2)} د.ت)`,
        0, // amount (credit has no charge amount)
        remainingAmountToApply, // amount_paid (the credit amount)
        academic_year || new Date().getFullYear().toString()
      ]);
      console.log(`[PAYMENT_OVERPAYMENT] Credit charge created for ${remainingAmountToApply}`);
    }

    // 3. Create a corresponding transaction record
    log(`[PAYMENT_TRANSACTION] Creating transaction record...`);
    const student = await db.getQuery('SELECT name, matricule FROM students WHERE id = ?', [student_id]);
    const transactionDescription = `دفعة رسوم من الطالب: ${student.name} - ${payment_type || 'رسوم'}`;

    // Note: You might want to make the account_id dynamic
    const transactionResult = await db.runQuery(`
      INSERT INTO transactions (type, category, amount, transaction_date, description, payment_method, check_number, receipt_number, receipt_type, account_id, related_person_name, related_entity_type, related_entity_id, created_by_user_id)
      VALUES ('INCOME', 'رسوم الطلاب', ?, ?, ?, ?, ?, ?, ?, 1, ?, 'Student', ?, ?)
    `, [amount, new Date().toISOString().split('T')[0], transactionDescription, payment_method, check_number, receipt_number, payment_type, student.name, student_id, event.sender.userId]);

    // Link the transaction to the payment
    await db.runQuery(
      'UPDATE student_payments SET transaction_id = ? WHERE id = ?',
      [transactionResult.id, studentPaymentId]
    );

    log(`[PAYMENT_COMMIT] Committing transaction...`);
    await db.runQuery('COMMIT;');
    log(`[PAYMENT_SUCCESS] Payment recorded successfully with ID: ${studentPaymentId}`);

    return await db.getQuery('SELECT * FROM student_payments WHERE id = ?', [studentPaymentId]);
  } catch (error) {
    if (transactionStarted) {
      try {
        await db.runQuery('ROLLBACK;');
      } catch (rollbackError) {
        logError('Failed to rollback transaction:', rollbackError);
      }
    }
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

  ipcMain.handle('student-fees:getBalanceSummary', requireRoles(['Superadmin', 'Administrator', 'FinanceManager'])(async (event, studentId) => {
    try {
      return await getStudentBalanceSummary(studentId);
    } catch (error) {
      logError('Error getting student balance summary:', error);
      throw new Error('Failed to get student balance summary.');
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
      const result = await generateAnnualFeeCharges(academicYear);
      return {
        success: true,
        message: `تم إنشاء الرسوم السنوية للعام ${academicYear} بنجاح`,
        details: result
      };
    } catch (error) {
      logError('Error generating annual charges:', error);
      throw new Error('فشل في إنشاء الرسوم السنوية');
    }
  }));

  ipcMain.handle('student-fees:generateMonthlyCharges', requireRoles(['Superadmin', 'Administrator', 'FinanceManager'])(async (_event, data) => {
    try {
      const { academicYear, month } = data;
      const result = await generateMonthlyFeeCharges(academicYear, month, true);
      const monthNames = [
        'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
        'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
      ];
      const monthName = monthNames[month - 1];
      return {
        success: true,
        message: `تم إنشاء الرسوم الشهرية لشهر ${monthName} ${academicYear} بنجاح`,
        details: result
      };
    } catch (error) {
      logError('Error generating monthly charges:', error);
      throw new Error('فشل في إنشاء الرسوم الشهرية');
    }
  }));

  ipcMain.handle('student-fees:generateAllCharges', requireRoles(['Superadmin', 'Administrator', 'FinanceManager'])(async (_event, academicYear, force = false) => {
    let transactionStarted = false;
    try {
      log('[generateAllCharges] Starting charge generation for academic year:', academicYear);
      await db.runQuery('BEGIN TRANSACTION;');
      transactionStarted = true;

      // Generate annual charges for the year (without nested transaction)
      log('[generateAllCharges] Generating annual charges...');
      await generateAnnualFeeCharges(academicYear, false);
      log('[generateAllCharges] Annual charges generated successfully');

      // Generate monthly charges for ONLY current month (not 3 months)
      const currentMonth = new Date().getMonth() + 1;
      log(`[generateAllCharges] Generating charges for current month: ${currentMonth}`);
      await generateMonthlyFeeCharges(academicYear, currentMonth, false, force);

      await db.runQuery('COMMIT;');
      log('[generateAllCharges] All charges generated successfully');
      return { success: true, message: 'تم إنشاء جميع الرسوم بنجاح' };
    } catch (error) {
      if (transactionStarted) {
        try {
          await db.runQuery('ROLLBACK;');
        } catch (rollbackError) {
          logError('Failed to rollback transaction in generateAllCharges:', rollbackError);
        }
      }
      logError('[generateAllCharges] Error details:', error);
      logError('Error generating all charges:', error);
      throw error; // Throw original error to see the actual message
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

/**
 * Checks all students and generates missing charges for them.
 * Used after database import to ensure all students have proper charges.
 */
async function checkAndGenerateChargesForAllStudents(settings) {
  try {
    // Use provided settings to check if fees are configured
    const annualFee = parseFloat(settings.annual_fee || '0');
    const monthlyFee = parseFloat(settings.standard_monthly_fee || '0');
    
    log(`[checkAndGenerateChargesForAllStudents] Annual fee: ${annualFee}, Monthly fee: ${monthlyFee}`);
    
    if (annualFee <= 0 && monthlyFee <= 0) {
      log('[checkAndGenerateChargesForAllStudents] Fees not configured yet - skipping charge generation');
      return { success: true, studentsProcessed: 0, skipped: true, message: 'Fees not configured' };
    }
    
    const startMonth = parseInt(settings.academic_year_start_month || 9);
    const academicYear = getCurrentAcademicYear(startMonth);
    log(`[checkAndGenerateChargesForAllStudents] Using academic year: ${academicYear}`);
    
    const students = await db.allQuery(
      "SELECT id FROM students WHERE status = 'active' AND (fee_category = 'CAN_PAY' OR fee_category = 'SPONSORED')"
    );

    if (students.length === 0) {
      log('[DB Import] No eligible students found - skipping charge generation');
      return { success: true, studentsProcessed: 0 };
    }

    await db.runQuery('BEGIN TRANSACTION;');
    
    let chargesGenerated = false;
    
    // Generate annual charges if configured
    if (annualFee > 0) {
      log(`[checkAndGenerateChargesForAllStudents] Generating annual charges for ${students.length} students...`);
      try {
        await generateAnnualFeeCharges(academicYear, false);
        log(`[checkAndGenerateChargesForAllStudents] Annual charges generated successfully`);
        chargesGenerated = true;
      } catch (error) {
        logError(`[checkAndGenerateChargesForAllStudents] Error generating annual charges:`, error);
        // Continue to monthly charges even if annual fails
      }
    } else {
      log(`[checkAndGenerateChargesForAllStudents] Skipping annual charges (fee is 0)`);
    }
    
    // Generate monthly charges if configured (only current month)
    if (monthlyFee > 0) {
      const currentMonth = new Date().getMonth() + 1;
      log(`[checkAndGenerateChargesForAllStudents] Generating charges for current month: ${currentMonth}`);
      try {
        await generateMonthlyFeeCharges(academicYear, currentMonth, false);
        log(`[checkAndGenerateChargesForAllStudents] Monthly charges generated successfully`);
        chargesGenerated = true;
      } catch (error) {
        logError(`[checkAndGenerateChargesForAllStudents] Error generating monthly charges:`, error);
      }
    } else {
      log(`[checkAndGenerateChargesForAllStudents] Skipping monthly charges (fee is 0)`);
    }
    
    await db.runQuery('COMMIT;');
    log(`[checkAndGenerateChargesForAllStudents] Transaction committed. Charges generated: ${chargesGenerated}`);
    
    return { success: true, studentsProcessed: students.length };
  } catch (error) {
    try {
      await db.runQuery('ROLLBACK;');
    } catch (rollbackError) {
      logError('[checkAndGenerateChargesForAllStudents] Rollback error:', rollbackError);
    }
    logError('Error in checkAndGenerateChargesForAllStudents:', error);
    logError('[checkAndGenerateChargesForAllStudents] Full error:', error);
    return { success: false, message: error.message };
  }
}

module.exports = {
  registerStudentFeeHandlers,
  generateAnnualFeeCharges,
  generateMonthlyFeeCharges,
  getStudentFeeStatus,
  recordStudentPayment,
  checkAndGenerateChargesForAllStudents,
  getCurrentAcademicYear,
};
