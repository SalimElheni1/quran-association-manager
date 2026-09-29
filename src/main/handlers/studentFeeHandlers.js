/**
 * @fileoverview IPC handlers for student fee management
 * @author Salim Elhani
 * @version 1.0.0
 */

const { ipcMain } = require('electron');
const db = require('../../db/db');
const { requireRoles } = require('../authMiddleware');
const { getUserIdForEvent } = require('../sessionManager');
const { log, error: logError, warn: logWarn } = require('../logger');
const { generateReceiptNumber, getReceiptBookStats } = require('../services/receiptService');
const { studentPaymentValidationSchema } = require('../validationSchemas');
const { toLocalISODate, toLocalISODateTime } = require('../utils/dates');
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
 * Rounds an amount to cents (millimes are not billed), so a discounted fee such as
 * 30 × 0.93 is stored as 27.9 and a payment of exactly that amount settles it.
 * @param {number} amount
 * @returns {number}
 */
function roundCents(amount) {
  return Math.round((Number(amount) || 0) * 100) / 100;
}

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
 * Gets the current academic year using the configured start month from settings.
 * Falls back to September (9) when the setting is missing.
 * @param {Date} referenceDate Optional reference date (default: now)
 * @returns {Promise<string>} Academic year in format "YYYY-YYYY" (e.g., "2024-2025")
 */
async function getConfiguredAcademicYear(referenceDate = new Date()) {
  const startMonthSetting = await getSetting('academic_year_start_month');
  const startMonth = parseInt(startMonthSetting || '9', 10);
  return getCurrentAcademicYear(startMonth, referenceDate);
}

/**
 * The configured academic-year start month and the current academic year, for the renderer,
 * which must use the same year as the charges it shows and the payments it records.
 * @returns {Promise<{startMonth: number, academicYear: string}>}
 */
async function getAcademicYearInfo() {
  const startMonth = parseInt((await getSetting('academic_year_start_month')) || '9', 10) || 9;
  return { startMonth, academicYear: getCurrentAcademicYear(startMonth) };
}

/**
 * Normalizes an academic-year value to the canonical "YYYY-YYYY" format.
 * A bare year like "2026" is treated as the academic year ending in that
 * calendar year (i.e. "2025-2026"), keeping every table consistent.
 * @param {string|null|undefined} value The academic year value to normalize.
 * @returns {string|null} The normalized academic year, or null when absent.
 */
function normalizeAcademicYear(value) {
  if (!value) return null;
  const s = String(value).trim();
  if (/^\d{4}-\d{4}$/.test(s)) return s;
  if (/^\d{4}$/.test(s)) {
    const year = parseInt(s, 10);
    return `${year - 1}-${year}`;
  }
  return s;
}

// Each class takes its payment system (MONTHLY/ANNUAL) from its age group.
const ENROLLED_CLASSES_SQL = `
  SELECT c.id, c.name, c.fee_type, c.monthly_fee,
         COALESCE(ag.payment_frequency, 'MONTHLY') AS payment_frequency
  FROM classes c
  JOIN class_students cs ON c.id = cs.class_id
  LEFT JOIN age_groups ag ON ag.id = c.age_group_id
  WHERE cs.student_id = ? AND c.status = 'active'
`;

// The age groups of a student's active classes, with their fee amounts (NULL = branch amount),
// payment system, and whether the student has a standard class in the group (only those set
// the student's payment system, see resolvePaymentFrequencyFromClasses).
const ENROLLED_FEE_GROUPS_SQL = `
  SELECT ag.id, ag.name, ag.min_age, ag.annual_fee, ag.monthly_fee, ag.payment_frequency,
         MAX(CASE WHEN c.fee_type = 'standard' THEN 1 ELSE 0 END) AS has_standard
  FROM classes c
  JOIN class_students cs ON c.id = cs.class_id
  JOIN age_groups ag ON ag.id = c.age_group_id
  WHERE cs.student_id = ? AND c.status = 'active'
  GROUP BY ag.id
  ORDER BY ag.min_age, ag.id
`;

/**
 * The branch fee amounts from the fee settings, used by age groups without their own fees.
 * @returns {Promise<{annual: number, monthly: number}>}
 */
async function getBranchFees() {
  return {
    annual: parseFloat((await getSetting('annual_fee')) || '0') || 0,
    monthly: parseFloat((await getSetting('standard_monthly_fee')) || '0') || 0,
  };
}

/**
 * Whether any annual / monthly fee is configured, for the branch or for an active age group.
 * @returns {Promise<{annual: boolean, monthly: boolean}>}
 */
async function getConfiguredFeeKinds(branchFees = null) {
  const fees = branchFees || (await getBranchFees());
  const groups =
    (await db.getQuery(
      `SELECT MAX(CASE WHEN annual_fee > 0 THEN 1 ELSE 0 END) AS annual,
              MAX(CASE WHEN monthly_fee > 0 THEN 1 ELSE 0 END) AS monthly
       FROM age_groups WHERE is_active = 1`,
    )) || {};
  return {
    annual: fees.annual > 0 || Number(groups.annual) === 1,
    monthly: fees.monthly > 0 || Number(groups.monthly) === 1,
  };
}

/**
 * Works out which age group's fees a student pays.
 * - No class in an age group: the branch amounts.
 * - One age group, or several with the same amounts: that amount.
 * - Several age groups with different amounts: the group an administrator chose for the student
 *   (students.fee_age_group_id); until one is chosen, the group with the higher fee, and
 *   `needsChoice` is true so the fees list can flag the student. A student billed annually
 *   (a standard class in an ANNUAL group) defaults to the ANNUAL group with the higher annual
 *   fee, so the amount comes from a group whose payment system the student follows.
 * @param {number} studentId
 * @param {{annual: number, monthly: number}} [branchFees] Branch amounts, when already loaded.
 * @returns {Promise<{annualFee: number, monthlyFee: number, group: object|null, groups: Array, needsChoice: boolean}>}
 */
async function resolveStudentFeeGroup(studentId, branchFees = null) {
  const fees = branchFees || (await getBranchFees());
  const rows = (await db.allQuery(ENROLLED_FEE_GROUPS_SQL, [studentId])) || [];
  const groups = rows
    .filter((row) => row && row.id !== undefined && row.id !== null)
    .map((row) => ({
      id: row.id,
      name: row.name,
      annualFee: row.annual_fee ?? fees.annual,
      monthlyFee: row.monthly_fee ?? fees.monthly,
      paysAnnually: row.payment_frequency === 'ANNUAL' && Number(row.has_standard) === 1,
    }));

  if (groups.length === 0) {
    return {
      annualFee: fees.annual,
      monthlyFee: fees.monthly,
      group: null,
      groups,
      needsChoice: false,
    };
  }

  const student = await db.getQuery('SELECT fee_age_group_id FROM students WHERE id = ?', [
    studentId,
  ]);
  const chosen = groups.find((g) => Number(g.id) === Number(student?.fee_age_group_id));
  const amountsDiffer = groups.some(
    (g) => g.annualFee !== groups[0].annualFee || g.monthlyFee !== groups[0].monthlyFee,
  );
  const annualGroups = groups.filter((g) => g.paysAnnually);
  const group =
    chosen ||
    (annualGroups.length > 0
      ? [...annualGroups].sort(
          (a, b) => b.annualFee - a.annualFee || b.monthlyFee - a.monthlyFee,
        )[0]
      : [...groups].sort((a, b) => b.monthlyFee - a.monthlyFee || b.annualFee - a.annualFee)[0]);

  return {
    annualFee: group.annualFee,
    monthlyFee: group.monthlyFee,
    group,
    groups,
    needsChoice: amountsDiffer && !chosen,
  };
}

/**
 * Re-bills this academic year's annual charge of a student at their current age group's fee,
 * as long as nothing has been paid on it (a paid or partly paid charge is never changed).
 * @param {number} studentId
 * @param {string} academicYear
 */
async function rebillUnpaidAnnualCharge(studentId, academicYear) {
  const { annualFee } = await resolveStudentFeeGroup(studentId);
  if (!(annualFee > 0)) return;
  await db.runQuery(
    `UPDATE student_fee_charges SET amount = ?
     WHERE student_id = ? AND fee_type = 'ANNUAL' AND academic_year = ?
       AND (amount_paid IS NULL OR amount_paid = 0) AND amount != ?`,
    [annualFee, studentId, academicYear, annualFee],
  );
}

/**
 * Resolves a student's payment frequency from their active classes' age groups.
 * The most restrictive frequency wins: if any standard class is ANNUAL, the student pays ANNUAL.
 * @param {Array<{fee_type: string, payment_frequency: string}>} enrolledClasses Active classes of the student.
 * @returns {'MONTHLY'|'ANNUAL'} The resolved payment frequency.
 */
function resolvePaymentFrequencyFromClasses(enrolledClasses) {
  return enrolledClasses.some((c) => c.fee_type === 'standard' && c.payment_frequency === 'ANNUAL')
    ? 'ANNUAL'
    : 'MONTHLY';
}

/**
 * Resolves the payment frequency for a specific student.
 * @param {number} studentId Student ID.
 * @returns {Promise<'MONTHLY'|'ANNUAL'>} The resolved payment frequency.
 */
async function getStudentPaymentFrequency(studentId) {
  const enrolledClasses = await db.allQuery(ENROLLED_CLASSES_SQL, [studentId]);
  return resolvePaymentFrequencyFromClasses(enrolledClasses);
}

/**
 * Builds the Arabic description for a monthly charge.
 * ANNUAL-frequency charges are labelled "(دفع سنوي)".
 * @param {string} monthName Arabic month name.
 * @param {string} academicYear Academic year string.
 * @param {'MONTHLY'|'ANNUAL'} paymentFrequency Resolved payment frequency.
 * @returns {string} The charge description.
 */
function buildMonthlyChargeDescription(monthName, academicYear, paymentFrequency) {
  return paymentFrequency === 'ANNUAL'
    ? `رسوم شهرية ${monthName} (دفع سنوي) - ${academicYear}`
    : `رسوم شهرية ${monthName} - ${academicYear}`;
}

// ============================================
// CHARGE GENERATION
// ============================================

/**
 * Generates annual fee charges for all eligible students.
 * @param {string} academicYear The academic year for which to generate charges.
 * @param {boolean} useTransaction Whether to wrap in transaction (default: true)
 */
async function generateAnnualFeeCharges(academicYear) {
  return db.withTransaction(async () => {
    const branchFees = await getBranchFees();
    if (!(await getConfiguredFeeKinds(branchFees)).annual) {
      logWarn('[FeeGen] Annual fee is not set or zero. Skipping charge generation.');
      return { success: true, message: 'Skipped: Fee not configured' };
    }

    const students = await db.allQuery(
      "SELECT id FROM students WHERE status = 'active' AND (fee_category = 'CAN_PAY' OR fee_category = 'SPONSORED')",
    );

    const chargeDate = toLocalISODate();
    let createdCount = 0;

    for (const student of students) {
      const existingCharge = await db.getQuery(
        `SELECT id FROM student_fee_charges WHERE student_id = ? AND fee_type = 'ANNUAL' AND academic_year = ?`,
        [student.id, academicYear],
      );

      if (!existingCharge) {
        // The annual fee of the student's age group (or the branch fee).
        const { annualFee } = await resolveStudentFeeGroup(student.id, branchFees);
        if (!(annualFee > 0)) continue;
        await db.runQuery(
          `INSERT INTO student_fee_charges (student_id, charge_date, fee_type, description, amount, academic_year, status)
         VALUES (?, ?, 'ANNUAL', ?, ?, ?, 'UNPAID')`,
          [student.id, chargeDate, `رسوم سنوية - ${academicYear}`, annualFee, academicYear],
        );
        createdCount++;
      }
    }
    log(`[FeeGen] Generated ${createdCount} annual charges for ${academicYear}`);
    return { success: true, createdCount };
  });
}

/**
 * Generates monthly fee charges for all eligible students.
 * @param {string} academicYear The academic year for which to generate charges.
 * @param {number} month The month for which to generate charges (1-12).
 * @param {object} [options]
 * @param {boolean} [options.force] Whether to force regeneration even if charges exist (default: false)
 * @param {boolean} [options.useTransaction] Whether to wrap in a transaction (default: true).
 *   db.withTransaction is nesting-safe, so callers already inside a transaction can rely on it.
 */
async function generateMonthlyFeeCharges(academicYear, month, options = {}) {
  const { force = false } = options;
  return db
    .withTransaction(async () => {
      const branchFees = await getBranchFees();
      const hasSpecialFeeClasses = await db.getQuery(
        "SELECT 1 AS found FROM classes WHERE status = 'active' AND fee_type = 'special' AND monthly_fee > 0 LIMIT 1",
      );

      if (!(await getConfiguredFeeKinds(branchFees)).monthly && !hasSpecialFeeClasses) {
        logWarn(
          `[FeeGen] Standard monthly fee is not set or zero. Skipping monthly charges for month ${month}.`,
        );
        return { success: true, message: 'Skipped: Fee not configured' };
      }

      const chargeDate = toLocalISODate();
      const billingMonth = `${academicYear}-${month.toString().padStart(2, '0')}`;
      const monthNames = [
        'يناير',
        'فبراير',
        'مارس',
        'أبريل',
        'مايو',
        'يونيو',
        'يوليو',
        'أغسطس',
        'سبتمبر',
        'أكتوبر',
        'نوفمبر',
        'ديسمبر',
      ];
      const monthName = monthNames[month - 1];

      const students = await db.allQuery(
        "SELECT id, gender, discount_percentage FROM students WHERE status = 'active' AND (fee_category = 'CAN_PAY' OR fee_category = 'SPONSORED')",
      );

      let createdCount = 0;

      for (const student of students) {
        const existingCharge = await db.getQuery(
          `SELECT id, amount_paid FROM student_fee_charges WHERE student_id = ? AND fee_type = 'MONTHLY' AND billing_month = ?`,
          [student.id, billingMonth],
        );

        if (existingCharge && !force) continue;
        if (existingCharge && force && parseFloat(existingCharge.amount_paid || 0) > 0) {
          log(
            `[FeeGen] Skipping force-regeneration for student ${student.id}: existing charge has payments recorded`,
          );
          continue;
        }
        if (existingCharge && force) {
          await db.runQuery('DELETE FROM student_fee_charges WHERE id = ?', [existingCharge.id]);
        }

        const enrolledClasses = await db.allQuery(ENROLLED_CLASSES_SQL, [student.id]);
        const paymentFrequency = resolvePaymentFrequencyFromClasses(enrolledClasses);

        // Annual-only billing: ANNUAL students are billed once per academic
        // year (one ANNUAL charge) - never generate monthly charges for them.
        if (paymentFrequency === 'ANNUAL') {
          log(
            `[FeeGen] Skipping monthly charge for student ${student.id}: billed ANNUALLY for ${academicYear}`,
          );
          continue;
        }

        let totalMonthlyFee = 0;
        const hasStandardClass = enrolledClasses.some((c) => c.fee_type === 'standard');
        // The monthly fee of the student's age group (or the branch fee).
        const { monthlyFee: standardMonthlyFee } = await resolveStudentFeeGroup(
          student.id,
          branchFees,
        );
        if ((enrolledClasses.length === 0 || hasStandardClass) && standardMonthlyFee > 0) {
          totalMonthlyFee += standardMonthlyFee;
        }

        enrolledClasses.forEach((c) => {
          if (c.fee_type === 'special' && c.monthly_fee > 0) totalMonthlyFee += c.monthly_fee;
        });

        if (totalMonthlyFee > 0) {
          const discount = student.discount_percentage || 0;
          if (discount > 0) totalMonthlyFee = roundCents(totalMonthlyFee * (1 - discount / 100));

          const relatedClassId = enrolledClasses.length === 1 ? enrolledClasses[0].id : null;

          await db.runQuery(
            `INSERT INTO student_fee_charges (student_id, charge_date, fee_type, description, amount, academic_year, status, payment_frequency, billing_month, related_class_id)
           VALUES (?, ?, 'MONTHLY', ?, ?, ?, 'UNPAID', ?, ?, ?)`,
            [
              student.id,
              chargeDate,
              buildMonthlyChargeDescription(monthName, academicYear, paymentFrequency),
              totalMonthlyFee,
              academicYear,
              paymentFrequency,
              billingMonth,
              relatedClassId,
            ],
          );
          createdCount++;
        }
      }
      log(`[FeeGen] Generated ${createdCount} monthly charges for ${academicYear}-${month}`);
      return { success: true, createdCount };
    })
    .catch((error) => {
      logError('Error in generateMonthlyFeeCharges:', error);
      return { success: false, error: error.message };
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
    // The monthly fee of the student's age group (or the branch fee).
    const { monthlyFee: standardMonthlyFee } = await resolveStudentFeeGroup(studentId);

    const student = await db.getQuery('SELECT discount_percentage FROM students WHERE id = ?', [
      studentId,
    ]);

    const enrolledClasses = await db.allQuery(ENROLLED_CLASSES_SQL, [studentId]);

    // Annual-only billing: ANNUAL students get one ANNUAL charge per academic
    // year and no monthly charges (standard or special), so their monthly fee
    // is zero by design.
    const paymentFrequency = resolvePaymentFrequencyFromClasses(enrolledClasses);
    if (paymentFrequency === 'ANNUAL') {
      log(`[FeeCalc] Student ${studentId} is billed ANNUALLY - no monthly charges.`);
      return { standard: 0, custom: 0, total: 0, relatedClassId: null };
    }

    let fees = {
      standard: 0,
      custom: 0,
      total: 0,
      relatedClassId: enrolledClasses.length === 1 ? enrolledClasses[0].id : null,
    };

    const hasStandardClass = enrolledClasses.some((c) => c.fee_type === 'standard');
    const hasSpecialClass = enrolledClasses.some((c) => c.fee_type === 'special');

    log(
      `[FeeCalc] Student ${studentId}, Month ${month}/${academicYear}: ${enrolledClasses.length} classes enrolled`,
    );
    log(`[FeeCalc] - Standard: ${hasStandardClass}, Special: ${hasSpecialClass}`);

    // Apply standard fee if student has standard class or no classes
    if ((enrolledClasses.length === 0 || hasStandardClass) && standardMonthlyFee > 0) {
      fees.standard = standardMonthlyFee;
      log(`[FeeCalc] - Applied standard fee: ${standardMonthlyFee} DT`);
    }

    // Sum custom fees from special classes
    enrolledClasses.forEach((c) => {
      if (c.fee_type === 'special' && c.monthly_fee > 0) {
        fees.custom += c.monthly_fee;
        log(`[FeeCalc] - Added special class fee (${c.name}): ${c.monthly_fee} DT`);
      }
    });

    fees.total = fees.standard + fees.custom;

    // Apply student discount if exists
    if (student?.discount_percentage > 0) {
      const discountAmount = fees.total * (student.discount_percentage / 100);
      fees.total = roundCents(fees.total * (1 - student.discount_percentage / 100));
      log(`[FeeCalc] - Applied discount (${student.discount_percentage}%): -${discountAmount} DT`);
    }

    log(
      `[FeeCalc] - TOTAL for student ${studentId}: ${fees.total} DT (standard: ${fees.standard}, custom: ${fees.custom})`,
    );

    return fees;
  } catch (error) {
    logError(
      `[calculateStudentMonthlyCharges] Error calculating fees for student ${studentId}:`,
      error,
    );
    return { standard: 0, custom: 0, total: 0, relatedClassId: null };
  }
}

/**
 * Triggers immediate charge regeneration for a student when enrollment changes.
 * Deletes and recreates charges for current month ONLY during enrollment.
 * Next month charges are generated by the scheduler when the month arrives.
 * Called when student is added/removed from classes.
 * @param {number} studentId - Student ID
 * @param {Object} options - Options
 * @param {boolean} options.regenCurrentMonth - Regen current month (default: true). A month is
 *   only billed once it starts, so there is no next-month option.
 * @param {number} options.userId - User performing action (for audit)
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function triggerChargeRegenerationForStudent(studentId, options = {}) {
  const { regenCurrentMonth = true } = options;

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
    log(`[ChargeRegen] Options: regenCurrentMonth=${regenCurrentMonth}`);

    const student = await db.getQuery(
      'SELECT id, name, status, fee_category FROM students WHERE id = ?',
      [studentId],
    );

    if (!student) {
      log(`[ChargeRegen] ❌ Student ${studentId} not found`);
      releaseChargeRegenerationLock(studentId);
      return { success: false, message: 'Student not found' };
    }

    log(
      `[ChargeRegen] Student: ${student.name} (ID: ${studentId}, Status: ${student.status}, Category: ${student.fee_category})`,
    );

    if (student.status !== 'active' || student.fee_category === 'EXEMPT') {
      log(`[ChargeRegen] ⚠️ Student ${studentId} not eligible for charges`);
      releaseChargeRegenerationLock(studentId);
      return { success: true, message: 'Student not eligible for charges' };
    }

    const now = new Date();
    const currentMonth = now.getMonth() + 1;
    const startMonthSetting = await getSetting('academic_year_start_month');
    const startMonth = parseInt(startMonthSetting || '9', 10);
    const currentAcademicYear = getCurrentAcademicYear(startMonth, now);
    const paymentFrequency = await getStudentPaymentFrequency(studentId);

    log(`[ChargeRegen] Current Month: ${currentMonth}/${currentAcademicYear}`);

    // The unpaid annual charge follows the fees of the student's current age group.
    try {
      await rebillUnpaidAnnualCharge(studentId, currentAcademicYear);
    } catch (error) {
      logError(`[ChargeRegen] Failed to re-bill the annual charge of student ${studentId}:`, error);
    }

    const monthNames = [
      'يناير',
      'فبراير',
      'مارس',
      'أبريل',
      'مايو',
      'يونيو',
      'يوليو',
      'أغسطس',
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

        const currentBillingMonth = `${currentAcademicYear}-${currentMonth
          .toString()
          .padStart(2, '0')}`;

        // Check existing charges BEFORE delete
        const existingCurrent = await db.allQuery(
          `
          SELECT id, amount, charge_date, amount_paid FROM student_fee_charges
          WHERE student_id = ?
          AND fee_type = 'MONTHLY'
          AND billing_month = ?
        `,
          [studentId, currentBillingMonth],
        );

        log(`[ChargeRegen] Found ${existingCurrent.length} existing current month charge(s):`);
        existingCurrent.forEach((c, i) => {
          log(`[ChargeRegen]   ${i + 1}. Amount: ${c.amount} DT, Date: ${c.charge_date}`);
        });

        // Never delete charges with recorded payments - regeneration would lose
        // payment history and its student_payment_breakdown rows.
        const hasPaidCharges = existingCurrent.some((c) => parseFloat(c.amount_paid || 0) > 0);

        if (hasPaidCharges) {
          log(
            `[ChargeRegen] ⓘ Skipping regeneration for ${currentBillingMonth}: existing charge(s) have payments recorded`,
          );
        } else {
          // Delete existing charges
          await db.runQuery(
            `
            DELETE FROM student_fee_charges
            WHERE student_id = ?
            AND fee_type = 'MONTHLY'
            AND billing_month = ?
          `,
            [studentId, currentBillingMonth],
          );

          log(`[ChargeRegen] ✓ Deleted ${existingCurrent.length} old charge(s)`);

          // Create new charge if total > 0
          if (currentFees.total > 0) {
            const chargeDate = toLocalISODate();
            const monthName = monthNames[currentMonth - 1];

            await db.runQuery(
              `
                INSERT INTO student_fee_charges
                (student_id, charge_date, fee_type, description, amount, academic_year, status, payment_frequency, billing_month, related_class_id)
                VALUES (?, ?, 'MONTHLY', ?, ?, ?, 'UNPAID', ?, ?, ?)
              `,
              [
                studentId,
                chargeDate,
                buildMonthlyChargeDescription(monthName, currentAcademicYear, paymentFrequency),
                currentFees.total,
                currentAcademicYear,
                paymentFrequency,
                currentBillingMonth,
                currentFees.relatedClassId,
              ],
            );

            log(
              `[ChargeRegen] ✅ Created current month charge: ${currentFees.total} DT on ${chargeDate} (${paymentFrequency})`,
            );
          } else {
            log(`[ChargeRegen] ⓘ No charge created (amount: 0 DT)`);
          }
        }
      } catch (error) {
        logError(`[ChargeRegen] ❌ Failed to regen current month for student ${studentId}:`, error);
        // Don't throw - regeneration failures are logged, not fatal
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
 * Refreshes charges for a specific student: the annual charge and the current month's charge.
 * A month is only billed once it starts.
 * This is useful when a student enrolls in new classes or fee structures change.
 * @param {number} studentId The ID of the student whose charges to refresh
 * @param {string} academicYear The academic year for which to generate charges (optional, uses current if not provided)
 * @param {number} userId The ID of the user performing the refresh (for audit trail)
 * @returns {Promise<object>} Result object with success status and details
 */
async function refreshStudentCharges(studentId, academicYear = null, userId = null) {
  if (!acquireChargeRegenerationLock(studentId)) {
    log(
      `[refreshStudentCharges] ⚠️ Charge refresh already in progress for student ${studentId} - rejecting duplicate request`,
    );
    return { success: false, message: 'Charge refresh already in progress for this student' };
  }

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
    const currentAcademicYear = academicYear || (await getConfiguredAcademicYear());
    log(`[refreshStudentCharges] Using academic year: ${currentAcademicYear}`);

    const now = new Date();
    const currentMonth = now.getMonth() + 1;

    const result = await db.withTransaction(async () => {
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
        const { annualFee } = await resolveStudentFeeGroup(studentId);
        if (annualFee > 0) {
          const chargeDate = toLocalISODate();
          await db.runQuery(
            `
          INSERT INTO student_fee_charges (student_id, charge_date, fee_type, description, amount, academic_year, status)
          VALUES (?, ?, 'ANNUAL', ?, ?, ?, 'UNPAID')
        `,
            [
              studentId,
              chargeDate,
              `رسوم سنوية - ${currentAcademicYear}`,
              annualFee,
              currentAcademicYear,
            ],
          );
          chargesGenerated++;
          log(`[refreshStudentCharges] Generated annual charge for student ${studentId}`);
        }
      }

      // Generate monthly charges for current month
      log(`[refreshStudentCharges] Generating monthly charges for current month (${currentMonth})`);

      // Generate charges ONLY for this specific student - current month
      try {
        const currentMonthFees = await calculateStudentMonthlyCharges(
          studentId,
          currentMonth,
          currentAcademicYear,
        );

        if (currentMonthFees.total > 0) {
          const currentBillingMonth = `${currentAcademicYear}-${currentMonth
            .toString()
            .padStart(2, '0')}`;

          const existingCharges = await db.allQuery(
            `SELECT id, amount_paid FROM student_fee_charges WHERE student_id = ? AND fee_type = 'MONTHLY' AND billing_month = ?`,
            [studentId, currentBillingMonth],
          );
          const hasPaidCharges = existingCharges.some((c) => parseFloat(c.amount_paid || 0) > 0);

          const paymentFrequency = await getStudentPaymentFrequency(studentId);

          if (hasPaidCharges) {
            // Never delete charges with recorded payments - regeneration would
            // lose payment history and its student_payment_breakdown rows.
            log(
              `[refreshStudentCharges] ⓘ Skipping regeneration for ${currentBillingMonth}: existing charge(s) have payments recorded`,
            );
          } else {
            // Delete any existing unpaid charges for this student for this billing period
            await db.runQuery(
              `
            DELETE FROM student_fee_charges
            WHERE student_id = ?
            AND fee_type = 'MONTHLY'
            AND billing_month = ?
          `,
              [studentId, currentBillingMonth],
            );

            // Create new charge for this month
            const chargeDate = toLocalISODate();
            const monthNames = [
              'يناير',
              'فبراير',
              'مارس',
              'أبريل',
              'مايو',
              'يونيو',
              'يوليو',
              'أغسطس',
              'سبتمبر',
              'أكتوبر',
              'نوفمبر',
              'ديسمبر',
            ];

            await db.runQuery(
              `
            INSERT INTO student_fee_charges
            (student_id, charge_date, fee_type, description, amount, academic_year, status, payment_frequency, billing_month, related_class_id)
            VALUES (?, ?, 'MONTHLY', ?, ?, ?, 'UNPAID', ?, ?, ?)
          `,
              [
                studentId,
                chargeDate,
                buildMonthlyChargeDescription(
                  monthNames[currentMonth - 1],
                  currentAcademicYear,
                  paymentFrequency,
                ),
                currentMonthFees.total,
                currentAcademicYear,
                paymentFrequency,
                currentBillingMonth,
                currentMonthFees.relatedClassId,
              ],
            );
            chargesGenerated++;
            log(
              `[refreshStudentCharges] Generated current month charge for student ${studentId}: ${currentMonthFees.total} DT (${paymentFrequency})`,
            );
          }
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

      return {
        success: true,
        message: `تم تحديث الرسوم للطالب ${student.name} بنجاح`,
        studentId,
        studentName: student.name,
        chargesGenerated,
        academicYear: currentAcademicYear,
      };
    });
    log(
      `[refreshStudentCharges] Successfully refreshed charges for student ${studentId}. Generated: ${result.chargesGenerated} charges`,
    );

    return result;
  } catch (error) {
    logError('Error in refreshStudentCharges:', error);
    throw new Error(`فشل في تحديث الرسوم: ${error.message}`);
  } finally {
    releaseChargeRegenerationLock(studentId);
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
  const currentAcademicYear = academicYear || (await getConfiguredAcademicYear());
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
  try {
    log(
      '[refreshStudentsNeedingChargeRefresh] Starting selective charge refresh for students with new special class enrollments',
    );

    // Determine academic year
    const currentAcademicYear = academicYear || (await getConfiguredAcademicYear());
    log(`[refreshStudentsNeedingChargeRefresh] Using academic year: ${currentAcademicYear}`);

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

    const result = await db.withTransaction(async () => {
      let totalChargesGenerated = 0;
      const results = [];

      // Process each student individually to avoid cascading failures
      for (const student of studentsNeedingRefresh) {
        try {
          log(
            `[refreshStudentsNeedingChargeRefresh] Processing student ${student.id} (${student.name}) - enrolled ${student.classEnrollmentDate}, first charged ${student.firstChargeDate}`,
          );

          let studentChargesGenerated = 0;

          // Regenerate this student's current month charge so any newly enrolled
          // special-class fees are included. Per-student regeneration is O(N) and
          // actually targets the student that needs the refresh.
          const regenResult = await triggerChargeRegenerationForStudent(student.id, {
            regenCurrentMonth: true,
          });

          if (regenResult.success) {
            studentChargesGenerated = 1;
            log(
              `[refreshStudentsNeedingChargeRefresh] Regenerated charges for student ${student.id}: ${regenResult.message}`,
            );
          } else {
            log(
              `[refreshStudentsNeedingChargeRefresh] Skipped regeneration for student ${student.id}: ${regenResult.message}`,
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
            success: regenResult.success,
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
    });
    log(
      `[refreshStudentsNeedingChargeRefresh] Successfully completed selective refresh. Processed: ${studentsNeedingRefresh.length}, Generated: ${result.chargesGenerated} charges`,
    );

    return result;
  } catch (error) {
    logError('Error in refreshStudentsNeedingChargeRefresh:', error);
    throw new Error(`فشل في تحديث الرسوم: ${error.message}`);
  }
}

/**
 * Refreshes charges for all active students: the annual charge and the current month's charge.
 * A month is only billed once it starts.
 * This is useful for system-wide fee structure changes or bulk updates.
 * @param {string} academicYear The academic year for which to generate charges (optional, uses current if not provided)
 * @param {number} userId The ID of the user performing the refresh (for audit trail)
 * @returns {Promise<object>} Result object with success status and details
 */
async function refreshAllStudentCharges(academicYear = null, userId = null) {
  return db.withTransaction(async () => {
    log('[refreshAllStudentCharges] Starting bulk charge refresh for all students');

    const currentAcademicYear = academicYear || (await getConfiguredAcademicYear());
    const now = new Date();
    const currentMonth = now.getMonth() + 1;

    const students = await db.allQuery(
      "SELECT id, name, matricule FROM students WHERE status = 'active' AND fee_category IN ('CAN_PAY', 'SPONSORED')",
    );

    if (students.length === 0) {
      log('[refreshAllStudentCharges] No eligible students found');
      return {
        success: true,
        message: 'لا توجد طلاب مؤهلون لتوليد الرسوم',
        studentsProcessed: 0,
        chargesGenerated: 0,
      };
    }

    let totalChargesGenerated = 0;
    const branchFees = await getBranchFees();
    const chargeDate = toLocalISODate();

    for (const student of students) {
      try {
        let studentChargesGenerated = 0;

        // Annual check
        const existingAnnual = await db.getQuery(
          "SELECT id FROM student_fee_charges WHERE student_id = ? AND fee_type = 'ANNUAL' AND academic_year = ?",
          [student.id, currentAcademicYear],
        );
        const { annualFee } = existingAnnual
          ? { annualFee: 0 }
          : await resolveStudentFeeGroup(student.id, branchFees);
        if (!existingAnnual && annualFee > 0) {
          await db.runQuery(
            "INSERT INTO student_fee_charges (student_id, charge_date, fee_type, description, amount, academic_year, status) VALUES (?, ?, 'ANNUAL', ?, ?, ?, 'UNPAID')",
            [
              student.id,
              chargeDate,
              `رسوم سنوية - ${currentAcademicYear}`,
              annualFee,
              currentAcademicYear,
            ],
          );
          studentChargesGenerated++;
        }

        totalChargesGenerated += studentChargesGenerated;
      } catch (studentError) {
        logError(
          `[refreshAllStudentCharges] Error processing student ${student.id}:`,
          studentError,
        );
      }
    }

    // The current month's charges, for every eligible student at once.
    const monthly = await generateMonthlyFeeCharges(currentAcademicYear, currentMonth, {
      force: false,
    });
    totalChargesGenerated += monthly?.createdCount || 0;

    if (userId) {
      log(
        `[AUDIT] Bulk charge refresh performed by user ${userId}. Processed ${students.length} students, generated ${totalChargesGenerated} charges.`,
      );
    }

    return {
      success: true,
      message: `تم تحديث الرسوم لجميع الطلاب بنجاح (معالجة ${students.length} طالب).`,
      studentsProcessed: students.length,
      chargesGenerated: totalChargesGenerated,
    };
  });
}

// ============================================
// FEE STATUS & PAYMENT
// ============================================

/**
 * Gets the fee status for a single student.
 * @param {number} studentId The ID of the student.
 * @param {string} [academicYear] When provided, only charges of that academic year are considered,
 *   plus the student's credit from any year: a payment uses available credit whatever year it
 *   was recorded in, so it is shown with the year the student is paying now.
 * @returns {Promise<object>} An object containing the student's fee status.
 */
async function getStudentFeeStatus(studentId, academicYear = null) {
  try {
    const normalizedYear = normalizeAcademicYear(academicYear);
    const charges = await db.allQuery(
      `SELECT * FROM student_fee_charges WHERE student_id = ?${
        normalizedYear ? " AND (academic_year = ? OR fee_type = 'CREDIT')" : ''
      }`,
      normalizedYear ? [studentId, normalizedYear] : [studentId],
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

    // Round to cents so a fully-paid student never shows a floating-point residue
    totalDue = Math.round(totalDue * 100) / 100;
    totalPaid = Math.round(totalPaid * 100) / 100;
    totalCredit = Math.round(totalCredit * 100) / 100;

    // Balance = amount due - amount paid - credit
    const balance = Math.round((totalDue - totalPaid - totalCredit) * 100) / 100;

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
 * Sums charges into due / paid / credit / balance, rounded to cents.
 * @param {Array<object>} charges student_fee_charges rows
 * @returns {{totalDue: number, totalPaid: number, totalCredit: number, balance: number}}
 */
function summarizeCharges(charges) {
  let totalDue = 0;
  let totalPaid = 0;
  let totalCredit = 0;
  for (const charge of charges) {
    if (charge.fee_type === 'CREDIT') {
      totalCredit += charge.amount_paid;
    } else {
      totalDue += charge.amount;
      totalPaid += charge.amount_paid;
    }
  }
  const round = (n) => Math.round(n * 100) / 100;
  return {
    totalDue: round(totalDue),
    totalPaid: round(totalPaid),
    totalCredit: round(totalCredit),
    balance: round(totalDue - totalPaid - totalCredit),
  };
}

/**
 * Lists a student's arrears from academic years before the given one, one entry per year
 * that still has a balance. These are kept apart from the current year's totals. Credit is
 * left out: it counts toward the current year (see getStudentFeeStatus).
 * @param {number} studentId The ID of the student.
 * @param {string} academicYear The current academic year ("YYYY-YYYY").
 * @returns {Promise<Array<object>>} [{ academicYear, charges, totalDue, totalPaid, totalCredit, balance }]
 */
async function getStudentPreviousYearsArrears(studentId, academicYear) {
  const normalizedYear = normalizeAcademicYear(academicYear);
  if (!normalizedYear) return [];
  const charges = await db.allQuery(
    `SELECT * FROM student_fee_charges
     WHERE student_id = ? AND academic_year < ? AND fee_type != 'CREDIT'
     ORDER BY academic_year DESC, due_date ASC, created_at ASC`,
    [studentId, normalizedYear],
  );
  const byYear = new Map();
  for (const charge of charges) {
    if (!byYear.has(charge.academic_year)) byYear.set(charge.academic_year, []);
    byYear.get(charge.academic_year).push(charge);
  }
  return [...byYear.entries()]
    .map(([year, yearCharges]) => ({
      academicYear: year,
      charges: yearCharges,
      ...summarizeCharges(yearCharges),
    }))
    .filter((year) => year.balance > 0);
}

/**
 * Gets a student's balance summary with proper positive/credit handling
 * @param {number} studentId The ID of the student.
 * @param {string} [academicYear] When provided, the totals cover that academic year only and
 *   earlier years' unpaid balances are returned separately in `previousYears`.
 * @returns {Promise<object>} Balance summary object
 */
async function getStudentBalanceSummary(studentId, academicYear = null) {
  try {
    const feeStatus = await getStudentFeeStatus(studentId, academicYear);
    const previousYears = academicYear
      ? await getStudentPreviousYearsArrears(studentId, academicYear)
      : [];
    const previousYearsBalance =
      Math.round(previousYears.reduce((sum, year) => sum + year.balance, 0) * 100) / 100;

    // Base balance calculation remains the same for compatibility
    // But we provide better display properties
    const { balance } = feeStatus;

    // Positive balance means money owed
    // Negative balance means credit available
    if (balance >= 0) {
      return {
        ...feeStatus,
        previousYears,
        previousYearsBalance,
        displayType: 'owed',
        displayAmount: balance,
        displayLabel: 'المبلغ المستحق', // Amount Owed
        displayClass: 'text-danger fw-bold',
      };
    } else {
      return {
        ...feeStatus,
        previousYears,
        previousYearsBalance,
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
 * Sets the age group whose fees a student pays (for students in classes of several age groups),
 * then re-bills this academic year's charges that have no payment yet: the annual charge and
 * the current month.
 * @param {number} studentId
 * @param {number|null} ageGroupId One of the age groups of the student's classes, or null to
 *   clear the choice.
 * @returns {Promise<object>} The student's fee group after the change.
 */
async function setStudentFeeGroup(studentId, ageGroupId) {
  const current = await resolveStudentFeeGroup(studentId);
  if (ageGroupId !== null && !current.groups.some((g) => Number(g.id) === Number(ageGroupId))) {
    throw new Error('الفئة العمرية المختارة ليست من فئات فصول هذا الطالب.');
  }
  await db.runQuery('UPDATE students SET fee_age_group_id = ? WHERE id = ?', [
    ageGroupId,
    studentId,
  ]);

  // Re-bills the unpaid annual charge and the current month.
  await triggerChargeRegenerationForStudent(studentId);
  notifyFinancialDataChanged();
  return resolveStudentFeeGroup(studentId);
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
    account_id,
  } = paymentDetails;

  console.log(
    `[PAYMENT_START] Recording payment for student ${student_id}, amount: ${amount}, method: ${payment_method}`,
  );

  try {
    console.log(`[PAYMENT_DB] Starting transaction...`);
    const studentPaymentId = await db.withTransaction(async () => {
      console.log(`[PAYMENT_DB] Transaction started successfully`);

      const normalizedAcademicYear =
        normalizeAcademicYear(academic_year) || (await getConfiguredAcademicYear());

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

        // Check unified transactions table (receipts are stored in voucher_number)
        const existingTransaction = await db.getQuery(
          'SELECT id FROM transactions WHERE voucher_number = ?',
          [receipt_number],
        );

        if (existingPayment || existingDonation || existingStudentPayment || existingTransaction) {
          console.log(
            `[PAYMENT_RECEIPT] Duplicate receipt found - existingPayment: ${!!existingPayment}, existingDonation: ${!!existingDonation}, existingStudentPayment: ${!!existingStudentPayment}, existingTransaction: ${!!existingTransaction}`,
          );
          throw new Error('DUPLICATE_RECEIPT');
        }
        console.log(`[PAYMENT_RECEIPT] Receipt validation passed`);
      }

      // 1. Create a student_payment record
      console.log(`[PAYMENT_DB] Creating payment record...`);
      const paymentResult = await db.runQuery(
        `
      INSERT INTO student_payments (student_id, amount, payment_method, payment_type, academic_year, notes, check_number, receipt_number, class_id, sponsor_name, sponsor_phone, payment_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
        [
          student_id,
          amount,
          payment_method,
          payment_type || 'رسوم الطلاب',
          normalizedAcademicYear,
          notes,
          check_number,
          receipt_number,
          class_id,
          sponsor_name,
          sponsor_phone,
          // Local time, like the linked transaction's date; CURRENT_TIMESTAMP would be UTC.
          toLocalISODateTime(),
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

      // Track available credit (decremented as it is applied to charges)
      const creditPool = existingCreditCharges.map((c) => ({ id: c.id, available: c.amount_paid }));

      // 3. Apply payment to outstanding charges (FIFO), satisfying each charge
      //    from existing credit first, then from the new cash payment.
      //    Only charges of the payment's academic year are settled: arrears from earlier
      //    years are kept apart and paid with a payment recorded for that year.
      console.log(
        `[PAYMENT_CHARGES] Applying payment of ${remainingAmountToApply} to outstanding charges...`,
      );
      const outstandingCharges = await db.allQuery(
        `
      SELECT * FROM student_fee_charges
      WHERE student_id = ? AND status IN ('UNPAID', 'PARTIALLY_PAID') AND fee_type != 'CREDIT'
        AND academic_year = ?
      ORDER BY due_date ASC, created_at ASC
    `,
        [student_id, normalizedAcademicYear],
      );

      // class_id-aware allocation: when a class is specified, satisfy that
      // class's charges first (oldest first), then fall back to remaining charges.
      const outstandingChargesSorted = class_id
        ? [
            ...outstandingCharges.filter((c) => Number(c.related_class_id) === Number(class_id)),
            ...outstandingCharges.filter((c) => Number(c.related_class_id) !== Number(class_id)),
          ]
        : outstandingCharges;

      console.log(
        `[PAYMENT_CHARGES] Found ${outstandingCharges.length} outstanding charges to apply payment to`,
      );

      for (const charge of outstandingChargesSorted) {
        if (remainingAmountToApply <= 0 && creditPool.every((c) => c.available <= 0)) break;

        const chargeBalance = roundCents(charge.amount - charge.amount_paid);
        if (chargeBalance <= 0) continue;

        let amountFromCredit = 0;
        let chargeRemaining = chargeBalance;

        // 3a. Apply existing credit first (oldest credit first)
        for (const credit of creditPool) {
          if (chargeRemaining <= 0) break;
          if (credit.available <= 0) continue;

          const creditToApply = Math.min(chargeRemaining, credit.available);
          if (creditToApply > 0) {
            await db.runQuery(
              `
            UPDATE student_fee_charges
            SET amount_paid = ?
            WHERE id = ?
          `,
              [credit.available - creditToApply, credit.id],
            );
            credit.available -= creditToApply;
            amountFromCredit += creditToApply;
            chargeRemaining -= creditToApply;
            console.log(
              `[PAYMENT_CREDIT] Applied ${creditToApply} of credit from charge ${credit.id} to charge ${charge.id}`,
            );
          }
        }

        // 3b. Apply the new cash payment to the charge remainder
        const amountFromCash = Math.min(remainingAmountToApply, chargeRemaining);
        const amountToApplyToCharge = amountFromCredit + amountFromCash;

        if (amountToApplyToCharge <= 0) continue;

        console.log(
          `[PAYMENT_CHARGES] Applying ${amountToApplyToCharge} to charge ${charge.id} (${charge.description}) - balance was ${chargeBalance} (credit: ${amountFromCredit}, cash: ${amountFromCash})`,
        );

        // Create a breakdown record for the total applied (credit + cash)
        await db.runQuery(
          `
        INSERT INTO student_payment_breakdown (student_payment_id, student_fee_charge_id, amount)
        VALUES (?, ?, ?)
      `,
          [studentPaymentId, charge.id, amountToApplyToCharge],
        );

        // Update the charge record
        const newAmountPaid = roundCents(charge.amount_paid + amountToApplyToCharge);
        // Compared in cents: charges stored before amounts were rounded can carry a float residue.
        const newStatus = newAmountPaid >= roundCents(charge.amount) ? 'PAID' : 'PARTIALLY_PAID';

        await db.runQuery(
          `
        UPDATE student_fee_charges
        SET amount_paid = ?, status = ?
        WHERE id = ?
      `,
          [newAmountPaid, newStatus, charge.id],
        );

        remainingAmountToApply -= amountFromCash;
        console.log(
          `[PAYMENT_CHARGES] Charge ${charge.id} updated. New status: ${newStatus}, remaining cash to apply: ${remainingAmountToApply}`,
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
          academic_year,
          source_payment_id
        ) VALUES (?, ?, ?, 'CREDIT', ?, ?, ?, 'PAID', ?, ?)
      `,
          [
            student_id,
            toLocalISODate(), // charge_date
            toLocalISODate(), // due_date (immediate)
            `رصيد زائد من دفعة سابقة (${remainingAmountToApply.toFixed(2)} د.ت)`,
            0, // amount (credit has no charge amount)
            remainingAmountToApply, // amount_paid (the credit amount)
            normalizedAcademicYear,
            studentPaymentId,
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
        MONTHLY: 'رسوم شهرية',
        ANNUAL: 'رسوم سنوية',
        SPECIAL: 'رسوم خاصة',
      };
      const paymentTypeAr = paymentTypeMap[payment_type] || payment_type || 'رسوم';
      const studentName = student ? student.name : 'الطالب';
      const transactionDescription = `دفعة رسوم من الطالب: ${studentName} - ${paymentTypeAr}`;
      const targetAccountId = account_id ? parseInt(account_id, 10) : 1;

      const transactionResult = await db.runQuery(
        `
      INSERT INTO transactions (type, category, amount, transaction_date, description, payment_method, check_number, voucher_number, receipt_type, account_id, related_person_name, related_entity_type, related_entity_id, created_by_user_id)
      VALUES ('INCOME', 'رسوم الطلاب', ?, ?, ?, ?, ?, ?, 'fee_payment', ?, ?, 'Student', ?, ?)
    `,
        [
          amount,
          toLocalISODate(),
          transactionDescription,
          payment_method,
          check_number,
          receipt_number,
          targetAccountId,
          studentName,
          student_id,
          getUserIdForEvent(event) || 1,
        ],
      );

      // Update the account balance for this income (keeps accounts.current_balance in sync)
      await db.runQuery('UPDATE accounts SET current_balance = current_balance + ? WHERE id = ?', [
        amount,
        targetAccountId,
      ]);

      // Link the transaction to the payment
      await db.runQuery('UPDATE student_payments SET transaction_id = ? WHERE id = ?', [
        transactionResult.id,
        studentPaymentId,
      ]);

      log(`[PAYMENT_COMMIT] Committing transaction...`);
      return studentPaymentId;
    });
    log(`[PAYMENT_SUCCESS] Payment recorded successfully with ID: ${studentPaymentId}`);

    // Notify all renderer processes about data change
    const { BrowserWindow } = require('electron');
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('financial-data-changed');
    });

    return await db.getQuery('SELECT * FROM student_payments WHERE id = ?', [studentPaymentId]);
  } catch (error) {
    process.stderr.write((error && error.stack ? error.stack : String(error)) + '\n');
    logError('Error in recordStudentPayment:', error);
    if (error.message === 'DUPLICATE_RECEIPT') {
      throw new Error('رقم الوصل الذي أدخلته موجود بالفعل. يرجى استخدام رقم وصل جديد.');
    }
    throw new Error('فشل في تسجيل الدفعة. يرجى المحاولة مرة أخرى.');
  }
}

/**
 * Reverses a student payment as if it never happened, atomically.
 * Reverses: charge amount_paid/status, breakdown rows, the overpayment credit
 * created by this payment, the linked transactions row, and the account balance.
 * @param {number} paymentId - student_payments row to remove
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function deleteStudentPayment(paymentId) {
  try {
    const result = await db.withTransaction(async () => {
      const payment = await db.getQuery('SELECT * FROM student_payments WHERE id = ?', [paymentId]);
      if (!payment) throw new Error('الدفعة غير موجودة');
      if (payment.refunded) throw new Error('لا يمكن حذف دفعة مسترجعة');

      // 1. Reverse the charges this payment paid toward
      const breakdowns = await db.allQuery(
        'SELECT student_fee_charge_id, amount FROM student_payment_breakdown WHERE student_payment_id = ?',
        [paymentId],
      );
      for (const breakdown of breakdowns) {
        await db.runQuery(
          `UPDATE student_fee_charges
           SET amount_paid = MAX(amount_paid - ?, 0),
               status = CASE
                 WHEN amount_paid - ? >= amount THEN 'PAID'
                 WHEN amount_paid - ? > 0 THEN 'PARTIALLY_PAID'
                 ELSE 'UNPAID'
               END
           WHERE id = ?`,
          [breakdown.amount, breakdown.amount, breakdown.amount, breakdown.student_fee_charge_id],
        );
      }

      // 2. Remove the breakdown rows
      await db.runQuery('DELETE FROM student_payment_breakdown WHERE student_payment_id = ?', [
        paymentId,
      ]);

      // 3. Remove the overpayment credit this payment created
      await db.runQuery('DELETE FROM student_fee_charges WHERE source_payment_id = ?', [paymentId]);

      // 4. Reverse the linked INCOME transaction and the account balance
      if (payment.transaction_id) {
        const txn = await db.getQuery(
          'SELECT amount, account_id, type FROM transactions WHERE id = ?',
          [payment.transaction_id],
        );
        if (txn && txn.type === 'INCOME') {
          await db.runQuery(
            'UPDATE accounts SET current_balance = current_balance - ? WHERE id = ?',
            [txn.amount, txn.account_id],
          );
        }
        await db.runQuery('DELETE FROM transactions WHERE id = ?', [payment.transaction_id]);
      }

      // 5. Delete the payment record
      await db.runQuery('DELETE FROM student_payments WHERE id = ?', [paymentId]);

      return { success: true, message: 'تم حذف الدفعة بنجاح' };
    });

    notifyFinancialDataChanged();
    return result;
  } catch (error) {
    logError('Error deleting student payment:', error);
    if (error.message === 'الدفعة غير موجودة' || error.message === 'لا يمكن حذف دفعة مسترجعة') {
      throw error;
    }
    throw new Error('فشل في حذف الدفعة');
  }
}

/**
 * Refunds a student payment: reverses the charges/credit/balance the same way
 * a delete would, but keeps the payment in the audit trail marked as refunded
 * and records an EXPENSE reversal transaction. Atomic.
 * @param {number} paymentId - student_payments row to refund
 * @param {number|null} userId - acting user id
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function refundStudentPayment(paymentId, userId = null) {
  try {
    const result = await db.withTransaction(async () => {
      const payment = await db.getQuery('SELECT * FROM student_payments WHERE id = ?', [paymentId]);
      if (!payment) throw new Error('الدفعة غير موجودة');
      if (payment.refunded) throw new Error('الدفعة مسترجعة بالفعل');

      // 1. Reverse the charges this payment paid toward
      const breakdowns = await db.allQuery(
        'SELECT student_fee_charge_id, amount FROM student_payment_breakdown WHERE student_payment_id = ?',
        [paymentId],
      );
      for (const breakdown of breakdowns) {
        await db.runQuery(
          `UPDATE student_fee_charges
           SET amount_paid = MAX(amount_paid - ?, 0),
               status = CASE
                 WHEN amount_paid - ? >= amount THEN 'PAID'
                 WHEN amount_paid - ? > 0 THEN 'PARTIALLY_PAID'
                 ELSE 'UNPAID'
               END
           WHERE id = ?`,
          [breakdown.amount, breakdown.amount, breakdown.amount, breakdown.student_fee_charge_id],
        );
      }

      // 2. Remove the breakdown rows
      await db.runQuery('DELETE FROM student_payment_breakdown WHERE student_payment_id = ?', [
        paymentId,
      ]);

      // 3. Remove the overpayment credit this payment created
      await db.runQuery('DELETE FROM student_fee_charges WHERE source_payment_id = ?', [paymentId]);

      // 4. Reverse the account balance and record an EXPENSE reversal transaction
      if (payment.transaction_id) {
        const txn = await db.getQuery(
          'SELECT amount, account_id, type FROM transactions WHERE id = ?',
          [payment.transaction_id],
        );
        if (txn && txn.type === 'INCOME') {
          await db.runQuery(
            'UPDATE accounts SET current_balance = current_balance - ? WHERE id = ?',
            [txn.amount, txn.account_id],
          );
          await db.runQuery(
            `INSERT INTO transactions
             (type, category, amount, transaction_date, description, payment_method, receipt_type, account_id, related_entity_type, related_entity_id, created_by_user_id)
             VALUES ('EXPENSE', 'استرجاع رسوم', ?, ?, ?, ?, 'fee_payment', ?, 'Student', ?, ?)`,
            [
              txn.amount,
              toLocalISODate(),
              `استرجاع دفعة #${paymentId}`,
              payment.payment_method,
              txn.account_id,
              payment.student_id,
              userId,
            ],
          );
        }
      }

      // 5. Keep the payment row but mark it refunded
      await db.runQuery('UPDATE student_payments SET refunded = 1 WHERE id = ?', [paymentId]);

      return { success: true, message: 'تم استرجاع الدفعة بنجاح' };
    });

    notifyFinancialDataChanged();
    return result;
  } catch (error) {
    logError('Error refunding student payment:', error);
    if (error.message === 'الدفعة غير موجودة' || error.message === 'الدفعة مسترجعة بالفعل') {
      throw error;
    }
    throw new Error('فشل في استرجاع الدفعة');
  }
}

/**
 * Notifies all renderer windows that financial data changed.
 */
function notifyFinancialDataChanged() {
  try {
    const { BrowserWindow } = require('electron');
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('financial-data-changed');
    });
  } catch (error) {
    logError('Failed to notify windows of financial data change:', error);
  }
}

// ============================================
// IPC HANDLERS
// ============================================

function registerStudentFeeHandlers() {
  ipcMain.handle(
    'student-fees:getAcademicYear',
    requireRoles(['Superadmin', 'Administrator', 'FinanceManager'])(async () => {
      try {
        return await getAcademicYearInfo();
      } catch (error) {
        logError('Error getting the academic year:', error);
        throw new Error('Failed to get the academic year.');
      }
    }),
  );

  ipcMain.handle(
    'student-fees:getPaymentHistory',
    requireRoles(['Superadmin', 'Administrator', 'FinanceManager'])(
      async (event, { studentId, academicYear }) => {
        try {
          const normalizedYear = normalizeAcademicYear(academicYear);
          if (!normalizedYear) {
            return await db.allQuery(
              'SELECT * FROM student_payments WHERE student_id = ? ORDER BY created_at DESC',
              [studentId],
            );
          }
          return await db.allQuery(
            'SELECT * FROM student_payments WHERE student_id = ? AND academic_year = ? ORDER BY created_at DESC',
            [studentId, normalizedYear],
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
    requireRoles(['Superadmin', 'Administrator', 'FinanceManager'])(
      async (event, studentId, academicYear) => {
        try {
          return await getStudentFeeStatus(studentId, academicYear);
        } catch (error) {
          logError('Error getting student fee status:', error);
          throw new Error('Failed to get student fee status.');
        }
      },
    ),
  );

  ipcMain.handle(
    'student-fees:getBalanceSummary',
    requireRoles(['Superadmin', 'Administrator', 'FinanceManager'])(
      async (event, studentId, academicYear) => {
        try {
          return await getStudentBalanceSummary(studentId, academicYear);
        } catch (error) {
          logError('Error getting student balance summary:', error);
          throw new Error('Failed to get student balance summary.');
        }
      },
    ),
  );

  ipcMain.handle(
    'student-fees:getFeeGroup',
    requireRoles(['Superadmin', 'Administrator', 'FinanceManager'])(async (event, studentId) => {
      try {
        const resolved = await resolveStudentFeeGroup(studentId);
        const student = await db.getQuery('SELECT fee_age_group_id FROM students WHERE id = ?', [
          studentId,
        ]);
        return { ...resolved, chosenGroupId: student?.fee_age_group_id ?? null };
      } catch (error) {
        logError('Error getting student fee group:', error);
        throw new Error('Failed to get student fee group.');
      }
    }),
  );

  ipcMain.handle(
    'student-fees:setFeeGroup',
    requireRoles(['Superadmin', 'Administrator', 'FinanceManager'])(
      async (event, { studentId, ageGroupId }) => {
        try {
          return await setStudentFeeGroup(studentId, ageGroupId ?? null);
        } catch (error) {
          logError('Error setting student fee group:', error);
          throw new Error(error.message || 'Failed to set student fee group.');
        }
      },
    ),
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
    'student-fees:deletePayment',
    requireRoles(['Superadmin', 'Administrator', 'FinanceManager'])(
      async (event, { paymentId }) => {
        return await deleteStudentPayment(paymentId);
      },
    ),
  );

  ipcMain.handle(
    'student-fees:refundPayment',
    requireRoles(['Superadmin', 'Administrator', 'FinanceManager'])(
      async (event, { paymentId }) => {
        return await refundStudentPayment(paymentId, getUserIdForEvent(event));
      },
    ),
  );

  ipcMain.handle(
    'student-fees:getAll',
    requireRoles(['Superadmin', 'Administrator', 'FinanceManager'])(
      async (_event, academicYear) => {
        try {
          const students = await db.allQuery(
            'SELECT id, name, matricule, fee_category, sponsor_name, sponsor_phone FROM students WHERE status = ? ORDER BY name',
            ['active'],
          );

          // Unpaid balances of earlier academic years, kept apart from this year's totals.
          const normalizedYear = normalizeAcademicYear(academicYear);
          const previousBalances = new Map();
          if (normalizedYear) {
            const rows = await db.allQuery(
              // Credit is left out: it counts toward the current year (see getStudentFeeStatus).
              `SELECT student_id, academic_year, SUM(amount - amount_paid) AS balance
               FROM student_fee_charges
               WHERE academic_year < ? AND fee_type != 'CREDIT'
               GROUP BY student_id, academic_year`,
              [normalizedYear],
            );
            for (const row of rows) {
              const balance = Math.round((row.balance || 0) * 100) / 100;
              if (balance > 0) {
                previousBalances.set(
                  row.student_id,
                  Math.round(((previousBalances.get(row.student_id) || 0) + balance) * 100) / 100,
                );
              }
            }
          }

          const branchFees = await getBranchFees();

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

              const feeStatus = await getStudentFeeStatus(student.id, academicYear);
              // Classes in age groups with different fees and no group chosen yet.
              const { needsChoice } = await resolveStudentFeeGroup(student.id, branchFees);
              return {
                id: student.id,
                name: student.name,
                matricule: student.matricule,
                fee_category: student.fee_category,
                sponsor_name: student.sponsor_name,
                sponsor_phone: student.sponsor_phone,
                totalDue: feeStatus.totalDue,
                totalPaid: feeStatus.totalPaid,
                balance: feeStatus.balance,
                previousYearsBalance: previousBalances.get(student.id) || 0,
                needsFeeGroupChoice: needsChoice,
              };
            }),
          );

          return studentsWithFees;
        } catch (error) {
          logError('Error getting all students with fee status:', error);
          throw new Error('Failed to get students with fee status.');
        }
      },
    ),
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
        const result = await generateMonthlyFeeCharges(academicYear, month, { force: true });
        const monthNames = [
          'يناير',
          'فبراير',
          'مارس',
          'أبريل',
          'مايو',
          'يونيو',
          'يوليو',
          'أغسطس',
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
        try {
          log('[generateAllCharges] Starting charge generation for academic year:', academicYear);
          return await db.withTransaction(async () => {
            // Generate annual charges for the year (without nested transaction)
            log('[generateAllCharges] Generating annual charges...');
            await generateAnnualFeeCharges(academicYear, false);
            log('[generateAllCharges] Annual charges generated successfully');

            // Generate monthly charges for ONLY current month (not 3 months)
            const currentMonth = new Date().getMonth() + 1;
            log(`[generateAllCharges] Generating charges for current month: ${currentMonth}`);
            await generateMonthlyFeeCharges(academicYear, currentMonth, {
              force,
              useTransaction: false,
            });

            log('[generateAllCharges] All charges generated successfully');
            return { success: true, message: 'تم إنشاء جميع الرسوم بنجاح' };
          });
        } catch (error) {
          logError('[generateAllCharges] Error details:', error);
          logError('Error generating all charges:', error);
          throw error; // Throw original error to see the actual message
        }
      },
    ),
  );

  // Charge refresh handlers
  ipcMain.handle(
    'student-fees:refreshStudentCharges',
    requireRoles(['Superadmin', 'Administrator', 'FinanceManager'])(
      async (event, { studentId, academicYear }) => {
        try {
          const result = await refreshStudentCharges(
            studentId,
            academicYear,
            getUserIdForEvent(event),
          );
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
          const result = await refreshAllStudentCharges(academicYear, getUserIdForEvent(event));
          return result;
        } catch (error) {
          logError('Error refreshing all student charges:', error);
          throw new Error('فشل في تحديث رسوم جميع الطلاب');
        }
      },
    ),
  );

  ipcMain.handle(
    'student-fees:resetCharges',
    requireRoles(['Superadmin', 'Administrator', 'FinanceManager'])(async (event, academicYear) => {
      try {
        const result = await resetStudentFeeCharges(academicYear);
        notifyFinancialDataChanged();
        return result;
      } catch (error) {
        logError('Error resetting student fee charges:', error);
        throw new Error('فشل في إعادة ضبط الرسوم');
      }
    }),
  );

  // Receipt management handlers
  ipcMain.handle(
    'receipts:generate',
    requireRoles(['Superadmin', 'Administrator', 'FinanceManager'])(async (event, options = {}) => {
      try {
        const receiptType = options.receiptType || 'fee_payment';
        const result = await generateReceiptNumber(receiptType, getUserIdForEvent(event));
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
    // Fees may be set for the branch or for individual age groups.
    const configured = await getConfiguredFeeKinds({
      annual: parseFloat(settings.annual_fee || '0') || 0,
      monthly: parseFloat(settings.standard_monthly_fee || '0') || 0,
    });

    log(
      `[checkAndGenerateChargesForAllStudents] Annual fee configured: ${configured.annual}, Monthly fee configured: ${configured.monthly}`,
    );

    if (!configured.annual && !configured.monthly) {
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

    const result = await db.withTransaction(async () => {
      let chargesGenerated = false;

      // Generate annual charges if configured
      if (configured.annual) {
        log(
          `[checkAndGenerateChargesForAllStudents] Generating annual charges for ${students.length} students...`,
        );
        try {
          await generateAnnualFeeCharges(academicYear, false);
          log(`[checkAndGenerateChargesForAllStudents] Annual charges generated successfully`);
          chargesGenerated = true;
        } catch (error) {
          logError(
            `[checkAndGenerateChargesForAllStudents] Error generating annual charges:`,
            error,
          );
          // Continue to monthly charges even if annual fails
        }
      } else {
        log(`[checkAndGenerateChargesForAllStudents] Skipping annual charges (fee is 0)`);
      }

      // Generate monthly charges if configured
      // Generate for current month only during initial setup (not future months)
      if (configured.monthly) {
        const currentMonth = new Date().getMonth() + 1;
        const currentAcademicYear = academicYear;

        log(
          `[checkAndGenerateChargesForAllStudents] Generating monthly charges for current month: ${currentMonth}, year: ${currentAcademicYear}`,
        );
        log(`[checkAndGenerateChargesForAllStudents] Students count: ${students.length}`);

        try {
          log(
            `[checkAndGenerateChargesForAllStudents] Calling generateMonthlyFeeCharges(${currentAcademicYear}, ${currentMonth}, { force: false })`,
          );
          const result = await generateMonthlyFeeCharges(currentAcademicYear, currentMonth, {
            useTransaction: false,
          });
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

      log(
        `[checkAndGenerateChargesForAllStudents] Transaction committed. Charges generated: ${chargesGenerated}`,
      );

      return { success: true, studentsProcessed: students.length };
    });
    return result;
  } catch (error) {
    logError('Error in checkAndGenerateChargesForAllStudents:', error);
    logError('[checkAndGenerateChargesForAllStudents] Full error:', error);
    return { success: false, message: error.message };
  }
}

/**
 * Safely resets unpaid & duplicate student fee charges for a given academic year (or ALL),
 * keeping any charges with paid balances intact to preserve payment history.
 * Then re-generates clean charges for all active students.
 * @param {string} academicYear - Target academic year (e.g., "2024-2025" or "ALL")
 * @returns {Promise<{success: boolean, deletedCount: number, message: string}>}
 */
async function resetStudentFeeCharges(academicYear = 'ALL') {
  return db.withTransaction(async () => {
    let sql =
      "DELETE FROM student_fee_charges WHERE (amount_paid IS NULL OR amount_paid = 0) AND status = 'UNPAID'";
    const params = [];

    if (academicYear && academicYear !== 'ALL') {
      const normalizedYear = normalizeAcademicYear(academicYear);
      sql += ' AND academic_year = ?';
      params.push(normalizedYear);
    }

    const deleteResult = await db.runQuery(sql, params);
    const deletedCount = deleteResult.changes || 0;
    log(`[ResetFees] Deleted ${deletedCount} unpaid/duplicate fee charges for ${academicYear}`);

    // Regenerate fresh clean charges
    const yearToGenerate =
      academicYear && academicYear !== 'ALL'
        ? normalizeAcademicYear(academicYear)
        : await getConfiguredAcademicYear();

    await generateAnnualFeeCharges(yearToGenerate);
    const currentMonth = new Date().getMonth() + 1;
    await generateMonthlyFeeCharges(yearToGenerate, currentMonth, { force: false });

    return {
      success: true,
      deletedCount,
      message: `تم إعادة ضبط الرسوم بنجاح (تم حذف ${deletedCount} رسم مكرر/غير مدفوع وإعادة توليد الرسوم النظيفة).`,
    };
  });
}

module.exports = {
  getAcademicYearInfo,
  registerStudentFeeHandlers,
  generateAnnualFeeCharges,
  generateMonthlyFeeCharges,
  refreshStudentCharges,
  refreshAllStudentCharges,
  resetStudentFeeCharges,
  refreshStudentsNeedingChargeRefresh,
  getStudentFeeStatus,
  getStudentBalanceSummary,
  getStudentPreviousYearsArrears,
  resolveStudentFeeGroup,
  setStudentFeeGroup,
  recordStudentPayment,
  deleteStudentPayment,
  refundStudentPayment,
  checkAndGenerateChargesForAllStudents,
  getCurrentAcademicYear,
  normalizeAcademicYear,
  calculateStudentMonthlyCharges,
  triggerChargeRegenerationForStudent,
};
