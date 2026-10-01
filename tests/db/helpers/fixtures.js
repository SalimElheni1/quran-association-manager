// tests/db/helpers/fixtures.js
// Creates the records a test needs through the same IPC handlers the app uses. Each helper
// needs the matching handlers registered in useRealDb({ register: [...] }).

let counter = 0;
const unique = (prefix) => `${prefix} ${++counter}`;

/**
 * students:add (studentHandlers). Active and paying (CAN_PAY) unless overridden.
 * @returns {Promise<number>} The new student's id.
 */
async function addStudent(ctx, overrides = {}) {
  const result = await ctx.invoke('students:add', {
    name: unique('طالب'),
    gender: 'Male',
    date_of_birth: '2000-01-01',
    status: 'active',
    fee_category: 'CAN_PAY',
    ...overrides,
  });
  return result.id;
}

/**
 * teachers:add (teacherHandlers).
 * @returns {Promise<number>} The new teacher's id.
 */
async function addTeacher(ctx, overrides = {}) {
  const result = await ctx.invoke('teachers:add', {
    name: unique('معلم'),
    contact_info: '22123456',
    gender: 'Male',
    ...overrides,
  });
  return result.id;
}

/**
 * ageGroups:create (settingsHandlers).
 * @returns {Promise<number>} The new age group's id.
 */
async function addAgeGroup(ctx, overrides = {}) {
  const result = await ctx.invoke('ageGroups:create', {
    name: unique('فئة'),
    min_age: 18,
    max_age: null,
    gender: 'any',
    ...overrides,
  });
  if (!result.success) throw new Error(`ageGroups:create failed: ${result.message}`);
  return result.ageGroupId;
}

/**
 * classes:add (classHandlers). Active; needs an age group.
 * @returns {Promise<number>} The new class's id.
 */
async function addClass(ctx, overrides = {}) {
  const result = await ctx.invoke('classes:add', {
    name: unique('فصل'),
    status: 'active',
    ...overrides,
  });
  return result.id;
}

module.exports = { addStudent, addTeacher, addAgeGroup, addClass, unique };
