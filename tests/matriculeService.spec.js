/* eslint-disable jest/no-focused-tests */
/* eslint-disable no-undef */
// tests/matriculeService.spec.js

// Mock the database dependency
jest.mock('../src/db/db', () => ({
  getQuery: jest.fn(),
}));

// Mock the logger to prevent console errors during tests
jest.mock('../src/main/logger', () => ({
  error: jest.fn(),
}));

const { getQuery } = require('../src/db/db');
const { generateMatricule } = require('../src/main/services/matriculeService');
const { error: logError } = require('../src/main/logger');

describe('matriculeService › generateMatricule', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  // Test case for students
  it('should generate the first student matricule as S-0001', async () => {
    getQuery.mockResolvedValue({ max_id: 0 });
    const matricule = await generateMatricule('student');
    expect(matricule).toBe('S-0001');
    expect(getQuery).toHaveBeenCalledWith(
      'SELECT COALESCE(MAX(CAST(SUBSTR(matricule, 3) AS INTEGER)), 0) as max_id FROM students WHERE matricule LIKE ?',
      ['S-%'],
    );
  });

  // Test case for teachers
  it('should generate the first teacher matricule as T-0001', async () => {
    getQuery.mockResolvedValue({ max_id: 0 });
    const matricule = await generateMatricule('teacher');
    expect(matricule).toBe('T-0001');
    expect(getQuery).toHaveBeenCalledWith(
      'SELECT COALESCE(MAX(CAST(SUBSTR(matricule, 3) AS INTEGER)), 0) as max_id FROM teachers WHERE matricule LIKE ?',
      ['T-%'],
    );
  });

  // Test case for users
  it('should generate the first user matricule as U-0001', async () => {
    getQuery.mockResolvedValue({ max_id: 0 });
    const matricule = await generateMatricule('user');
    expect(matricule).toBe('U-0001');
    expect(getQuery).toHaveBeenCalledWith(
      'SELECT COALESCE(MAX(CAST(SUBSTR(matricule, 3) AS INTEGER)), 0) as max_id FROM users WHERE matricule LIKE ?',
      ['U-%'],
    );
  });

  // Test case for inventory items
  it('should generate the first inventory matricule as INV-0001', async () => {
    getQuery.mockResolvedValue({ max_id: 0 });
    const matricule = await generateMatricule('inventory');
    expect(matricule).toBe('INV-0001');
    expect(getQuery).toHaveBeenCalledWith(
      'SELECT COALESCE(MAX(CAST(SUBSTR(matricule, 5) AS INTEGER)), 0) as max_id FROM inventory_items WHERE matricule LIKE ?',
      ['INV-%'],
    );
  });

  // Test incrementing an existing matricule
  it('should correctly increment an existing matricule number', async () => {
    getQuery.mockResolvedValue({ max_id: 42 });
    const matricule = await generateMatricule('student');
    expect(matricule).toBe('S-0043');
  });

  // Test padding
  it('should pad the matricule number with leading zeros to 4 digits', async () => {
    getQuery.mockResolvedValue({ max_id: 99 });
    const matricule = await generateMatricule('student');
    expect(matricule).toBe('S-0100');

    getQuery.mockResolvedValue({ max_id: 9998 });
    const nextMatricule = await generateMatricule('student');
    expect(nextMatricule).toBe('S-9999');
  });

  // Test handling of null result from database
  it('should handle a null max_id from the database and start from 1', async () => {
    getQuery.mockResolvedValue({ max_id: null });
    const matricule = await generateMatricule('student');
    expect(matricule).toBe('S-0001');
  });

  // Test consecutive calls
  it('should generate unique matricules on consecutive calls', async () => {
    // First call
    getQuery.mockResolvedValue({ max_id: 10 });
    const matricule1 = await generateMatricule('student');
    expect(matricule1).toBe('S-0011');

    // Second call
    getQuery.mockResolvedValue({ max_id: 11 });
    const matricule2 = await generateMatricule('student');
    expect(matricule2).toBe('S-0012');
    expect(matricule1).not.toBe(matricule2);
  });

  // Test invalid entity type
  it('should throw an error for an invalid entity type', async () => {
    const invalidEntityType = 'unknown';
    await expect(generateMatricule(invalidEntityType)).rejects.toThrow(
      `Invalid entity type for matricule generation: ${invalidEntityType}`,
    );
  });

  it('should throw an error for a null entity type', async () => {
    await expect(generateMatricule(null)).rejects.toThrow(
      'Invalid entity type for matricule generation: null',
    );
  });

  it('should throw an error for an undefined entity type', async () => {
    await expect(generateMatricule(undefined)).rejects.toThrow(
      'Invalid entity type for matricule generation: undefined',
    );
  });

  // Test database error handling
  it('should throw a specific error message when the database query fails', async () => {
    const dbError = new Error('Database connection lost');
    getQuery.mockRejectedValue(dbError);

    await expect(generateMatricule('student')).rejects.toThrow('فشل في إنشاء الرقم التعريفي.');

    // Ensure the original error was logged
    expect(logError).toHaveBeenCalledWith('Failed to generate matricule for student:', dbError);
  });
});
