/**
 * @fileoverview Import step definitions for sequential Excel import
 * Defines which sheets belong to each import step to resolve dependencies
 */

const IMPORT_STEPS = {
  STEP_1: {
    id: 'step1',
    name: 'البيانات الأساسية',
    description: 'استيراد المستخدمين والمعلمين والطلاب والمجموعات والمخزون',
    sheets: ['المستخدمون', 'المعلمون', 'الطلاب', 'المجموعات', 'المخزون'],
    order: 1,
    icon: 'users'
  },
  STEP_2: {
    id: 'step2', 
    name: 'البيانات المالية',
    description: 'استيراد التبرعات والمصاريف',
    sheets: ['التبرعات', 'المصاريف'],
    order: 2,
    dependencies: ['step1'],
    icon: 'coins'
  }
};

/**
 * Get all sheets for a specific step
 * @param {string} stepId - Step identifier (step1, step2)
 * @returns {string[]} Array of sheet names for the step
 */
function getSheetsForStep(stepId) {
  const step = Object.values(IMPORT_STEPS).find(s => s.id === stepId);
  return step ? step.sheets : [];
}

/**
 * Get step information by step ID
 * @param {string} stepId - Step identifier
 * @returns {Object|null} Step configuration object
 */
function getStepInfo(stepId) {
  return Object.values(IMPORT_STEPS).find(s => s.id === stepId) || null;
}

/**
 * Get all available steps in order
 * @returns {Object[]} Array of step objects ordered by sequence
 */
function getAllSteps() {
  return Object.values(IMPORT_STEPS).sort((a, b) => a.order - b.order);
}

/**
 * Check if a sheet belongs to a specific step
 * @param {string} sheetName - Name of the sheet
 * @param {string} stepId - Step identifier
 * @returns {boolean} True if sheet belongs to step
 */
function isSheetInStep(sheetName, stepId) {
  const sheets = getSheetsForStep(stepId);
  return sheets.includes(sheetName);
}

module.exports = {
  IMPORT_STEPS,
  getSheetsForStep,
  getStepInfo,
  getAllSteps,
  isSheetInStep
};