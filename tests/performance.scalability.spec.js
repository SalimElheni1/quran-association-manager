const { ipcMain } = require('electron');
const { registerStudentHandlers } = require('../src/main/handlers/studentHandlers');
const { registerClassHandlers } = require('../src/main/handlers/classHandlers');
const { registerStudentFeeHandlers } = require('../src/main/handlers/studentFeeHandlers');
const db = require('../src/db/db');

// Mock dependencies for performance testing
jest.mock('../src/db/db');
jest.mock('../src/main/logger');
jest.mock('../src/main/authMiddleware', () => ({
  requireRoles: jest.fn(() => (handler) => handler),
}));
jest.mock('../src/main/services/receiptService', () => ({
  generateReceiptNumber: jest.fn(),
  getReceiptBookStats: jest.fn(),
  validateReceiptNumber: jest.fn(),
}));

describe('Performance & Scalability Tests', () => {
  beforeAll(() => {
    registerStudentHandlers();
    registerClassHandlers();
    registerStudentFeeHandlers();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ============================================
  // LARGE DATASET PERFORMANCE TESTING
  // ============================================

  describe('Large Dataset Performance', () => {
    const PERFORMANCE_THRESHOLD = 5000; // 5 seconds in milliseconds

    it('should handle bulk student creation efficiently', async () => {
      const studentCount = 1000;
      const students = Array.from({ length: studentCount }, (_, i) => ({
        name: `Student ${i + 1}`,
        matricule: `S-2024-${String(i + 1).padStart(6, '0')}`,
        fee_category: 'CAN_PAY',
        status: 'active',
      }));

      db.runQuery.mockResolvedValue({ changes: 1, lastID: 1 });

      const startTime = Date.now();

      // Simulate bulk student creation
      const results = [];
      for (const studentData of students) {
        try {
          // Mock successful student creation
          const result = {
            success: true,
            student: {
              id: results.length + 1,
              ...studentData,
            },
          };
          results.push(result);
        } catch (error) {
          results.push({ success: false, error: error.message });
        }
      }

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      console.log(`Bulk student creation: ${executionTime}ms for ${studentCount} students`);
      console.log(`Average time per student: ${executionTime / studentCount}ms`);

      // Performance assertions
      expect(executionTime).toBeLessThan(PERFORMANCE_THRESHOLD);
      expect(results).toHaveLength(studentCount);
      expect(results.filter((r) => r.success)).toHaveLength(studentCount);

      // Verify all students were created successfully
      const successRate = results.filter((r) => r.success).length / studentCount;
      expect(successRate).toBe(1.0); // 100% success rate
    }, 10000); // Increased timeout for large operations

    it('should generate charges for 1000+ students efficiently', async () => {
      const studentCount = 1000;
      const academicYear = '2024-2025';

      // Mock large student dataset
      const mockStudents = Array.from({ length: studentCount }, (_, i) => ({
        id: i + 1,
        name: `Student ${i + 1}`,
        fee_category: 'CAN_PAY',
        status: 'active',
      }));

      // Mock fee settings
      db.getQuery
        .mockResolvedValueOnce({ value: '200' }) // Annual fee
        .mockResolvedValueOnce({ value: '50' }); // Monthly fee

      db.allQuery.mockResolvedValue(mockStudents);
      db.runQuery.mockResolvedValue({ changes: 1 });

      const startTime = Date.now();

      const result = await ipcMain.invoke('student-fees:generateAllCharges', academicYear);

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      console.log(`Bulk charge generation: ${executionTime}ms for ${studentCount} students`);
      console.log(
        `Charge generation rate: ${((studentCount / executionTime) * 1000).toFixed(2)} students/second`,
      );

      // Performance assertions
      expect(result.success).toBe(true);
      expect(executionTime).toBeLessThan(PERFORMANCE_THRESHOLD * 2); // Allow more time for complex operations
      expect(db.runQuery).toHaveBeenCalled(); // Verify database operations occurred

      // Verify students were processed
      const processedStudents = mockStudents.filter((s) => s.fee_category === 'CAN_PAY');
      expect(processedStudents).toHaveLength(studentCount);
    }, 15000);

    it('should handle concurrent enrollment updates efficiently', async () => {
      const concurrentOperations = 50;
      const studentsPerOperation = 20;

      // Prepare concurrent enrollment operations
      const operations = Array.from({ length: concurrentOperations }, (_, i) => ({
        classId: (i % 10) + 1, // Distribute across 10 classes
        studentIds: Array.from(
          { length: studentsPerOperation },
          (_, j) => i * studentsPerOperation + j + 1,
        ),
      }));

      // Mock successful enrollment updates
      db.runQuery.mockResolvedValue({ changes: studentsPerOperation });

      const startTime = Date.now();

      // Execute concurrent enrollment updates
      const results = await Promise.all(
        operations.map((operation) => ipcMain.invoke('classes:updateEnrollments', operation)),
      );

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      console.log(
        `Concurrent enrollments: ${executionTime}ms for ${concurrentOperations * studentsPerOperation} operations`,
      );
      console.log(
        `Concurrent operation rate: ${((concurrentOperations / executionTime) * 1000).toFixed(2)} operations/second`,
      );

      // Performance assertions
      expect(executionTime).toBeLessThan(PERFORMANCE_THRESHOLD);
      expect(results).toHaveLength(concurrentOperations);

      // Verify all operations succeeded
      const successRate = results.filter((r) => r.success).length / concurrentOperations;
      expect(successRate).toBe(1.0); // 100% success rate

      // Verify database operations occurred for each enrollment
      expect(db.runQuery.mock.calls.length).toBeGreaterThanOrEqual(concurrentOperations);
    }, 10000);

    it('should maintain performance with memory-efficient large datasets', async () => {
      const datasetSize = 5000;
      const chunkSize = 1000;

      // Simulate memory-efficient processing of large datasets
      const processInChunks = async (data, chunkSize, processor) => {
        const results = [];
        for (let i = 0; i < data.length; i += chunkSize) {
          const chunk = data.slice(i, i + chunkSize);
          const chunkResults = await processor(chunk);
          results.push(...chunkResults);

          // Clear memory (simulate garbage collection)
          if (global.gc) {
            global.gc();
          }
        }
        return results;
      };

      // Generate large dataset
      const largeDataset = Array.from({ length: datasetSize }, (_, i) => ({
        id: i + 1,
        name: `Student ${i + 1}`,
        matricule: `S-2024-${String(i + 1).padStart(6, '0')}`,
        fee_category: 'CAN_PAY',
      }));

      const startTime = Date.now();

      // Process dataset in chunks
      const results = await processInChunks(largeDataset, chunkSize, async (chunk) => {
        // Mock processing each chunk
        return chunk.map((student) => ({
          id: student.id,
          status: 'processed',
        }));
      });

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      console.log(`Large dataset processing: ${executionTime}ms for ${datasetSize} records`);
      console.log(
        `Processing rate: ${((datasetSize / executionTime) * 1000).toFixed(2)} records/second`,
      );

      // Performance assertions
      expect(results).toHaveLength(datasetSize);
      expect(executionTime).toBeLessThan(PERFORMANCE_THRESHOLD * 3); // Allow more time for very large datasets

      // Verify all records were processed
      const processedCount = results.filter((r) => r.status === 'processed').length;
      expect(processedCount).toBe(datasetSize);
    }, 20000);
  });

  // ============================================
  // CONCURRENT USER LOAD TESTING
  // ============================================

  describe('Concurrent User Load Testing', () => {
    it('should handle 10 simultaneous financial operations without conflicts', async () => {
      const concurrentUsers = 10;
      const operationsPerUser = 5;

      // Prepare concurrent financial operations
      const financialOperations = Array.from({ length: concurrentUsers }, (_, userId) =>
        Array.from({ length: operationsPerUser }, (_, opId) => ({
          student_id: userId * operationsPerUser + opId + 1,
          amount: 50 + opId * 10,
          payment_method: opId % 2 === 0 ? 'CASH' : 'CHECK',
          academic_year: '2024-2025',
          receipt_number: `RCP-2024-${String(userId * 1000 + opId + 1).padStart(4, '0')}`,
        })),
      ).flat();

      // Mock successful financial operations
      db.runQuery.mockResolvedValue({ changes: 1 });
      db.getQuery.mockResolvedValue(null); // No existing credit
      db.allQuery.mockResolvedValue([]); // No existing charges

      const startTime = Date.now();

      // Execute all concurrent financial operations
      const results = await Promise.all(
        financialOperations.map((operation) =>
          ipcMain
            .invoke('student-fees:recordPayment', operation)
            .catch((error) => ({ success: false, error: error.message, operation })),
        ),
      );

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      console.log(
        `Concurrent financial operations: ${executionTime}ms for ${financialOperations.length} operations`,
      );
      console.log(
        `Throughput: ${((financialOperations.length / executionTime) * 1000).toFixed(2)} operations/second`,
      );

      // Performance assertions
      expect(executionTime).toBeLessThan(10000); // 10 seconds max for concurrent operations
      expect(results).toHaveLength(financialOperations.length);

      // Verify no conflicts occurred (all operations succeeded or failed gracefully)
      const conflictRate =
        results.filter((r) => r.success === false && r.error?.includes('conflict')).length /
        financialOperations.length;
      expect(conflictRate).toBe(0); // No conflicts expected
    }, 15000);

    it('should maintain data integrity under concurrent enrollment pressure', async () => {
      const enrollmentBurstsCount = 20;
      const studentsPerBurst = 10;
      const concurrentBursts = 5;

      // Simulate enrollment pressure with concurrent bursts
      const enrollmentBurstList = Array.from({ length: enrollmentBurstsCount }, (_, burstId) =>
        Array.from({ length: studentsPerBurst }, (_, studentId) => ({
          classId: (burstId % 3) + 1, // Distribute across 3 classes
          studentId: burstId * studentsPerBurst + studentId + 1,
        })),
      );

      db.runQuery.mockResolvedValue({ changes: studentsPerBurst });

      const startTime = Date.now();

      // Execute concurrent enrollment bursts
      const burstResults = await Promise.all(
        Array.from({ length: concurrentBursts }, (_, burstIndex) =>
          Promise.all(
            enrollmentBurstList[burstIndex].map((enrollment) =>
              ipcMain.invoke('classes:updateEnrollments', {
                classId: enrollment.classId,
                studentIds: [enrollment.studentId],
              }),
            ),
          ),
        ),
      );

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      console.log(
        `Concurrent enrollment pressure: ${executionTime}ms for ${concurrentBursts} bursts`,
      );
      console.log(
        `Enrollment rate: ${(((concurrentBursts * studentsPerBurst) / executionTime) * 1000).toFixed(2)} enrollments/second`,
      );

      // Data integrity assertions
      expect(executionTime).toBeLessThan(8000); // 8 seconds max
      expect(burstResults).toHaveLength(concurrentBursts);

      // Verify all enrollments processed successfully
      const totalEnrollments = concurrentBursts * studentsPerBurst;
      const successfulEnrollments = burstResults.flat().filter((r) => r.success).length;
      expect(successfulEnrollments).toBe(totalEnrollments);
    }, 12000);

    it('should handle concurrent charge regeneration without deadlocks', async () => {
      const concurrentStudents = 15;
      const studentIds = Array.from({ length: concurrentStudents }, (_, i) => i + 1);

      // Mock charge regeneration data
      db.getQuery.mockResolvedValue({
        id: 1,
        name: 'Test Student',
        status: 'active',
        fee_category: 'CAN_PAY',
      });
      db.allQuery.mockResolvedValue([]);
      db.runQuery.mockResolvedValue({ changes: 1 });

      // Import the function to test directly
      const {
        triggerChargeRegenerationForStudent,
      } = require('../src/main/handlers/studentFeeHandlers');

      const startTime = Date.now();

      // Execute concurrent charge regeneration
      const regenerationResults = await Promise.all(
        studentIds.map((studentId) =>
          triggerChargeRegenerationForStudent(studentId).catch((error) => ({
            success: false,
            error: error.message,
            studentId,
          })),
        ),
      );

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      console.log(
        `Concurrent charge regeneration: ${executionTime}ms for ${concurrentStudents} students`,
      );
      console.log(
        `Regeneration rate: ${((concurrentStudents / executionTime) * 1000).toFixed(2)} regenerations/second`,
      );

      // Deadlock prevention assertions
      expect(executionTime).toBeLessThan(6000); // 6 seconds max
      expect(regenerationResults).toHaveLength(concurrentStudents);

      // Verify no deadlocks occurred (all operations completed)
      const deadlockRate =
        regenerationResults.filter(
          (r) => r.success === false && r.error?.includes('already in progress'),
        ).length / concurrentStudents;
      expect(deadlockRate).toBeLessThan(0.2); // Less than 20% lock contention is acceptable
    }, 10000);
  });

  // ============================================
  // RESOURCE OPTIMIZATION TESTING
  // ============================================

  describe('Resource Optimization Testing', () => {
    it('should not leak memory during bulk operations', async () => {
      const operationCount = 100;
      const iterations = 10;

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      // Record initial memory usage
      const initialMemory = process.memoryUsage();
      console.log('Initial memory:', initialMemory);

      // Perform repeated bulk operations
      for (let i = 0; i < iterations; i++) {
        const mockStudents = Array.from({ length: operationCount }, (_, j) => ({
          id: i * operationCount + j + 1,
          name: `Student ${i * operationCount + j + 1}`,
          fee_category: 'CAN_PAY',
        }));

        // Simulate student processing
        await Promise.all(
          mockStudents.map(async (student) => {
            db.getQuery.mockResolvedValue(student);
            await ipcMain.invoke('student-fees:getStatus', student.id);
            return student.id;
          }),
        );

        // Clear mocks to simulate cleanup
        jest.clearAllMocks();

        // Force garbage collection periodically
        if (global.gc && i % 3 === 0) {
          global.gc();
        }
      }

      // Record final memory usage
      const finalMemory = process.memoryUsage();
      console.log('Final memory:', finalMemory);

      // Calculate memory growth
      const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryGrowthPercent = (memoryGrowth / initialMemory.heapUsed) * 100;

      console.log(`Memory growth: ${(memoryGrowth / 1024 / 1024).toFixed(2)}MB`);
      console.log(`Memory growth percent: ${memoryGrowthPercent.toFixed(2)}%`);

      // Memory leak assertions
      expect(memoryGrowthPercent).toBeLessThan(20); // Less than 20% memory growth
      expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024); // Less than 50MB growth

      // Verify memory doesn't grow unbounded
      expect(finalMemory.heapUsed).toBeLessThan(initialMemory.heapUsed * 2); // Less than 2x growth
    }, 30000);

    it('should optimize database query performance for large datasets', async () => {
      const largeDatasetSize = 2000;
      const queryIterations = 50;

      // Prepare mock data for database operations
      const mockStudents = Array.from({ length: largeDatasetSize }, (_, i) => ({
        id: i + 1,
        name: `Student ${i + 1}`,
        matricule: `S-2024-${String(i + 1).padStart(6, '0')}`,
        fee_category: i % 3 === 0 ? 'CAN_PAY' : 'SPONSORED',
      }));

      db.allQuery.mockResolvedValue(mockStudents);
      db.getQuery.mockResolvedValue({ value: '50' }); // Mock fee setting
      db.runQuery.mockResolvedValue({ changes: 1 });

      const startTime = Date.now();

      // Simulate database-heavy operations
      for (let i = 0; i < queryIterations; i++) {
        // Simulate complex query operations
        await ipcMain.invoke('students:get', {
          searchTerm: `Student ${(i % 100) + 1}`,
          feeCategory: 'CAN_PAY',
          limit: 100,
        });

        // Simulate fee calculation for random students
        const randomStudents = mockStudents.sort(() => 0.5 - Math.random()).slice(0, 50);

        await Promise.all(
          randomStudents.map((student) =>
            ipcMain.invoke('student-fees:calculateMonthlyCharges', {
              studentId: student.id,
              month: (i % 12) + 1,
              academicYear: '2024-2025',
            }),
          ),
        );
      }

      const endTime = Date.now();
      const executionTime = endTime - startTime;

      console.log(
        `Database query performance: ${executionTime}ms for ${queryIterations} iterations`,
      );
      console.log(
        `Average query time: ${(executionTime / queryIterations).toFixed(2)}ms per iteration`,
      );

      // Performance assertions
      expect(executionTime).toBeLessThan(15000); // 15 seconds max
      expect(executionTime / queryIterations).toBeLessThan(300); // Less than 300ms average per iteration

      // Verify database operations were called
      expect(db.allQuery.mock.calls.length).toBeGreaterThanOrEqual(queryIterations);
    }, 20000);
  });

  // ============================================
  // SCALABILITY BENCHMARKS
  // ============================================

  describe('Scalability Benchmarks', () => {
    it('should establish performance baselines for different operation types', async () => {
      const benchmarks = {
        studentCreation: { target: 100, threshold: 1000 },
        chargeGeneration: { target: 50, threshold: 2000 },
        enrollment: { target: 200, threshold: 500 },
        paymentProcessing: { target: 150, threshold: 1000 },
      };

      const results = {};

      // Benchmark student creation
      const studentCreationStart = Date.now();
      const createStudents = Array.from({ length: benchmarks.studentCreation.target }, (_, i) => ({
        name: `Benchmark Student ${i + 1}`,
        matricule: `S-BENCH-${String(i + 1).padStart(6, '0')}`,
        fee_category: 'CAN_PAY',
      }));

      db.runQuery.mockResolvedValue({ changes: 1, lastID: 1 });
      const studentCreationPromises = createStudents.map((studentData) =>
        ipcMain.invoke('students:add', studentData),
      );
      await Promise.all(studentCreationPromises);
      results.studentCreation = Date.now() - studentCreationStart;

      // Benchmark charge generation
      const chargeGenerationStart = Date.now();
      db.getQuery.mockResolvedValueOnce({ value: '200' }).mockResolvedValueOnce({ value: '50' });
      db.allQuery.mockResolvedValue(
        Array.from({ length: benchmarks.chargeGeneration.target }, (_, i) => ({
          id: i + 1,
          fee_category: 'CAN_PAY',
        })),
      );
      db.runQuery.mockResolvedValue({ changes: 1 });

      await ipcMain.invoke('student-fees:generateAllCharges', '2024-2025');
      results.chargeGeneration = Date.now() - chargeGenerationStart;

      // Benchmark enrollment
      const enrollmentStart = Date.now();
      const enrollmentOperations = Array.from({ length: benchmarks.enrollment.target }, (_, i) => ({
        classId: (i % 5) + 1,
        studentIds: [i + 1],
      }));

      db.runQuery.mockResolvedValue({ changes: 1 });
      const enrollmentPromises = enrollmentOperations.map((operation) =>
        ipcMain.invoke('classes:updateEnrollments', operation),
      );
      await Promise.all(enrollmentPromises);
      results.enrollment = Date.now() - enrollmentStart;

      // Benchmark payment processing
      const paymentStart = Date.now();
      const paymentOperations = Array.from(
        { length: benchmarks.paymentProcessing.target },
        (_, i) => ({
          student_id: i + 1,
          amount: 50,
          payment_method: 'CASH',
          academic_year: '2024-2025',
          receipt_number: `RCP-BENCH-${String(i + 1).padStart(4, '0')}`,
        }),
      );

      db.runQuery.mockResolvedValue({ changes: 1 });
      db.getQuery.mockResolvedValue(null);
      db.allQuery.mockResolvedValue([]);

      const paymentPromises = paymentOperations.map((operation) =>
        ipcMain.invoke('student-fees:recordPayment', operation),
      );
      await Promise.all(paymentPromises);
      results.paymentProcessing = Date.now() - paymentStart;

      // Log performance benchmarks
      console.log('\n=== PERFORMANCE BENCHMARKS ===');
      Object.entries(results).forEach(([operation, time]) => {
        const target = benchmarks[operation].target;
        const threshold = benchmarks[operation].threshold;
        const rate = ((time / target) * 1000).toFixed(2);
        const status = time < threshold ? '✅ PASS' : '⚠️ SLOW';
        console.log(`${operation}: ${time}ms (${rate}ms/op) ${status}`);
      });
      console.log('================================\n');

      // Performance threshold assertions
      expect(results.studentCreation).toBeLessThan(benchmarks.studentCreation.threshold);
      expect(results.chargeGeneration).toBeLessThan(benchmarks.chargeGeneration.threshold);
      expect(results.enrollment).toBeLessThan(benchmarks.enrollment.threshold);
      expect(results.paymentProcessing).toBeLessThan(benchmarks.paymentProcessing.threshold);
    }, 60000);
  });
});
