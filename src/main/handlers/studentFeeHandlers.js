/**
 * @fileoverview IPC handlers for student fee management
 * @author Quran Branch Manager Team
 * @version 1.0.0
 */

const { ipcMain } = require('electron');
const db = require('../../db/db');
const { requireRoles } = require('../authMiddleware');
const { log, error: logError, warn: logWarn } = require('../logger');
const { generateReceiptNumber, getReceiptBookStats } = require('../services/receiptService');
const { studentPaymentValidationSchema } = require('../validationSchemas');
// Circular dependency broken: require('./settingsHandlers') moved to where it is needed

// ============================================
// RACE CONDITION PREVENTION: Locks for charge regeneration
// ============================================

// Track which students are currently having their charges regenerated
const chargeRegenerationLocks = new Set();

/**
 * Acquires a lock for a student to prevent race conditions during charge regeneration.
 * @param {number} studentId - Student ID
 * @returns {Promise<boolean>} - true if lock acquired, false if already locked
 */
function acquireChargeRegenerationLock(studentId) {
  const lockKey = `charge-regen-${studentId}`;
  if (chargeRegenerationLocks.has(lockKey)) {
    log(
      `[ChargeRegen-Lock] ⚠️ Lock already held for student ${studentId} - request rejected to prevent race condition`,
    );
    return false;
  }
  chargeRegenerationLocks.add(lockKey);
  log(`[ChargeRegen-Lock] 🔒 Lock acquired for student ${studentId}`);
  return true;
}

/**
 * Releases a lock for a student after charge regeneration completes.
 * @param {number} studentId - Student ID
 */
function releaseChargeRegenerationLock(studentId) {
  const lockKey = `charge-regen-${studentId}`;
  chargeRegenerationLocks.delete(lockKey);
  log(`[ChargeRegen-Lock] 🔓 Lock released for student ${studentId}`);
}

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
 * Gets the current academic year based on the configured start month.
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

/**
 * Calculates student age from DOB string.
 * @param {string} dob Date of birth in YYYY-MM-DD
 * @returns {number|null} Age or null
 */
function calculateAge(dob) {
  if (!dob) return null;
  const birthDate = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

/**
 * Finds the matching age group for a student and returns its fee settings.
 * @param {number} studentId Student ID
 * @returns {Promise<Object|null>} Age group fees or null
 */
async function getStudentAgeGroupFees(studentId) {
  const student = await db.getQuery('SELECT date_of_birth, gender FROM students WHERE id = ?', [
    studentId,
  ]);
  if (!student) return null;

  const age = calculateAge(student.date_of_birth);
  if (age === null) return null;

  const genderMap = {
    M: 'male_only',
    F: 'female_only',
    male: 'male_only',
    female: 'female_only',
    'ذكر': 'male_only',
    'أنثى': 'female_only',
    'any': 'any',
  };
  const studentGenderMapped = genderMap[student.gender] || 'any';

  const ageGroup = await db.getQuery(
    `SELECT registration_fee, monthly_fee, payment_frequency
     FROM age_groups
     WHERE is_active = 1
     AND min_age <= ?
     AND (max_age IS NULL OR max_age >= ?)
     AND (gender = 'any' OR gender = ?)
     ORDER BY min_age DESC LIMIT 1`, // Using DESC to match the most specific group if overlaps exist
    [age, age, studentGenderMapped],
  );

  return ageGroup;
}

// ============================================
// CHARGE GENERATION
// ============================================

async function generateAnnualFeeCharges(academicYear, studentId = null) {
  return db.withTransaction(async () => {
    const annualFeeSetting = await getSetting('annual_fee');
    const globalAnnualFee = parseFloat(annualFeeSetting || '0');

    let students;
    if (studentId) {
      students = await db.allQuery(
        "SELECT id FROM students WHERE id = ? AND status = 'active' AND (fee_category = 'CAN_PAY' OR fee_category = 'SPONSORED')",
        [studentId],
      );
    } else {
      students = await db.allQuery(
        "SELECT id FROM students WHERE status = 'active' AND (fee_category = 'CAN_PAY' OR fee_category = 'SPONSORED')",
      );
    }

    const chargeDate = new Date().toISOString().split('T')[0];
    let createdCount = 0;

    for (const student of students) {
      // Check for age group specific registration fee
      const ageGroupFees = await getStudentAgeGroupFees(student.id);
      let feeToCharge = globalAnnualFee;
      let paymentFrequency = 'ANNUAL';

      if (ageGroupFees) {
        if (ageGroupFees.registration_fee > 0) {
          feeToCharge = ageGroupFees.registration_fee;
        }
        paymentFrequency = ageGroupFees.payment_frequency || 'ANNUAL';
      }

      if (feeToCharge <= 0) continue;

      const existingCharge = await db.getQuery(
        `SELECT id FROM student_fee_charges WHERE student_id = ? AND fee_type = 'ANNUAL' AND academic_year = ?`,
        [student.id, academicYear],
      );

      if (!existingCharge) {
        await db.runQuery(
          `INSERT INTO student_fee_charges (student_id, charge_date, fee_type, description, amount, academic_year, status, payment_frequency)
           VALUES (?, ?, 'ANNUAL', ?, ?, ?, 'UNPAID', ?)`,
          [
            student.id,
            chargeDate,
            `معلوم الترسيم السنوي - ${academicYear}`,
            feeToCharge,
            academicYear,
            paymentFrequency,
          ],
        );
        createdCount++;
      }
    }
    log(`[FeeGen] Generated ${createdCount} annual charges for ${academicYear}`);
    return { success: true, createdCount };
  });
}

/**
 * Generates monthly fee charges for all eligible students or a specific student.
 * @param {string} academicYear The academic year for which to generate charges.
 * @param {number} month The month for which to generate charges (1-12).
 * @param {boolean} force Whether to force regeneration even if charges exist (default: false)
 * @param {number|null} studentId Optional student ID to generate charges for ONLY that student.
 */
async function generateMonthlyFeeCharges(academicYear, month, force = false, studentId = null) {
  return db.withTransaction(async () => {
    const standardFeeSetting = await getSetting('standard_monthly_fee');
    const globalStandardMonthlyFee = parseFloat(standardFeeSetting || '0');
    
    const startMonthSetting = await getSetting('academic_year_start_month');
    const startMonth = parseInt(startMonthSetting || '9');

    const now = new Date();
    const chargeDate = now.toISOString().split('T')[0];
    const dueDate = new Date(academicYear.split('-')[0], month - 1, 15).toISOString().split('T')[0];

    const TUNISIAN_MONTHS = [
      'جانفي',
      'فيفري',
      'مارس',
      'أفريل',
      'ماي',
      'جوان',
      'جويلية',
      'أوت',
      'سبتمبر',
      'أكتوبر',
      'نوفمبر',
      'ديسمبر',
    ];
    const monthName = TUNISIAN_MONTHS[month - 1];

    let students;
    if (studentId) {
      students = await db.allQuery(
        "SELECT id, gender, discount_percentage, custom_fee_amount FROM students WHERE id = ? AND status = 'active' AND (fee_category = 'CAN_PAY' OR fee_category = 'SPONSORED')",
        [studentId],
      );
    } else {
      students = await db.allQuery(
        "SELECT id, gender, discount_percentage, custom_fee_amount FROM students WHERE status = 'active' AND (fee_category = 'CAN_PAY' OR fee_category = 'SPONSORED')",
      );
    }

    let createdCount = 0;

    for (const student of students) {
      // Check for age group specific settings
      const ageGroupFees = await getStudentAgeGroupFees(student.id);
      let baseMonthlyFee = globalStandardMonthlyFee;
      let paymentFrequency = 'MONTHLY';

      if (ageGroupFees) {
        if (ageGroupFees.monthly_fee > 0) {
          baseMonthlyFee = ageGroupFees.monthly_fee;
        }
        paymentFrequency = ageGroupFees.payment_frequency || 'MONTHLY';
      }

      // If frequency is ANNUAL, we skip generating MONTHLY charges
      if (paymentFrequency === 'ANNUAL') continue;

      // Check if student already has a monthly charge for this specific month/year
      const existingCharge = await db.getQuery(
        `SELECT id, status FROM student_fee_charges
         WHERE student_id = ? AND fee_type = 'MONTHLY' AND description LIKE ? AND academic_year = ?`,
        [student.id, `%${monthName}%`, academicYear],
      );

      if (existingCharge) {
        if (!force) continue;
        if (existingCharge.status !== 'UNPAID') continue;
        await db.runQuery('DELETE FROM student_fee_charges WHERE id = ?', [existingCharge.id]);
      }

      const enrolledClasses = await db.allQuery(
        `SELECT c.fee_type, c.monthly_fee FROM classes c JOIN class_students cs ON c.id = cs.class_id WHERE cs.student_id = ? AND c.status = 'active'`,
        [student.id],
      );

      let totalMonthlyFee = 0;

      if (student.custom_fee_amount !== null && student.custom_fee_amount > 0) {
        totalMonthlyFee = student.custom_fee_amount;
      } else {
        const hasStandardClass = enrolledClasses.some((c) => c.fee_type === 'standard');
        if (enrolledClasses.length === 0 || hasStandardClass) {
          totalMonthlyFee += baseMonthlyFee;
        }

        enrolledClasses.forEach((c) => {
          if (c.fee_type === 'special' && c.monthly_fee > 0) totalMonthlyFee += c.monthly_fee;
        });

        // Apply student discount (Fixed amount) if not using custom fee
        if (student.discount_percentage > 0) {
          totalMonthlyFee -= student.discount_percentage;
          if (totalMonthlyFee < 0) totalMonthlyFee = 0;
        }
      }

      if (totalMonthlyFee > 0) {
        await db.runQuery(
          `INSERT INTO student_fee_charges (student_id, charge_date, due_date, fee_type, description, amount, academic_year, status, payment_frequency, fee_month)
           VALUES (?, ?, ?, 'MONTHLY', ?, ?, ?, 'UNPAID', ?, ?)`,
            [
              student.id,
              chargeDate,
              dueDate,
              `شهر ${monthName} ${month >= startMonth ? parseInt(academicYear.split('-')[0]) : parseInt(academicYear.split('-')[1])}`,
              totalMonthlyFee,
              academicYear,
            paymentFrequency,
            month,
          ],
        );
        createdCount++;
      }
    }
    log(`[FeeGen] Generated ${createdCount} monthly charges for ${academicYear}-${month}`);
    return { success: true, createdCount };
  });
}

// ============================================
// ENROLLMENT-TRIGGERED CHARGE GENERATION
// ============================================

/**
 * Calculates monthly fees for a specific student based on current enrollments.
 * Supports both standard and special (custom) class fees.
 * @param {number} studentId - Student ID
 * @param {number} month - Month (1-12)
 * @param {string} academicYear - Academic year (e.g., "2024-2025")
 * @returns {Promise<{standard: number, custom: number, total: number}>} Fee breakdown
 */
async function calculateStudentMonthlyCharges(studentId, month, academicYear) {
  try {
    const standardFeeSetting = await getSetting('standard_monthly_fee');
    const globalStandardMonthlyFee = parseFloat(standardFeeSetting || '0');

    const student = await db.getQuery('SELECT discount_percentage, custom_fee_amount FROM students WHERE id = ?', [
      studentId,
    ]);

    // Check for age group specific settings
    const ageGroupFees = await getStudentAgeGroupFees(studentId);
    let baseMonthlyFee = globalStandardMonthlyFee;
    let paymentFrequency = 'MONTHLY';

    if (ageGroupFees) {
      if (ageGroupFees.monthly_fee > 0) {
        baseMonthlyFee = ageGroupFees.monthly_fee;
      }
      paymentFrequency = ageGroupFees.payment_frequency || 'MONTHLY';
    }

    const enrolledClasses = await db.allQuery(
      `
      SELECT c.id, c.name, c.fee_type, c.monthly_fee FROM classes c
      JOIN class_students cs ON c.id = cs.class_id
      WHERE cs.student_id = ? AND c.status = 'active'
    `,
      [studentId],
    );

    let fees = {
      standard: 0,
      custom: 0,
      total: 0,
      paymentFrequency,
    };

    const hasStandardClass = enrolledClasses.some((c) => c.fee_type === 'standard');

    if (student?.custom_fee_amount !== null && student?.custom_fee_amount > 0) {
      fees.total = student.custom_fee_amount;
    } else {
      // Apply base fee (age group or global) if student has standard class or no classes
      if (enrolledClasses.length === 0 || hasStandardClass) {
        fees.standard = baseMonthlyFee;
      }

      // Sum fees from special classes
      enrolledClasses.forEach((c) => {
        if (c.fee_type === 'special' && c.monthly_fee > 0) {
          fees.custom += c.monthly_fee;
        }
      });

      fees.total = fees.standard + fees.custom;

      // Apply fixed amount discount if not using custom fee
      if (student?.discount_percentage > 0) {
        fees.total -= student.discount_percentage;
        if (fees.total < 0) fees.total = 0;
      }
    }

    return fees;
  } catch (error) {
    logError(
      `[calculateStudentMonthlyCharges] Error calculating fees for student ${studentId}:`,
      error,
    );
    return { standard: 0, custom: 0, total: 0, paymentFrequency: 'MONTHLY' };
  }
}

/**
 * Triggers immediate charge regeneration for a student when enrollment changes.
 * Deletes and recreates charges for current month ONLY during enrollment.
 * Next month charges are generated by the scheduler when the month arrives.
 * Called when student is added/removed from classes or when fee struct changes.
 * @param {number} studentId - Student ID
 * @param {Object} options - Options
 * @param {boolean} options.regenCurrentMonth - Regen current month (default: true)
 * @param {boolean} options.regenNextMonth - Regen next month (default: false)
 * @param {boolean} options.regenAllUnpaidInYear - Regen all unpaid monthly charges in current year (default: false)
 * @param {number} options.userId - User performing action (for audit)
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function triggerChargeRegenerationForStudent(studentId, options = {}) {
  const { 
    regenCurrentMonth = true, 
    regenNextMonth = false, 
    regenAllUnpaidInYear = false 
  } = options;

  // RACE CONDITION FIX: Check if this student is already being processed
  if (!acquireChargeRegenerationLock(studentId)) {
    log(
      `[ChargeRegen] ⚠️ Charge regeneration already in progress for student ${studentId} - rejecting duplicate request`,
    );
    return { success: false, message: 'Charge regeneration already in progress for this student' };
  }

  try {
    log(`[ChargeRegen] ════════════════════════════════════════════════════`);
    log(`[ChargeRegen] Starting charge regeneration for student ${studentId}`);
    log(
      `[ChargeRegen] Options: regenCurrentMonth=${regenCurrentMonth}, regenNextMonth=${regenNextMonth}, regenAllUnpaidInYear=${regenAllUnpaidInYear}`,
    );

    const student = await db.getQuery(
      'SELECT id, name, status, fee_category FROM students WHERE id = ?',
      [studentId],
    );

    if (!student) {
      log(`[ChargeRegen] ❌ Student ${studentId} not found`);
      releaseChargeRegenerationLock(studentId);
      return { success: true, message: 'Student not found' };
    }

    log(
      `[ChargeRegen] Student: ${student.name} (ID: ${studentId}, Status: ${student.status}, Category: ${student.fee_category})`,
    );

    if (student.status !== 'active' || student.fee_category === 'EXEMPT') {
      log(`[ChargeRegen] ⚠️ Student ${studentId} not eligible for charges`);
      releaseChargeRegenerationLock(studentId);
      return { success: true, message: 'Student not eligible for charges' };
    }

    const startMonthSetting = await getSetting('academic_year_start_month');
    const startMonth = parseInt(startMonthSetting || '9');

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
    const currentAcademicYear = getCurrentAcademicYear(startMonth);
    const nextAcademicYear =
      currentMonth === 12
        ? getCurrentAcademicYear(startMonth, new Date(now.getFullYear() + 1, 0, 1))
        : currentAcademicYear;

    log(`[ChargeRegen] Current Month: ${currentMonth}/${currentAcademicYear}`);
    log(`[ChargeRegen] Next Month: ${nextMonth}/${nextAcademicYear}`);

    const monthNames = [
      'جانفي',
      'فيفري',
      'مارس',
      'أفريل',
      'ماي',
      'جوان',
      'جويلية',
      'أوت',
      'سبتمبر',
      'أكتوبر',
      'نوفمبر',
      'ديسمبر',
    ];

    // Regenerate current month charges
    if (regenCurrentMonth) {
      log(`[ChargeRegen] ▶️ Processing CURRENT MONTH (${currentMonth}/${currentAcademicYear})...`);

      try {
        const currentFees = await calculateStudentMonthlyCharges(
          studentId,
          currentMonth,
          currentAcademicYear,
        );

        // Check existing charges BEFORE delete
        const existingCurrent = await db.allQuery(
          `
          SELECT id, amount, charge_date FROM student_fee_charges
          WHERE student_id = ? 
          AND fee_type = 'MONTHLY' 
          AND academic_year = ?
          AND fee_month = ?
        `,
          [studentId, currentAcademicYear, currentMonth],
        );

        log(`[ChargeRegen] Found ${existingCurrent.length} existing current month charge(s):`);
        existingCurrent.forEach((c, i) => {
          log(`[ChargeRegen]   ${i + 1}. Amount: ${c.amount} DT, Date: ${c.charge_date}`);
        });

        // Delete existing charges
        await db.runQuery(
          `
          DELETE FROM student_fee_charges
          WHERE student_id = ? 
          AND fee_type = 'MONTHLY' 
          AND academic_year = ?
          AND fee_month = ?
        `,
          [studentId, currentAcademicYear, currentMonth],
        );

        log(`[ChargeRegen] ✓ Deleted ${existingCurrent.length} old charge(s)`);

        // Create new charge if total > 0
        if (currentFees.total > 0) {
          const chargeDate = new Date().toISOString().split('T')[0];
          const monthName = monthNames[currentMonth - 1];

          await db.runQuery(
            `
            INSERT INTO student_fee_charges 
            (student_id, charge_date, fee_type, description, amount, academic_year, status, payment_frequency, fee_month)
            VALUES (?, ?, 'MONTHLY', ?, ?, ?, 'UNPAID', 'MONTHLY', ?)
          `,
            [
              studentId,
              chargeDate,
              `شهر ${monthName} ${currentMonth >= startMonth ? parseInt(currentAcademicYear.split('-')[0]) : parseInt(currentAcademicYear.split('-')[1])}`,
              currentFees.total,
              currentAcademicYear,
              currentMonth,
            ],
          );

          log(
            `[ChargeRegen] ✅ Created current month charge: ${currentFees.total} DT on ${chargeDate}`,
          );
        } else {
          log(`[ChargeRegen] ⓘ No charge created (amount: 0 DT)`);
        }
      } catch (error) {
        logError(`[ChargeRegen] ❌ Failed to regen current month for student ${studentId}:`, error);
        // Don't throw - continue to next month
      }
    }

    // Regenerate next month charges
    if (regenNextMonth) {
      log(`[ChargeRegen] ▶️ Processing NEXT MONTH (${nextMonth}/${nextAcademicYear})...`);

      try {
        const nextFees = await calculateStudentMonthlyCharges(
          studentId,
          nextMonth,
          nextAcademicYear,
        );

        // Check existing charges BEFORE delete
        const existingNext = await db.allQuery(
          `
          SELECT id, amount, charge_date FROM student_fee_charges
          WHERE student_id = ?
          AND fee_type = 'MONTHLY'
          AND academic_year = ?
          AND fee_month = ?
        `,
          [studentId, nextAcademicYear, nextMonth],
        );

        log(`[ChargeRegen] Found ${existingNext.length} existing next month charge(s):`);
        existingNext.forEach((c, i) => {
          log(`[ChargeRegen]   ${i + 1}. Amount: ${c.amount} DT, Date: ${c.charge_date}`);
        });

        // Delete existing charges
        await db.runQuery(
          `
          DELETE FROM student_fee_charges
          WHERE student_id = ?
          AND fee_type = 'MONTHLY'
          AND academic_year = ?
          AND fee_month = ?
        `,
          [studentId, nextAcademicYear, nextMonth],
        );

        log(`[ChargeRegen] ✓ Deleted ${existingNext.length} old charge(s)`);

        // Create new charge if total > 0
        if (nextFees.total > 0) {
          const chargeDate = new Date().toISOString().split('T')[0];
          const monthName = monthNames[nextMonth - 1];

          await db.runQuery(
            `
            INSERT INTO student_fee_charges
            (student_id, charge_date, fee_type, description, amount, academic_year, status, payment_frequency, fee_month)
            VALUES (?, ?, 'MONTHLY', ?, ?, ?, 'UNPAID', 'MONTHLY', ?)
          `,
            [
              studentId,
              chargeDate,
              `شهر ${monthName} ${nextMonth >= startMonth ? parseInt(nextAcademicYear.split('-')[0]) : parseInt(nextAcademicYear.split('-')[1])}`,
              nextFees.total,
              nextAcademicYear,
              nextMonth,
            ],
          );

          log(`[ChargeRegen] ✅ Created next month charge: ${nextFees.total} DT on ${chargeDate}`);
        } else {
          log(`[ChargeRegen] ⓘ No charge created (amount: 0 DT)`);
        }
      } catch (error) {
        logError(`[ChargeRegen] ❌ Failed to regen next month for student ${studentId}:`, error);
        // Don't throw - just log error
      }
    }

    // Regenerate all UNPAID charges in current academic year
    if (regenAllUnpaidInYear) {
      log(`[ChargeRegen] ▶️ Processing ALL UNPAID charges in ${currentAcademicYear}...`);
      try {
        const unpaidCharges = await db.allQuery(
          `
          SELECT id, amount, fee_month, description FROM student_fee_charges
          WHERE student_id = ? 
          AND fee_type = 'MONTHLY' 
          AND academic_year = ? 
          AND status = 'UNPAID'
          AND fee_month != ? -- Exclude months already handled if any
          AND fee_month != ?
        `,
          [studentId, currentAcademicYear, regenCurrentMonth ? currentMonth : -1, regenNextMonth ? nextMonth : -1],
        );

        log(`[ChargeRegen] Found ${unpaidCharges.length} additional unpaid charge(s) to refresh`);

        for (const charge of unpaidCharges) {
          const monthToRegen = charge.fee_month;
          if (!monthToRegen) {
            log(`[ChargeRegen] ⚠️ skipping charge ${charge.id} - missing fee_month`);
            continue;
          }

          const newFees = await calculateStudentMonthlyCharges(
            studentId,
            monthToRegen,
            currentAcademicYear,
          );

          if (newFees.total !== charge.amount) {
            await db.runQuery(
              'UPDATE student_fee_charges SET amount = ?, description = ? WHERE id = ?',
              [
                newFees.total,
                `شهر ${monthNames[monthToRegen - 1]} ${monthToRegen >= startMonth ? parseInt(currentAcademicYear.split('-')[0]) : parseInt(currentAcademicYear.split('-')[1])}`,
                charge.id
              ],
            );
            log(`[ChargeRegen] ✓ Updated month ${monthToRegen}: ${charge.amount} -> ${newFees.total} DT`);
          } else {
            log(`[ChargeRegen] ⓘ Month ${monthToRegen} amount unchanged (${charge.amount} DT)`);
          }
        }
      } catch (error) {
        logError(`[ChargeRegen] ❌ Failed to regen unpaid charges for student ${studentId}:`, error);
      }
    }

    log(`[ChargeRegen] ✅ Charge regeneration COMPLETED for student ${studentId}`);
    log(`[ChargeRegen] ════════════════════════════════════════════════════`);
    releaseChargeRegenerationLock(studentId);
    return { success: true, message: 'Charges regenerated successfully' };
  } catch (error) {
    logError(`[ChargeRegen] ❌ ERROR regenerating charges for student ${studentId}:`, error);
    log(`[ChargeRegen] ════════════════════════════════════════════════════`);
    releaseChargeRegenerationLock(studentId);
    return { success: false, message: error.message };
  }
}

// ============================================
// CHARGE REFRESH FUNCTIONS
// ============================================

/**
 * Refreshes charges for a specific student by generating charges for current month + next month.
 * This is useful when a student enrolls in new classes or fee structures change.
 * @param {number} studentId The ID of the student whose charges to refresh
 * @param {string} academicYear The academic year for which to generate charges (optional, uses current if not provided)
 * @param {number} userId The ID of the user performing the refresh (for audit trail)
 * @returns {Promise<object>} Result object with success status and details
 */
async function refreshStudentCharges(studentId, academicYear = null, userId = null) {
  let transactionStarted = false;
  try {
    log(`[refreshStudentCharges] Starting charge refresh for student ${studentId}`);

    // Get student details to validate and get current context
    const student = await db.getQuery('SELECT * FROM students WHERE id = ?', [studentId]);
    if (!student) {
      throw new Error('Student not found');
    }

    if (student.status !== 'active') {
      log(`[refreshStudentCharges] Student ${studentId} is not active - skipping`);
      return {
        success: true,
        message: 'Student is not active - no charges generated',
        chargesGenerated: 0,
      };
    }

    if (student.fee_category === 'EXEMPT') {
      log(`[refreshStudentCharges] Student ${studentId} is exempt from fees - skipping`);
      return {
        success: true,
        message: 'Student is exempt from fees - no charges generated',
        chargesGenerated: 0,
      };
    }

    // Determine academic year
    const currentAcademicYear = academicYear || getCurrentAcademicYear();
    log(`[refreshStudentCharges] Using academic year: ${currentAcademicYear}`);

    // Get current and next month
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;

    await db.runQuery('BEGIN TRANSACTION;');
    transactionStarted = true;

    let chargesGenerated = 0;

    // Check if annual charges exist for this year, generate if not
    const existingAnnualCharge = await db.getQuery(
      `
      SELECT id FROM student_fee_charges
      WHERE student_id = ? AND fee_type = 'ANNUAL' AND academic_year = ?
    `,
      [studentId, currentAcademicYear],
    );

    if (!existingAnnualCharge) {
      const annualFee = parseFloat((await getSetting('annual_fee')) || '0');
      if (annualFee > 0) {
        const chargeDate = new Date().toISOString().split('T')[0];
        await db.runQuery(
          `
          INSERT INTO student_fee_charges (student_id, charge_date, fee_type, description, amount, academic_year, status)
          VALUES (?, ?, 'ANNUAL', ?, ?, ?, 'UNPAID')
        `,
          [
            studentId,
            chargeDate,
            `التسجيل ${currentAcademicYear}`,
            annualFee,
            currentAcademicYear,
          ],
        );
        chargesGenerated++;
        log(`[refreshStudentCharges] Generated annual charge for student ${studentId}`);
      }
    }

    // Generate monthly charges for current month
    log(
      `[refreshStudentCharges] Generating monthly charges for current month (${currentMonth}) and next month (${nextMonth})`,
    );

    // Generate charges ONLY for this specific student - current month
    try {
      const currentMonthFees = await calculateStudentMonthlyCharges(
        studentId,
        currentMonth,
        currentAcademicYear,
      );

      if (currentMonthFees.total > 0) {
        // Delete any existing charges for this student for this month
        const monthStr = currentMonth.toString().padStart(2, '0');
        await db.runQuery(
          `
          DELETE FROM student_fee_charges
          WHERE student_id = ? 
          AND fee_type = 'MONTHLY' 
          AND academic_year = ?
          AND fee_month = ?
        `,
          [studentId, currentAcademicYear, currentMonth],
        );

        // Create new charge for this month
        const chargeDate = new Date().toISOString().split('T')[0];
        const monthNames = [
          'جانفي',
          'فيفري',
          'مارس',
          'أفريل',
          'ماي',
          'جوان',
          'جويلية',
          'أوت',
          'سبتمبر',
          'أكتوبر',
          'نوفمبر',
          'ديسمبر',
        ];
        const startMonthSetting = await getSetting('academic_year_start_month');
        const startMonth = parseInt(startMonthSetting || '9');

        await db.runQuery(
          `
          INSERT INTO student_fee_charges 
          (student_id, charge_date, fee_type, description, amount, academic_year, status, payment_frequency, fee_month)
          VALUES (?, ?, 'MONTHLY', ?, ?, ?, 'UNPAID', 'MONTHLY', ?)
        `,
            [
              studentId,
              chargeDate,
              `شهر ${monthNames[currentMonth - 1]} ${currentMonth >= startMonth ? parseInt(currentAcademicYear.split('-')[0]) : parseInt(currentAcademicYear.split('-')[1])}`,
              currentMonthFees.total,
              currentAcademicYear,
              currentMonth,
            ],
        );
        chargesGenerated++;
        log(
          `[refreshStudentCharges] Generated current month charge for student ${studentId}: ${currentMonthFees.total} DT`,
        );
      }
    } catch (error) {
      log(`[refreshStudentCharges] Current month charges generation failed: ${error.message}`);
    }

    // Note: Next month charges are generated by the scheduler when the next month arrives
    // This ensures charges are created at the correct time with any fee changes applied
    log(
      `[refreshStudentCharges] Next month charges will be generated by scheduler when the month arrives`,
    );

    // Log the refresh operation for audit trail
    if (userId) {
      const auditNote = `Charge refresh performed for student ${student.name} (${student.matricule}). Generated ${chargesGenerated} charge(s).`;
      log(`[AUDIT] ${auditNote}`);
      // Note: Could add to audit log table if system has one
    }

    await db.runQuery('COMMIT;');
    log(
      `[refreshStudentCharges] Successfully refreshed charges for student ${studentId}. Generated: ${chargesGenerated} charges`,
    );

    return {
      success: true,
      message: `تم تحديث الرسوم للطالب ${student.name} بنجاح`,
      studentId,
      studentName: student.name,
      chargesGenerated,
      academicYear: currentAcademicYear,
    };
  } catch (error) {
    if (transactionStarted) {
      try {
        await db.runQuery('ROLLBACK;');
      } catch (rollbackError) {
        logError('Failed to rollback transaction in refreshStudentCharges:', rollbackError);
      }
    }
    logError('Error in refreshStudentCharges:', error);
    throw new Error(`فشل في تحديث الرسوم: ${error.message}`);
  }
}

/**
 * Identifies students who enrolled in special classes AFTER their initial charges were generated.
 * These students need their charges refreshed to include the new special class fees.
 *
 * @param {string} academicYear The academic year to check (optional, uses current if not provided)
 * @returns {Promise<Array>} Array of student IDs who need charge refresh
 */
async function identifyStudentsNeedingChargeRefresh(academicYear = null) {
  const currentAcademicYear = academicYear || getCurrentAcademicYear();
  log(
    `[identifyStudentsNeedingChargeRefresh] Checking for students needing refresh in academic year: ${currentAcademicYear}`,
  );

  // Find students who:
  // 1. Have active enrollments in special classes
  // 2. Have charge records for the current academic year
  // 3. But the charges don't reflect their special class fees (enrolled after charges were generated)

  const studentsNeedingRefresh = await db.allQuery(
    `
    SELECT DISTINCT
      s.id,
      s.name,
      s.matricule,
      cs.enrollment_date as class_enrollment_date,
      MIN(sfc.charge_date) as first_charge_date
    FROM students s
    JOIN class_students cs ON s.id = cs.student_id
    JOIN classes c ON cs.class_id = c.id
    LEFT JOIN student_fee_charges sfc ON s.id = sfc.student_id AND sfc.academic_year = ?
    WHERE s.status = 'active'
      AND s.fee_category IN ('CAN_PAY', 'SPONSORED')
      AND c.status = 'active'
      AND c.fee_type = 'special'
      AND sfc.id IS NOT NULL
    GROUP BY s.id, s.name, s.matricule, cs.enrollment_date
    HAVING cs.enrollment_date > MIN(sfc.charge_date)
    ORDER BY s.name
  `,
    [currentAcademicYear],
  );

  log(
    `[identifyStudentsNeedingChargeRefresh] Found ${studentsNeedingRefresh.length} students who enrolled in special classes after initial charges`,
  );

  return studentsNeedingRefresh.map((student) => ({
    id: student.id,
    name: student.name,
    matricule: student.matricule,
    classEnrollmentDate: student.class_enrollment_date,
    firstChargeDate: student.first_charge_date,
  }));
}

/**
 * Refreshes charges for students who enrolled in special classes AFTER their initial charges were generated.
 * This is useful for cases where students join special classes with custom fees after regular charges were already created.
 *
 * @param {string} academicYear The academic year for which to generate charges (optional, uses current if not provided)
 * @param {number} userId The ID of the user performing the refresh (for audit trail)
 * @returns {Promise<object>} Result object with success status and details
 */
async function refreshStudentsNeedingChargeRefresh(academicYear = null, userId = null) {
  let transactionStarted = false;
  try {
    log(
      '[refreshStudentsNeedingChargeRefresh] Starting selective charge refresh for students with new special class enrollments',
    );

    // Determine academic year
    const currentAcademicYear = academicYear || getCurrentAcademicYear();
    log(`[refreshStudentsNeedingChargeRefresh] Using academic year: ${currentAcademicYear}`);

    // Get current and next month
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
    const nextMonthAcademicYear =
      currentMonth === 12
        ? `${now.getFullYear() + 1}-${now.getFullYear() + 2}`
        : currentAcademicYear;

    // Identify students who need refresh
    const studentsNeedingRefresh = await identifyStudentsNeedingChargeRefresh(currentAcademicYear);

    if (studentsNeedingRefresh.length === 0) {
      log('[refreshStudentsNeedingChargeRefresh] No students found who need charge refresh');
      return {
        success: true,
        message:
          'لا توجد طلاب يحتاجون تحديث الرسوم (لم يتم العثور على طلاب التحقوا بدروس خاصة بعد إنشاء الرسوم الأولية)',
        studentsProcessed: 0,
        chargesGenerated: 0,
      };
    }

    log(
      `[refreshStudentsNeedingChargeRefresh] Processing ${studentsNeedingRefresh.length} students who enrolled in special classes after initial charges`,
    );

    await db.runQuery('BEGIN TRANSACTION;');
    transactionStarted = true;

    let totalChargesGenerated = 0;
    const results = [];

    // Process each student individually to avoid cascading failures
    for (const student of studentsNeedingRefresh) {
      try {
        log(
          `[refreshStudentsNeedingChargeRefresh] Processing student ${student.id} (${student.name}) - enrolled ${student.classEnrollmentDate}, first charged ${student.firstChargeDate}`,
        );

        let studentChargesGenerated = 0;

        // For students who enrolled in special classes after initial charges,
        // we need to regenerate their charges to include the special class fees
        // We'll force regenerate the monthly charges to ensure special fees are included

        try {
          // Use force=true to regenerate existing charges and include special class fees
          await generateMonthlyFeeCharges(currentAcademicYear, currentMonth, false, true);
          studentChargesGenerated++;
          log(
            `[refreshStudentsNeedingChargeRefresh] Regenerated current month charges for student ${student.id}`,
          );
        } catch (error) {
          log(
            `[refreshStudentsNeedingChargeRefresh] Error regenerating current month charges for student ${student.id}: ${error.message}`,
          );
        }

        try {
          // Also ensure next month charges include special fees
          await generateMonthlyFeeCharges(nextMonthAcademicYear, nextMonth, false, true);
          studentChargesGenerated++;
          log(
            `[refreshStudentsNeedingChargeRefresh] Regenerated next month charges for student ${student.id}`,
          );
        } catch (error) {
          log(
            `[refreshStudentsNeedingChargeRefresh] Error regenerating next month charges for student ${student.id}: ${error.message}`,
          );
        }

        totalChargesGenerated += studentChargesGenerated;

        results.push({
          studentId: student.id,
          studentName: student.name,
          matricule: student.matricule,
          chargesGenerated: studentChargesGenerated,
          classEnrollmentDate: student.classEnrollmentDate,
          firstChargeDate: student.firstChargeDate,
          success: true,
        });

        log(
          `[refreshStudentsNeedingChargeRefresh] Processed student ${student.id}: regenerated ${studentChargesGenerated} charge(s)`,
        );
      } catch (studentError) {
        logError(
          `[refreshStudentsNeedingChargeRefresh] Error processing student ${student.id}:`,
          studentError,
        );
        results.push({
          studentId: student.id,
          studentName: student.name,
          matricule: student.matricule,
          chargesGenerated: 0,
          success: false,
          error: studentError.message,
        });
        // Continue with next student rather than failing the entire operation
      }
    }

    // Log the selective refresh operation for audit trail
    if (userId) {
      const auditNote = `Selective charge refresh performed by user ${userId}. Processed ${studentsNeedingRefresh.length} students who enrolled in special classes after initial charges. Generated ${totalChargesGenerated} total charge(s).`;
      log(`[AUDIT] ${auditNote}`);
      // Note: Could add to audit log table if system has one
    }

    await db.runQuery('COMMIT;');
    log(
      `[refreshStudentsNeedingChargeRefresh] Successfully completed selective refresh. Processed: ${studentsNeedingRefresh.length}, Generated: ${totalChargesGenerated} charges`,
    );

    const successfulResults = results.filter((r) => r.success);
    const failedResults = results.filter((r) => !r.success);

    return {
      success: true,
      message: `تم تحديث الرسوم لـ ${successfulResults.length} من ${studentsNeedingRefresh.length} طالب التحقوا بدروس خاصة${failedResults.length > 0 ? ` (${failedResults.length} فشل)` : ''}`,
      studentsProcessed: studentsNeedingRefresh.length,
      chargesGenerated: totalChargesGenerated,
      studentsNeedingRefresh: successfulResults,
      failedResults: failedResults.length > 0 ? failedResults : undefined,
    };
  } catch (error) {
    if (transactionStarted) {
      try {
        await db.runQuery('ROLLBACK;');
      } catch (rollbackError) {
        logError(
          'Failed to rollback transaction in refreshStudentsNeedingChargeRefresh:',
          rollbackError,
        );
      }
    }
    logError('Error in refreshStudentsNeedingChargeRefresh:', error);
    throw new Error(`فشل في تحديث الرسوم: ${error.message}`);
  }
}

/**
 * Refreshes charges for all active students by generating charges for current month + next month.
 * This is useful for system-wide fee structure changes or bulk updates.
 * @param {string} academicYear The academic year for which to generate charges (optional, uses current if not provided)
 * @param {number} userId The ID of the user performing the refresh (for audit trail)
 * @returns {Promise<object>} Result object with success status and details
 */
async function refreshAllStudentCharges(academicYear = null, userId = null) {
  return db.withTransaction(async () => {
    log('[refreshAllStudentCharges] Starting bulk charge refresh for all students');

    const currentAcademicYear = academicYear || getCurrentAcademicYear();
    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
    const nextMonthAcademicYear = currentMonth === 12 ? `${now.getFullYear() + 1}-${now.getFullYear() + 2}` : currentAcademicYear;

    const students = await db.allQuery(
      "SELECT id, name, matricule FROM students WHERE status = 'active' AND fee_category IN ('CAN_PAY', 'SPONSORED')",
    );

    if (students.length === 0) {
      log('[refreshAllStudentCharges] No eligible students found');
      return { success: true, message: 'لا توجد طلاب مؤهلون لتوليد الرسوم', studentsProcessed: 0, chargesGenerated: 0 };
    }

    let totalChargesGenerated = 0;
    const annualFee = parseFloat((await getSetting('annual_fee')) || '0');
    const chargeDate = new Date().toISOString().split('T')[0];

    for (const student of students) {
      try {
        let studentChargesGenerated = 0;

        // Annual check
        const existingAnnual = await db.getQuery(
          "SELECT id FROM student_fee_charges WHERE student_id = ? AND fee_type = 'ANNUAL' AND academic_year = ?",
          [student.id, currentAcademicYear]
        );
        if (!existingAnnual && annualFee > 0) {
          await db.runQuery(
            "INSERT INTO student_fee_charges (student_id, charge_date, fee_type, description, amount, academic_year, status) VALUES (?, ?, 'ANNUAL', ?, ?, ?, 'UNPAID')",
            [student.id, chargeDate, `التسجيل ${currentAcademicYear}`, annualFee, currentAcademicYear]
          );
          studentChargesGenerated++;
        }

        // Monthly check
        await generateMonthlyFeeCharges(currentAcademicYear, currentMonth, false);
        studentChargesGenerated++;
        await generateMonthlyFeeCharges(nextMonthAcademicYear, nextMonth, false);
        studentChargesGenerated++;

        totalChargesGenerated += studentChargesGenerated;
      } catch (studentError) {
        logError(`[refreshAllStudentCharges] Error processing student ${student.id}:`, studentError);
      }
    }

    if (userId) {
      log(`[AUDIT] Bulk charge refresh performed by user ${userId}. Processed ${students.length} students, generated ${totalChargesGenerated} charges.`);
    }

    return {
      success: true,
      message: `تم تحديث الرسوم لجميع الطلاب بنجاح (معالجة ${students.length} طالب).`,
      studentsProcessed: students.length,
      chargesGenerated: totalChargesGenerated
    };
  });
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
    const charges = await db.allQuery('SELECT * FROM student_fee_charges WHERE student_id = ?', [
      studentId,
    ]);

    let totalDue = 0;
    let totalPaid = 0;
    let totalCredit = 0;
    let totalArrears = 0;
    const today = new Date().toISOString().split('T')[0];

    for (const charge of charges) {
      if (charge.fee_type === 'CREDIT') {
        // Credit charges reduce the balance (they're prepaid amounts)
        totalCredit += charge.amount_paid;
      } else {
        // Regular charges increase the amount due
        totalDue += charge.amount;
        totalPaid += charge.amount_paid;

        // Arrears = unpaid amount where due_date has passed
        if (charge.status !== 'PAID' && charge.due_date && charge.due_date < today) {
          totalArrears += (charge.amount - charge.amount_paid);
        }
      }
    }

    // Balance = amount due - amount paid - credit
    const balance = totalDue - totalPaid - totalCredit;

    const student = await db.getQuery(
      'SELECT custom_fee_amount, discount_percentage FROM students WHERE id = ?',
      [studentId]
    );

    return {
      charges,
      totalDue,
      totalPaid,
      totalCredit,
      totalArrears,
      balance,
      custom_fee_amount: student?.custom_fee_amount || 0,
      discount_percentage: student?.discount_percentage || 0,
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
    const { balance } = feeStatus;

    // Positive balance means money owed
    // Negative balance means credit available
    if (balance >= 0) {
      return {
        ...feeStatus,
        displayType: 'owed',
        displayAmount: balance,
        displayLabel: 'المبلغ المستحق', // Amount Owed
        displayClass: 'text-danger fw-bold',
      };
    } else {
      return {
        ...feeStatus,
        displayType: 'credit',
        displayAmount: Math.abs(balance), // Make positive
        displayLabel: 'رصيد متاح', // Available Credit
        displayClass: 'text-success fw-bold',
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
  const unpaidCharges = await db.allQuery(
    `
    SELECT id FROM student_fee_charges
    WHERE student_id = ? AND status IN ('UNPAID', 'PARTIALLY_PAID')
  `,
    [studentId],
  );

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
  const {
    student_id,
    amount,
    payment_method,
    check_number,
    payment_type,
    notes,
    academic_year,
    receipt_number,
    class_id,
    sponsor_name,
    sponsor_phone,
  } = paymentDetails;

  console.log(
    `[PAYMENT_START] Recording payment for student ${student_id}, amount: ${amount}, method: ${payment_method}`,
  );

  let transactionStarted = false;
  try {
    console.log(`[PAYMENT_DB] Starting transaction...`);
    await db.runQuery('BEGIN TRANSACTION;');
    transactionStarted = true;
    console.log(`[PAYMENT_DB] Transaction started successfully`);

    // Auto-generate charges if student has no unpaid charges
    console.log(`[PAYMENT_AUTO_GEN] Checking if auto-generation needed for student ${student_id}`);
    await autoGenerateChargesIfNeeded(
      student_id,
      academic_year || new Date().getFullYear().toString(),
    );
    console.log(`[PAYMENT_AUTO_GEN] Auto-generation check completed`);

    // Validate receipt number uniqueness across all income tables
    if (receipt_number) {
      console.log(`[PAYMENT_RECEIPT] Validating receipt number: ${receipt_number}`);
      // Check payments table
      const existingPayment = await db.getQuery(
        'SELECT id FROM payments WHERE receipt_number = ?',
        [receipt_number],
      );

      // Check donations table
      const existingDonation = await db.getQuery(
        'SELECT id FROM donations WHERE receipt_number = ?',
        [receipt_number],
      );

      // Check student_payments table (exclude current payment if updating)
      const existingStudentPayment = await db.getQuery(
        'SELECT id FROM student_payments WHERE receipt_number = ?',
        [receipt_number],
      );

      if (existingPayment || existingDonation || existingStudentPayment) {
        console.log(
          `[PAYMENT_RECEIPT] Duplicate receipt found - existingPayment: ${!!existingPayment}, existingDonation: ${!!existingDonation}, existingStudentPayment: ${!!existingStudentPayment}`,
        );
        throw new Error('DUPLICATE_RECEIPT');
      }
      console.log(`[PAYMENT_RECEIPT] Receipt validation passed`);
    }

    // 1. Create a student_payment record
    console.log(`[PAYMENT_DB] Creating payment record...`);
    const paymentResult = await db.runQuery(
      `
      INSERT INTO student_payments (student_id, amount, payment_method, payment_type, academic_year, notes, check_number, receipt_number, class_id, sponsor_name, sponsor_phone)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        student_id,
        amount,
        payment_method,
        payment_type || 'رسوم الطلاب',
        academic_year || new Date().getFullYear().toString(),
        notes,
        check_number,
        receipt_number,
        class_id,
        sponsor_name,
        sponsor_phone,
      ],
    );

    const studentPaymentId = paymentResult.id;
    console.log(`[PAYMENT_DB] Payment record created with ID: ${studentPaymentId}`);

    // 2. First, apply payment to consume existing credit (if any)
    console.log(`[PAYMENT_CREDIT] Checking for existing credit for student ${student_id}...`);
    const existingCreditCharges = await db.allQuery(
      `
      SELECT * FROM student_fee_charges
      WHERE student_id = ? AND fee_type = 'CREDIT' AND amount_paid > 0
      ORDER BY created_at ASC
    `,
      [student_id],
    );

    console.log(`[PAYMENT_CREDIT] Found ${existingCreditCharges.length} credit charges`);
    let remainingAmountToApply = amount;
    let totalCreditConsumed = 0;

    // Consume credit first (oldest credit first)
    for (const creditCharge of existingCreditCharges) {
      if (remainingAmountToApply <= 0) break;

      const availableCredit = creditCharge.amount_paid; // Credit amount available
      const creditToConsume = Math.min(remainingAmountToApply, availableCredit);

      console.log(
        `[PAYMENT_CREDIT] Consuming ${creditToConsume} from credit charge ${creditCharge.id} (available: ${availableCredit})`,
      );

      // Reduce the credit amount
      const newCreditAmount = availableCredit - creditToConsume;
      await db.runQuery(
        `
        UPDATE student_fee_charges
        SET amount_paid = ?
        WHERE id = ?
      `,
        [newCreditAmount, creditCharge.id],
      );

      remainingAmountToApply -= creditToConsume;
      totalCreditConsumed += creditToConsume;

      console.log(
        `[PAYMENT_CREDIT] Credit consumed. Remaining to apply: ${remainingAmountToApply}, Total credit consumed: ${totalCreditConsumed}`,
      );
    }

    // 3. Apply remaining payment to outstanding charges (FIFO)
    console.log(
      `[PAYMENT_CHARGES] Applying remaining amount ${remainingAmountToApply} to outstanding charges...`,
    );
    const outstandingCharges = await db.allQuery(
      `
      SELECT * FROM student_fee_charges
      WHERE student_id = ? AND status IN ('UNPAID', 'PARTIALLY_PAID') AND fee_type != 'CREDIT'
      ORDER BY due_date ASC, created_at ASC
    `,
      [student_id],
    );

    console.log(
      `[PAYMENT_CHARGES] Found ${outstandingCharges.length} outstanding charges to apply payment to`,
    );

    for (const charge of outstandingCharges) {
      if (remainingAmountToApply <= 0) break;

      const chargeBalance = charge.amount - charge.amount_paid;
      const amountToApplyToCharge = Math.min(remainingAmountToApply, chargeBalance);

      console.log(
        `[PAYMENT_CHARGES] Applying ${amountToApplyToCharge} to charge ${charge.id} (${charge.description}) - balance was ${chargeBalance}`,
      );

      // Create a breakdown record
      await db.runQuery(
        `
        INSERT INTO student_payment_breakdown (student_payment_id, student_fee_charge_id, amount)
        VALUES (?, ?, ?)
      `,
        [studentPaymentId, charge.id, amountToApplyToCharge],
      );

      // Update the charge record
      const newAmountPaid = charge.amount_paid + amountToApplyToCharge;
      const newStatus = newAmountPaid >= charge.amount ? 'PAID' : 'PARTIALLY_PAID';

      await db.runQuery(
        `
        UPDATE student_fee_charges
        SET amount_paid = ?, status = ?
        WHERE id = ?
      `,
        [newAmountPaid, newStatus, charge.id],
      );

      remainingAmountToApply -= amountToApplyToCharge;
      console.log(
        `[PAYMENT_CHARGES] Charge ${charge.id} updated. New status: ${newStatus}, remaining to apply: ${remainingAmountToApply}`,
      );
    }

    // 2.5. Handle overpayment - store as credit for future charges
    if (remainingAmountToApply > 0) {
      console.log(
        `[PAYMENT_OVERPAYMENT] Student ${student_id} overpaid by ${remainingAmountToApply}. Storing as credit.`,
      );

      // Update the payment record to reflect the credit amount
      await db.runQuery(
        `
        UPDATE student_payments
        SET notes = COALESCE(notes, '') || ' | رصيد زائد: ' || ? || ' د.ت'
        WHERE id = ?
      `,
        [remainingAmountToApply.toFixed(2), studentPaymentId],
      );

      // Create a special "credit" charge that can be applied to future charges
      // This ensures the credit appears in the student's balance calculations
      await db.runQuery(
        `
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
      `,
        [
          student_id,
          new Date().toISOString().split('T')[0], // charge_date
          new Date().toISOString().split('T')[0], // due_date (immediate)
          `رصيد زائد من دفعة سابقة (${remainingAmountToApply.toFixed(2)} د.ت)`,
          0, // amount (credit has no charge amount)
          remainingAmountToApply, // amount_paid (the credit amount)
          academic_year || new Date().getFullYear().toString(),
        ],
      );
      console.log(`[PAYMENT_OVERPAYMENT] Credit charge created for ${remainingAmountToApply}`);
    }

    // 3. Create a corresponding transaction record
    log(`[PAYMENT_TRANSACTION] Creating transaction record...`);
    const student = await db.getQuery('SELECT name, matricule FROM students WHERE id = ?', [
      student_id,
    ]);

    const paymentTypeMap = {
      CUSTOM: 'دفعة مخصصة',
      MONTHLY: 'شهرية',
      ANNUAL: 'تسجيل',
      SPECIAL: 'رسوم خاصة',
    };
    const paymentTypeAr = paymentTypeMap[payment_type] || payment_type || 'رسوم';

    const transactionDescription = `دفعة رسوم من الطالب: ${student.name} - ${paymentTypeAr}`;

    // Note: You might want to make the account_id dynamic
    const transactionResult = await db.runQuery(
      `
      INSERT INTO transactions (type, category, amount, transaction_date, description, payment_method, check_number, voucher_number, receipt_type, account_id, related_person_name, related_entity_type, related_entity_id, created_by_user_id)
      VALUES ('INCOME', 'رسوم الطلاب', ?, ?, ?, ?, ?, ?, 'رسوم الطلاب', 1, ?, 'Student', ?, ?)
    `,
      [
        amount,
        new Date().toISOString().split('T')[0],
        transactionDescription,
        payment_method,
        check_number,
        receipt_number,
        student.name,
        student_id,
        event.sender.userId,
      ],
    );

    // Link the transaction to the payment
    await db.runQuery('UPDATE student_payments SET transaction_id = ? WHERE id = ?', [
      transactionResult.id,
      studentPaymentId,
    ]);

    log(`[PAYMENT_COMMIT] Committing transaction...`);
    await db.runQuery('COMMIT;');
    log(`[PAYMENT_SUCCESS] Payment recorded successfully with ID: ${studentPaymentId}`);

    // Notify all renderer processes about data change
    const { BrowserWindow } = require('electron');
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('financial-data-changed');
    });

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
  ipcMain.handle(
    'student-fees:getPaymentHistory',
    requireRoles(['Superadmin', 'Administrator', 'FinanceManager'])(
      async (event, { studentId, academicYear }) => {
        try {
          return await db.allQuery(
            'SELECT * FROM student_payments WHERE student_id = ? AND academic_year = ?',
            [studentId, academicYear],
          );
        } catch (error) {
          logError('Error getting student payment history:', error);
          throw new Error('Failed to get student payment history.');
        }
      },
    ),
  );

  ipcMain.handle(
    'student-fees:getClassesWithSpecialFees',
    requireRoles(['Superadmin', 'Administrator', 'FinanceManager'])(async (event, studentId) => {
      try {
        return await db.allQuery(
          `
        SELECT c.id, c.name FROM classes c
        JOIN class_students cs ON c.id = cs.class_id
        WHERE cs.student_id = ? AND c.status = 'active' AND c.fee_type = 'special'
      `,
          [studentId],
        );
      } catch (error) {
        logError('Error getting classes with special fees:', error);
        throw new Error('Failed to get classes with special fees.');
      }
    }),
  );
  ipcMain.handle(
    'student-fees:getStatus',
    requireRoles(['Superadmin', 'Administrator', 'FinanceManager'])(async (event, studentId) => {
      try {
        return await getStudentFeeStatus(studentId);
      } catch (error) {
        logError('Error getting student fee status:', error);
        throw new Error('Failed to get student fee status.');
      }
    }),
  );

  ipcMain.handle(
    'student-fees:getBalanceSummary',
    requireRoles(['Superadmin', 'Administrator', 'FinanceManager'])(async (event, studentId) => {
      try {
        return await getStudentBalanceSummary(studentId);
      } catch (error) {
        logError('Error getting student balance summary:', error);
        throw new Error('Failed to get student balance summary.');
      }
    }),
  );

  ipcMain.handle(
    'student-fees:recordPayment',
    requireRoles(['Superadmin', 'Administrator', 'FinanceManager'])(
      async (event, paymentDetails) => {
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
      },
    ),
  );

  ipcMain.handle(
    'student-fees:getAll',
    requireRoles(['Superadmin', 'Administrator', 'FinanceManager'])(async () => {
      try {
        const students = await db.allQuery(
          'SELECT id, name, matricule, fee_category, sponsor_name, sponsor_phone, custom_fee_amount, discount_percentage FROM students WHERE status = ? ORDER BY name',
          ['active'],
        );

        // Get fee status for each student, filtering out exempt/sponsored students
        const studentsWithFees = await Promise.all(
          students.map(async (student) => {
            if (student.fee_category === 'EXEMPT') {
              return {
                ...student,
                totalDue: 0,
                totalPaid: 0,
                balance: 0,
              };
            }

            const feeStatus = await getStudentFeeStatus(student.id);
            return {
              ...student,
              totalDue: feeStatus.totalDue,
              totalPaid: feeStatus.totalPaid,
              totalArrears: feeStatus.totalArrears,
              balance: feeStatus.balance,
            };
          }),
        );

        return studentsWithFees;
      } catch (error) {
        logError('Error getting all students with fee status:', error);
        throw new Error('Failed to get students with fee status.');
      }
    }),
  );

  // Charge generation handlers
  ipcMain.handle(
    'student-fees:generateAnnualCharges',
    requireRoles(['Superadmin', 'Administrator', 'FinanceManager'])(async (_, academicYear) => {
      try {
        const result = await generateAnnualFeeCharges(academicYear);
        return {
          success: true,
          message: `تم إنشاء الرسوم السنوية للعام ${academicYear} بنجاح`,
          details: result,
        };
      } catch (error) {
        logError('Error generating annual charges:', error);
        throw new Error('فشل في إنشاء الرسوم السنوية');
      }
    }),
  );

  ipcMain.handle(
    'student-fees:generateMonthlyCharges',
    requireRoles(['Superadmin', 'Administrator', 'FinanceManager'])(async (_, data) => {
      try {
        const { academicYear, month } = data;
        const result = await generateMonthlyFeeCharges(academicYear, month, true);
        const monthNames = [
          'جانفي',
          'فيفري',
          'مارس',
          'أفريل',
          'ماي',
          'جوان',
          'جويلية',
          'أوت',
          'سبتمبر',
          'أكتوبر',
          'نوفمبر',
          'ديسمبر',
        ];
        const monthName = monthNames[month - 1];
        return {
          success: true,
          message: `تم إنشاء الرسوم الشهرية لشهر ${monthName} ${academicYear} بنجاح`,
          details: result,
        };
      } catch (error) {
        logError('Error generating monthly charges:', error);
        throw new Error('فشل في إنشاء الرسوم الشهرية');
      }
    }),
  );

  ipcMain.handle(
    'student-fees:generateAllCharges',
    requireRoles(['Superadmin', 'Administrator', 'FinanceManager'])(
      async (_, academicYear, force = false) => {
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
      },
    ),
  );

  ipcMain.handle(
    'student-fees:resetAndRegenerate',
    requireRoles(['Superadmin', 'Administrator', 'FinanceManager'])(async () => {
      let transactionStarted = false;
      try {
        const startMonthSetting = await getSetting('academic_year_start_month');
        const startMonth = parseInt(startMonthSetting || '9');
        const academicYear = getCurrentAcademicYear(startMonth);
        log(`[ResetFees] 🔄 Starting global reset for academic year: ${academicYear} (Starts: ${startMonth})`);

        await db.runQuery('BEGIN TRANSACTION;');
        transactionStarted = true;

        // 1. Delete ALL records for the current year (Paid and Unpaid)
        // Order: Transactions -> Payments -> Charges (to respect potentially existing FKs even if SET NULL)
        
        // Find transaction IDs linked to student payments for this academic year
        const paymentsToDelete = await db.allQuery(
          "SELECT transaction_id FROM student_payments WHERE academic_year = ?",
          [academicYear]
        );
        const transactionIds = paymentsToDelete
          .map(p => p.transaction_id)
          .filter(id => id !== null);

        if (transactionIds.length > 0) {
          const placeholders = transactionIds.map(() => '?').join(',');
          await db.runQuery(
            `DELETE FROM transactions WHERE id IN (${placeholders})`,
            [...transactionIds]
          );
          log(`[ResetFees] ✓ Deleted ${transactionIds.length} associated transactions`);
        }

        // Delete payments
        await db.runQuery(
          "DELETE FROM student_payments WHERE academic_year = ?",
          [academicYear]
        );
        log(`[ResetFees] ✓ Deleted all student payments for ${academicYear}`);

        // Delete ALL charges for the current year
        const deleteResult = await db.runQuery(
          "DELETE FROM student_fee_charges WHERE academic_year = ?",
          [academicYear],
        );
        log(`[ResetFees] ✓ Deleted all fee charges for ${academicYear} (Changes: ${deleteResult.changes})`);
        
        // 1.5 Reset all student discounts to 0
        await db.runQuery('UPDATE students SET discount_percentage = 0');
        log(`[ResetFees] ✓ Reset all student discounts to 0`);

        // 2. Regenerate Annual Registration Fees
        await generateAnnualFeeCharges(academicYear, null);
        log(`[ResetFees] ✓ Regenerated annual charges`);

        // 3. Regenerate Monthly Fees from start of year to current month
        const now = new Date();
        const currentMonth = now.getMonth() + 1;

        // Calculate sequence of months from startMonth to currentMonth
        const monthsToRegen = [];
        // If currentMonth is after startMonth, we stop at currentMonth in same year
        // If currentMonth is before startMonth, we go from startMonth to Dec, then Jan to currentMonth
        if (currentMonth >= startMonth) {
          for (let i = startMonth; i <= currentMonth; i++) monthsToRegen.push(i);
        } else {
          for (let i = startMonth; i <= 12; i++) monthsToRegen.push(i);
          for (let i = 1; i <= currentMonth; i++) monthsToRegen.push(i);
        }

        log(`[ResetFees] Regenerating monthly charges for months: ${monthsToRegen.join(', ')}`);

        for (const month of monthsToRegen) {
          await generateMonthlyFeeCharges(academicYear, month, false, null);
        }

        await db.runQuery('COMMIT;');
        log(`[ResetFees] ✅ Global reset and regeneration complete for ${academicYear}`);

        return {
          success: true,
          message: `تمت إعادة تعيين وتوليد الرسوم لجميع الطلاب بنجاح للسنة ${academicYear}`,
        };
      } catch (error) {
        if (transactionStarted) {
          await db.runQuery('ROLLBACK;');
        }
        logError('[ResetFees] ❌ Error during global reset:', error);
        throw error;
      }
    }),
  );

  // Charge refresh handlers
  ipcMain.handle(
    'student-fees:refreshStudentCharges',
    requireRoles(['Superadmin', 'Administrator', 'FinanceManager'])(
      async (event, { studentId, academicYear }) => {
        try {
          const result = await refreshStudentCharges(studentId, academicYear, event.sender.userId);
          return result;
        } catch (error) {
          logError('Error refreshing student charges:', error);
          throw new Error('فشل في تحديث الرسوم');
        }
      },
    ),
  );

  ipcMain.handle(
    'student-fees:refreshAllStudentCharges',
    requireRoles(['Superadmin', 'Administrator', 'FinanceManager'])(
      async (event, { academicYear }) => {
        try {
          const result = await refreshStudentsNeedingChargeRefresh(
            academicYear,
            event.sender.userId,
          );
          return result;
        } catch (error) {
          logError('Error refreshing special class student charges:', error);
          throw new Error('فشل في تحديث رسوم الطالب الذين التحقوا بدروس خاصة');
        }
      },
    ),
  );

  // Receipt management handlers
  ipcMain.handle(
    'receipts:generate',
    requireRoles(['Superadmin', 'Administrator', 'FinanceManager'])(async (event, options = {}) => {
      try {
        const receiptType = options.receiptType || 'fee_payment';
        const result = await generateReceiptNumber(receiptType, event.sender.userId);
        return result;
      } catch (error) {
        logError('Error generating receipt number:', error);
        throw new Error('Failed to generate receipt number.');
      }
    }),
  );

  ipcMain.handle(
    'receipts:getStats',
    requireRoles(['Superadmin', 'Administrator', 'FinanceManager'])(async (_, year = null) => {
      try {
        return await getReceiptBookStats(year);
      } catch (error) {
        logError('Error getting receipt book stats:', error);
        throw new Error('Failed to get receipt book statistics.');
      }
    }),
  );

  ipcMain.handle(
    'receipts:validate',
    requireRoles(['Superadmin', 'Administrator', 'FinanceManager'])(async (_, receiptNumber) => {
      try {
        const { validateReceiptNumber } = require('../services/receiptService');
        return validateReceiptNumber(receiptNumber);
      } catch (error) {
        logError('Error validating receipt number:', error);
        throw new Error('Failed to validate receipt number.');
      }
    }),
  );
}

/**
 * Checks all students and generates missing charges for them.
 * Used after database import to ensure all students have proper charges.
 */
async function checkAndGenerateChargesForAllStudents(settings) {
  try {
    // Safeguard against undefined settings parameter
    if (!settings) {
      log(
        '[checkAndGenerateChargesForAllStudents] No settings provided, fetching from database...',
      );
      const { internalGetSettingsHandler } = require('./settingsHandlers');
      const { settings: dbSettings } = await internalGetSettingsHandler();
      settings = dbSettings;
    }

    // Use provided settings to check if fees are configured
    const annualFee = parseFloat(settings.annual_fee || '0');
    const monthlyFee = parseFloat(settings.standard_monthly_fee || '0');

    log(
      `[checkAndGenerateChargesForAllStudents] Annual fee: ${annualFee}, Monthly fee: ${monthlyFee}`,
    );

    if (annualFee <= 0 && monthlyFee <= 0) {
      log(
        '[checkAndGenerateChargesForAllStudents] Fees not configured yet - skipping charge generation',
      );
      return { success: true, studentsProcessed: 0, skipped: true, message: 'Fees not configured' };
    }

    const startMonth = parseInt(settings.academic_year_start_month || 9);
    const academicYear = getCurrentAcademicYear(startMonth);
    log(`[checkAndGenerateChargesForAllStudents] Using academic year: ${academicYear}`);

    const students = await db.allQuery(
      "SELECT id FROM students WHERE status = 'active' AND (fee_category = 'CAN_PAY' OR fee_category = 'SPONSORED')",
    );

    if (students.length === 0) {
      log('[DB Import] No eligible students found - skipping charge generation');
      return { success: true, studentsProcessed: 0 };
    }

    await db.runQuery('BEGIN TRANSACTION;');

    let chargesGenerated = false;

    // Generate annual charges if configured
    if (annualFee > 0) {
      log(
        `[checkAndGenerateChargesForAllStudents] Generating annual charges for ${students.length} students...`,
      );
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

    // Generate monthly charges if configured
    // Generate for current month only during initial setup (not future months)
    if (monthlyFee > 0) {
      const currentMonth = new Date().getMonth() + 1;
      const currentAcademicYear = academicYear;

      log(
        `[checkAndGenerateChargesForAllStudents] Generating monthly charges for current month: ${currentMonth}, year: ${currentAcademicYear}`,
      );
      log(
        `[checkAndGenerateChargesForAllStudents] Monthly fee: ${monthlyFee}, Students count: ${students.length}`,
      );

      try {
        log(
          `[checkAndGenerateChargesForAllStudents] Calling generateMonthlyFeeCharges(${currentAcademicYear}, ${currentMonth}, false)`,
        );
        const result = await generateMonthlyFeeCharges(currentAcademicYear, currentMonth, false);
        log(
          `[checkAndGenerateChargesForAllStudents] Monthly charge generation result: ${JSON.stringify(result)}`,
        );

        log(
          `[checkAndGenerateChargesForAllStudents] Monthly charges generated successfully for current month`,
        );
        chargesGenerated = true;
      } catch (error) {
        logError(
          `[checkAndGenerateChargesForAllStudents] Error generating monthly charges:`,
          error,
        );
        logError(`[checkAndGenerateChargesForAllStudents] Error stack:`, error.stack);
      }
    } else {
      log(`[checkAndGenerateChargesForAllStudents] Skipping monthly charges (fee is 0)`);
    }

    await db.runQuery('COMMIT;');
    log(
      `[checkAndGenerateChargesForAllStudents] Transaction committed. Charges generated: ${chargesGenerated}`,
    );

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
  refreshStudentCharges,
  refreshAllStudentCharges,
  getStudentFeeStatus,
  recordStudentPayment,
  checkAndGenerateChargesForAllStudents,
  getCurrentAcademicYear,
  calculateStudentMonthlyCharges,
  triggerChargeRegenerationForStudent,
};
