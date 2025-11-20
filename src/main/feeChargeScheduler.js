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
const {
  generateAnnualFeeCharges,
  generateMonthlyFeeCharges,
  getCurrentAcademicYear,
} = require('./handlers/studentFeeHandlers');
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
      ['ANNUAL', academicYear],
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
        ['MONTHLY', academicYear, `${academicYear}-${month.toString().padStart(2, '0')}-01`],
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
 * Checks and generates charges on app startup (handles offline app scenario).
 * @param {Object} settings - Application settings
 */
const onAppStartup = async (settings) => {
  try {
    log('[Startup] Checking for missing charges...');

    const startMonth = parseInt(settings.academic_year_start_month || 9);
    const genDay = parseInt(settings.charge_generation_day || 25);
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const currentDay = currentDate.getDate();
    const academicYear = getCurrentAcademicYear(startMonth);

    log(`[Startup] Academic year: ${academicYear}, Current month: ${currentMonth}`);

    // Check and generate annual charges if needed
    await generatePendingAnnualCharges(academicYear);
    log(`[Startup] Annual charges checked for ${academicYear}`);

    // Always ensure current month exists
    await generateMonthlyChargesIfNeeded(academicYear, currentMonth);
    log(`[Startup] Current month (${currentMonth}) charges checked`);

    // If past generation day, ensure next month exists
    if (currentDay >= genDay) {
      const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
      const nextYear =
        currentMonth === 12
          ? getCurrentAcademicYear(startMonth, new Date(currentDate.getFullYear() + 1, 0, 1))
          : academicYear;

      await generateMonthlyChargesIfNeeded(nextYear, nextMonth);
      log(`[Startup] Next month (${nextMonth}) charges checked (past day ${genDay})`);
    }

    log('[Startup] Charge check completed');
  } catch (error) {
    logError('[Startup] Error checking charges:', error);
  }
};

/**
 * Main function that checks what charges need to be generated and creates them.
 * Called by the scheduler interval.
 * @param {Object} settings - Application settings
 */
const checkAndGenerateCharges = async (settings) => {
  try {
    const startMonth = parseInt(settings.academic_year_start_month || 9);
    const genDay = parseInt(settings.charge_generation_day || 25);
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1;
    const currentDay = currentDate.getDate();
    const academicYear = getCurrentAcademicYear(startMonth);

    log(`[Scheduler] Daily check - Day ${currentDay} of month ${currentMonth}`);

    // Only generate next month on/after generation day
    if (currentDay >= genDay) {
      const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
      const nextYear =
        currentMonth === 12
          ? getCurrentAcademicYear(startMonth, new Date(currentDate.getFullYear() + 1, 0, 1))
          : academicYear;

      if (await generateMonthlyChargesIfNeeded(nextYear, nextMonth)) {
        log(`[Scheduler] Generated charges for next month (${nextMonth})`);
      } else {
        log(`[Scheduler] Next month (${nextMonth}) charges already exist`);
      }
    } else {
      log(`[Scheduler] Not yet day ${genDay} - skipping next month generation`);
    }
  } catch (error) {
    logError('[Scheduler] Error in fee charge check:', error);
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
  log('Charges will be checked daily at midnight.');

  // Check once per day (24 hours) for charges that need generation
  schedulerIntervalId = setInterval(
    async () => {
      await checkAndGenerateCharges(settings);
    },
    1000 * 60 * 60 * 24, // 24 hours
  );
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
  onAppStartup,
  checkAndGenerateCharges,
  runManualCheck,
  generatePendingAnnualCharges,
  generateMonthlyChargesIfNeeded,
};
