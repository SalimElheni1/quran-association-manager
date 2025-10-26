/**
 * @fileoverview Automated fee charge generation scheduler for Quran Manager.
 * Handles automatic creation of student fee charges to prevent manual errors.
 *
 * This module provides background scheduling for:
 * - Annual fee charge generation at academic year start
 * - Monthly fee charge generation on schedule
 * - Duplicate prevention and transaction safety
 *
 * @author Quran Branch Manager Team
 * @version 1.0.0
 */

const db = require('../db/db');
const { generateAnnualFeeCharges, generateMonthlyFeeCharges } = require('./handlers/studentFeeHandlers');
const { log, error: logError } = require('./logger');

let schedulerIntervalId = null;

/**
 * Checks if annual charges need to be generated for the given academic year.
 * Only generates if not already created this year.
 * @param {string} academicYear - The academic year (e.g., '2024-2025')
 * @returns {Promise<boolean>} - True if charges were generated, false if not needed
 */
const generatePendingAnnualCharges = async (academicYear) => {
  try {
    // Check if we already have annual charges for this year
    const existingCharges = await db.getQuery(
      'SELECT COUNT(*) as count FROM student_fee_charges WHERE fee_type = ? AND academic_year = ?',
      ['ANNUAL', academicYear]
    );

    if (existingCharges.count > 0) {
      log(`Annual charges already exist for ${academicYear}. Skipping.`);
      return false;
    }

    log(`Generating annual charges for academic year ${academicYear}...`);
    await generateAnnualFeeCharges(academicYear);
    log(`Successfully generated annual charges for ${academicYear}`);
    return true;
  } catch (error) {
    logError('Failed to generate annual charges:', error);
    // Don't throw - let other automated processes continue
    return false;
  }
};

/**
 * Attempts to generate monthly charges for a specific month.
 * Only generates if charges don't already exist for that month.
 * @param {string} academicYear - The academic year
 * @param {number} month - The month (1-12)
 * @param {boolean} force - Force generation even if charges exist
 * @returns {Promise<boolean>} - True if charges were generated, false if not needed
 */
const generateMonthlyChargesIfNeeded = async (academicYear, month, force = false) => {
  try {
    if (!force) {
      // Check if monthly charges already exist for this month/year
      const existingCharges = await db.getQuery(
        'SELECT COUNT(*) as count FROM student_fee_charges WHERE fee_type = ? AND academic_year = ? AND created_at >= ?',
        ['MONTHLY', academicYear, `${academicYear}-${month.toString().padStart(2, '0')}-01`]
      );

      if (existingCharges.count > 0) {
        return false; // Already have charges for this month
      }
    }

    log(`Generating monthly charges for ${academicYear}, month ${month}...`);

    // Wrap in transaction for safety
    await db.runQuery('BEGIN TRANSACTION;');
    try {
      await generateMonthlyFeeCharges(academicYear, month);
      await db.runQuery('COMMIT;');
      log(`Successfully generated monthly charges for ${academicYear}, month ${month}`);
      return true;
    } catch (genError) {
      await db.runQuery('ROLLBACK;');
      throw genError;
    }
  } catch (error) {
    logError(`Failed to generate monthly charges for ${academicYear}, month ${month}:`, error);
    return false;
  }
};

/**
 * Main function that checks what charges need to be generated and creates them.
 * Called by the scheduler interval.
 * @param {boolean} force - Force regeneration of existing charges
 */
const checkAndGenerateCharges = async (force = false) => {
  try {
    log('Checking for pending fee charges...');

    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;

    // Determine academic year (assuming Sept-Aug academic year)
    const academicYear = currentMonth >= 9 ? `${currentYear}-${currentYear + 1}` : `${currentYear - 1}-${currentYear}`;

    let generatedCount = 0;

    // 1. Generate annual charges if not exists
    if (await generatePendingAnnualCharges(academicYear)) {
      generatedCount++;
    }

    // 2. Generate current month charges if not exists
    if (await generateMonthlyChargesIfNeeded(academicYear, currentMonth)) {
      generatedCount++;
    }

    // 3. Pre-generate next month charges (1 week before month end or on the 24th+)
    if (currentDate.getDate() >= 24) {
      const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
      const nextMonthYear = currentMonth === 12 ? academicYear.split('-')[1] : academicYear;

      if (await generateMonthlyChargesIfNeeded(nextMonthYear, nextMonth)) {
        generatedCount++;
      }
    }

    // 4. Pre-generate month after next (for really early preparation)
    if (currentDate.getDate() >= 28) {
      const monthAfterNext = currentMonth === 12 ? 2 : (currentMonth === 11 ? 1 : currentMonth + 2);
      const monthAfterNextYear = (currentMonth >= 11) ? academicYear.split('-')[1] :
                                  (currentMonth === 10) ? academicYear : academicYear.split('-')[0];

      if (await generateMonthlyChargesIfNeeded(monthAfterNextYear, monthAfterNext)) {
        generatedCount++;
      }
    }

    if (generatedCount > 0) {
      log(`Fee charge scheduler generated ${generatedCount} charge sets.`);
    } else {
      log('Fee charge scheduler check completed - no charges needed.');
    }

  } catch (error) {
    logError('Error in fee charge scheduler check:', error);
  }
};

/**
 * Starts the automated fee charge generation scheduler.
 * @param {Object} settings - Application settings object
 */
const startScheduler = (settings) => {
  stopScheduler(); // Stop any existing scheduler first

  if (!settings.auto_charge_generation_enabled) {
    log('Automated fee charge generation is disabled.');
    return;
  }

  log('Starting automated fee charge generation scheduler.');
  log('Charges will be checked every 6 hours for generation needs.');

  // Check every 6 hours for charges that need generation
  schedulerIntervalId = setInterval(
    async () => {
      await checkAndGenerateCharges();
    },
    1000 * 60 * 60 * 6, // 6 hours
  );

  // Also check immediately on start
  setTimeout(checkAndGenerateCharges, 5000); // 5 seconds after start
};

/**
 * Stops the automated fee charge generation scheduler.
 */
const stopScheduler = () => {
  if (schedulerIntervalId) {
    clearInterval(schedulerIntervalId);
    schedulerIntervalId = null;
    log('Automated fee charge generation scheduler stopped.');
  }
};

/**
 * Manually triggers charge generation check (for use in IPC handlers).
 * @param {Object} settings - Application settings
 * @param {boolean} force - Force regeneration of existing charges
 * @returns {Promise<{success: boolean, message: string}>}
 */
const runManualCheck = async (settings, force = false) => {
  try {
    if (!settings.auto_charge_generation_enabled && !force) {
      return { success: false, message: 'التوليد التلقائي معطل في الإعدادات.' };
    }

    await checkAndGenerateCharges(force);
    if (force) {
      return { success: true, message: 'تم تحديث جميع رسوم الطلاب بنجاح.' };
    } else {
      return { success: true, message: 'تم إكمال فحص توليد الرسوم اليدوي.' };
    }
  } catch (error) {
    logError('Error in manual charge generation check:', error);
    return { success: false, message: 'فشل في تشغيل الفحص اليدوي.' };
  }
};

module.exports = {
  startScheduler,
  stopScheduler,
  checkAndGenerateCharges,
  runManualCheck,
  generatePendingAnnualCharges,
  generateMonthlyChargesIfNeeded,
};
