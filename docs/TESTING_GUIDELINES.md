# Testing Guidelines for Development Team

*Quick reference guide for writing, maintaining, and executing tests in the Quran Association Manager*

## Quick Start Commands

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run specific test file
npm test -- studentHandlers.spec.js

# Run integration tests only
npm test -- integration

# Run tests in watch mode
npm run test:watch
```

## Writing New Tests

### Test File Naming Convention
- **Unit tests**: `*.spec.js`
- **Integration tests**: `*.integration.spec.js`
- **End-to-end tests**: `*.e2e.spec.js`
- **Component tests**: ComponentName.spec.js

### Test Structure Template

```javascript
describe('Feature/Module Name', () => {
  let mockData;
  
  beforeAll(() => {
    // One-time setup for the entire test suite
  });
  
  beforeEach(() => {
    // Setup before each individual test
    mockData = createMockData();
    jest.clearAllMocks();
  });
  
  afterEach(() => {
    // Cleanup after each test
  });
  
  afterAll(() => {
    // One-time cleanup
  });

  describe('specific functionality', () => {
    test('should do something specific', async () => {
      // Arrange
      const input = createTestInput();
      const expected = createExpectedOutput();
      
      // Act
      const result = await functionUnderTest(input);
      
      // Assert
      expect(result).toEqual(expected);
    });
    
    test('should handle errors gracefully', async () => {
      // Arrange
      const error = new Error('Test error');
      mockFunction.mockRejectedValue(error);
      
      // Act & Assert
      await expect(asyncFunction()).rejects.toThrow('Test error');
    });
  });
});
```

## Critical Testing Patterns

### 1. IPC Handler Testing
```javascript
// ✅ CORRECT: IPC Handler Testing Pattern
const { ipcMain } = require('electron');
const { registerStudentHandlers } = require('../src/main/handlers/studentHandlers');

describe('Student Handlers', () => {
  let mockHandlers = {};

  beforeAll(() => {
    // Capture IPC handlers
    ipcMain.handle.mockImplementation((channel, handler) => {
      mockHandlers[channel] = handler;
    });
    registerStudentHandlers();
  });

  test('should handle students:get', async () => {
    // Arrange
    db.allQuery.mockResolvedValue([{ id: 1, name: 'Ahmed' }]);
    
    // Act
    const result = await mockHandlers['students:get'](null, { search: 'Ahmed' });
    
    // Assert
    expect(db.allQuery).toHaveBeenCalledWith(
      expect.stringContaining('WHERE'),
      expect.arrayContaining(['%Ahmed%'])
    );
    expect(result).toEqual([{ id: 1, name: 'Ahmed' }]);
  });
});
```

### 2. Database Transaction Testing
```javascript
// ✅ CORRECT: Transaction Integrity Testing
test('should ensure transaction integrity', async () => {
  // Act
  await performDatabaseOperation();
  
  // Assert - Verify transaction boundaries
  expect(db.runQuery).toHaveBeenCalledWith('BEGIN TRANSACTION');
  expect(db.runQuery).toHaveBeenCalledWith('COMMIT');
  // Or verify rollback on error:
  // expect(db.runQuery).toHaveBeenCalledWith('ROLLBACK');
});

// ✅ CRITICAL: Use correct SQL statement format (no semicolons)
test('should use correct SQL format', async () => {
  expect(db.runQuery).toHaveBeenCalledWith('BEGIN TRANSACTION');
  expect(db.runQuery).toHaveBeenCalledWith('COMMIT');
  // NOT: 'BEGIN TRANSACTION;' or 'COMMIT;'
});
```

### 3. Mock Data Patterns
```javascript
// ✅ CORRECT: Realistic Mock Data
const mockStudent = {
  id: 1,
  name: 'أحمد محمد',
  matricule: 'S-2024-001',
  fee_category: 'CAN_PAY',
  discount_percentage: 0,
  status: 'active',
};

const mockClass = {
  id: 1,
  name: 'حفظ القرآن - المستوى الأول',
  fee_type: 'standard',
  monthly_fee: 50,
  status: 'active',
  age_group_id: 1,
};
```

### 4. Error Handling Testing
```javascript
// ✅ CORRECT: Match actual error messages from implementation
test('should handle payment failures', async () => {
  await expect(ipcMain.invoke('student-fees:recordPayment', paymentData))
    .rejects.toThrow('Failed to record student payment');
  // NOT expecting the underlying database error message
});

// ✅ CRITICAL: Verify transaction rollback on error
test('should rollback on database error', async () => {
  db.runQuery.mockRejectedValue(new Error('Database error'));
  
  await expect(operationUnderTest()).rejects.toThrow();
  
  expect(db.runQuery).toHaveBeenCalledWith('BEGIN TRANSACTION');
  expect(db.runQuery).toHaveBeenCalledWith('ROLLBACK');
});
```

### 5. Integration Workflow Testing
```javascript
// ✅ COMPLETE WORKFLOW TESTING
describe('Complete Student Financial Workflow', () => {
  test('should complete full workflow: enrollment → payment → receipt', async () => {
    // Step 1: Create student
    const student = await ipcMain.invoke('students:add', {
      name: 'أحمد محمد',
      matricule: 'S-2024-001',
      fee_category: 'CAN_PAY'
    });
    expect(student).toBeDefined();

    // Step 2: Enroll in class
    const enrollment = await ipcMain.invoke('classes:updateEnrollments', {
      classId: 1,
      studentIds: [student.id]
    });
    expect(enrollment.success).toBe(true);

    // Step 3: Process payment
    const payment = await ipcMain.invoke('student-fees:recordPayment', {
      student_id: student.id,
      amount: 50,
      payment_method: 'CASH',
      academic_year: '2024-2025',
      receipt_number: 'RCP-2024-001'
    });
    expect(payment).toBeDefined();

    // Verify all operations completed successfully
    expect(db.runQuery).toHaveBeenCalledTimes(5); // INSERT student, INSERT enrollment, INSERT payment, etc.
  });
});
```

## Mocking Best Practices

### Database Mocking
```javascript
// ✅ CORRECT: Complete Database Mocking
jest.mock('../src/db/db', () => ({
  runQuery: jest.fn(),
  getQuery: jest.fn(),
  allQuery: jest.fn(),
  initializeDatabase: jest.fn(),
  closeDatabase: jest.fn(),
}));

describe('Database Operations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should perform CRUD operations', async () => {
    // Setup mock responses
    db.runQuery.mockResolvedValue({ changes: 1, lastID: 1 });
    db.getQuery.mockResolvedValue({ id: 1, name: 'Test' });
    db.allQuery.mockResolvedValue([{ id: 1 }, { id: 2 }]);
    
    // Perform operations
    const insertResult = await db.runQuery('INSERT INTO ...');
    const selectResult = await db.getQuery('SELECT * FROM ...');
    const listResult = await db.allQuery('SELECT * FROM ...');
    
    // Verify
    expect(insertResult.lastID).toBe(1);
    expect(selectResult.name).toBe('Test');
    expect(listResult).toHaveLength(2);
  });
});
```

### Electron API Mocking
```javascript
// ✅ CORRECT: Electron API Mocking
jest.mock('electron', () => ({
  ipcMain: {
    handle: jest.fn(),
    on: jest.fn(),
  },
  contextBridge: {
    exposeInMainWorld: jest.fn(),
  },
  app: {
    getPath: jest.fn(() => '/mock/path'),
    isPackaged: false,
    quit: jest.fn(),
  },
}));
```

## Validation Testing

### Joi Schema Testing
```javascript
// ✅ CORRECT: Joi Validation Testing
test('should validate student data correctly', () => {
  const schema = Joi.object({
    name: Joi.string().min(3).required(),
    matricule: Joi.string().pattern(/^S-\d{4}$/),
  });

  // Valid data
  const validData = { name: 'أحمد محمد', matricule: 'S-2024-001' };
  const { error } = schema.validate(validData);
  expect(error).toBeUndefined();

  // Invalid data
  const invalidData = { name: 'Ah', matricule: 'INVALID' };
  const { error: validationError } = schema.validate(invalidData);
  expect(validationError).toBeDefined();
  expect(validationError.details[0].message).toContain('must be at least 3 characters long');
});
```

## Performance Testing

### Bulk Operations Testing
```javascript
// ✅ CORRECT: Performance Testing
test('should handle bulk operations efficiently', async () => {
  const students = Array.from({ length: 100 }, (_, i) => ({
    id: i + 1,
    name: `Student ${i + 1}`,
    fee_category: 'CAN_PAY'
  }));
  
  db.allQuery.mockResolvedValue(students);
  
  const startTime = Date.now();
  const result = await ipcMain.invoke('student-fees:generateAllCharges', '2024-2025');
  const endTime = Date.now();
  
  expect(result.success).toBe(true);
  expect(endTime - startTime).toBeLessThan(5000); // Should complete in under 5 seconds
});
```

## Common Pitfalls to Avoid

### ❌ DON'T: Test Implementation Details
```javascript
// ❌ WRONG: Testing implementation details
test('should call database with specific query', () => {
  const result = await functionUnderTest();
  
  expect(db.runQuery).toHaveBeenCalledWith(
    'INSERT INTO students (name, email) VALUES (?, ?)',
    ['Ahmed', 'ahmed@test.com']
  );
});

// ✅ CORRECT: Test behavior, not implementation
test('should create a student successfully', async () => {
  const result = await createStudent({
    name: 'Ahmed',
    email: 'ahmed@test.com'
  });
  
  expect(result.success).toBe(true);
  expect(result.student.id).toBeDefined();
});
```

### ❌ DON'T: Hard-coded Assertions
```javascript
// ❌ WRONG: Hard-coded values
test('should return specific data', () => {
  const result = getStudent(1);
  expect(result.name).toBe('Ahmed Ali');
});

// ✅ CORRECT: Flexible assertions
test('should return student data', () => {
  const result = getStudent(1);
  expect(result).toMatchObject({
    id: 1,
    name: expect.any(String),
    matricule: expect.stringMatching(/^S-\d{4}$/)
  });
});
```

### ❌ DON'T: Skip Error Testing
```javascript
// ❌ WRONG: Only testing success cases
test('should create student', async () => {
  const result = await createStudent(validData);
  expect(result.success).toBe(true);
});

// ✅ CORRECT: Test both success and error cases
test('should create student successfully', async () => {
  const result = await createStudent(validData);
  expect(result.success).toBe(true);
});

test('should fail with invalid data', async () => {
  await expect(createStudent(invalidData)).rejects.toThrow('Validation error');
});
```

## Test Maintenance Guidelines

### 1. Regular Test Updates
- **When**: Update tests when business logic changes
- **What**: Verify test expectations match new behavior
- **Why**: Prevent false test failures

### 2. Mock Data Management
- **Keep realistic**: Use realistic mock data
- **Maintain consistency**: Keep mock data patterns consistent
- **Update regularly**: Update mock data when schemas change

### 3. Performance Monitoring
- **Monitor execution time**: Watch for slow-running tests
- **Check memory usage**: Ensure tests don't leak memory
- **Optimize bulk operations**: Test with realistic data volumes

### 4. Test Coverage Goals
- **Target**: Maintain 80%+ test coverage
- **Critical modules**: 90%+ for financial operations
- **New features**: Start with tests first (TDD)

## Quick Reference: Test Commands

| Command | Purpose |
|---------|---------|
| `npm test` | Run all tests |
| `npm run test:coverage` | Run tests with coverage report |
| `npm run test:watch` | Run tests in watch mode |
| `npm test -- --testNamePattern="pattern"` | Run tests matching pattern |
| `npm test -- file.spec.js` | Run specific test file |
| `npm test -- --bail` | Stop on first test failure |

## Getting Help

1. **Check existing tests**: Look at similar test patterns
2. **Review TESTING.md**: Comprehensive documentation
3. **Check TEST_COVERAGE_REPORT.md**: Coverage insights and metrics
4. **Ask team members**: Share testing patterns and best practices

---

*This guide is maintained alongside the codebase and testing infrastructure.*  
*Last updated: January 21, 2025*  
*Current test coverage: 90% (514/572 tests passing)*
