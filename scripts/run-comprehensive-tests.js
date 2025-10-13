#!/usr/bin/env node

/**
 * Comprehensive Test Runner
 *
 * This script runs all the comprehensive tests for critical files with low coverage.
 * It provides detailed reporting and can be used in CI/CD pipelines.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const COMPREHENSIVE_TEST_FILES = [
  'exportManager.comprehensive.spec.js',
  'importManager.comprehensive.spec.js',
  'financialHandlers.comprehensive.spec.js',
  'settingsHandlers.comprehensive.spec.js',
  'validationSchemas.comprehensive.spec.js',
];

const COLORS = {
  GREEN: '\x1b[32m',
  RED: '\x1b[31m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m',
  RESET: '\x1b[0m',
  BOLD: '\x1b[1m',
};

function log(message, color = COLORS.RESET) {
  console.log(`${color}${message}${COLORS.RESET}`);
}

function logHeader(message) {
  log(`\n${COLORS.BOLD}${COLORS.BLUE}${'='.repeat(60)}${COLORS.RESET}`);
  log(`${COLORS.BOLD}${COLORS.BLUE}${message}${COLORS.RESET}`);
  log(`${COLORS.BOLD}${COLORS.BLUE}${'='.repeat(60)}${COLORS.RESET}\n`);
}

function checkTestFileExists(testFile) {
  const testPath = path.join(__dirname, '..', 'tests', testFile);
  return fs.existsSync(testPath);
}

function runSingleTest(testFile) {
  log(`\n${COLORS.YELLOW}Running: ${testFile}${COLORS.RESET}`);

  try {
    const result = execSync(`npm test -- --testPathPattern=${testFile}`, {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf8',
      stdio: 'pipe',
    });

    log(`${COLORS.GREEN}✓ ${testFile} - PASSED${COLORS.RESET}`);
    return { file: testFile, status: 'PASSED', output: result };
  } catch (error) {
    log(`${COLORS.RED}✗ ${testFile} - FAILED${COLORS.RESET}`);
    return { file: testFile, status: 'FAILED', output: error.stdout || error.message };
  }
}

function runAllTests() {
  logHeader('COMPREHENSIVE TESTS FOR CRITICAL FILES');

  log('Checking test files...');
  const missingFiles = COMPREHENSIVE_TEST_FILES.filter((file) => !checkTestFileExists(file));

  if (missingFiles.length > 0) {
    log(`${COLORS.RED}Missing test files:${COLORS.RESET}`);
    missingFiles.forEach((file) => log(`  - ${file}`, COLORS.RED));
    process.exit(1);
  }

  log(`${COLORS.GREEN}All test files found!${COLORS.RESET}`);

  const results = [];
  let passedCount = 0;
  let failedCount = 0;

  for (const testFile of COMPREHENSIVE_TEST_FILES) {
    const result = runSingleTest(testFile);
    results.push(result);

    if (result.status === 'PASSED') {
      passedCount++;
    } else {
      failedCount++;
    }
  }

  // Summary
  logHeader('TEST RESULTS SUMMARY');

  log(`Total Tests: ${COMPREHENSIVE_TEST_FILES.length}`);
  log(`Passed: ${passedCount}`, passedCount > 0 ? COLORS.GREEN : COLORS.RESET);
  log(`Failed: ${failedCount}`, failedCount > 0 ? COLORS.RED : COLORS.RESET);

  if (failedCount > 0) {
    log('\n' + COLORS.RED + 'FAILED TESTS:' + COLORS.RESET);
    results
      .filter((r) => r.status === 'FAILED')
      .forEach((r) => {
        log(`\n${COLORS.RED}${r.file}:${COLORS.RESET}`);
        log(r.output.split('\n').slice(0, 10).join('\n')); // Show first 10 lines of error
      });
  }

  // Coverage recommendation
  if (passedCount === COMPREHENSIVE_TEST_FILES.length) {
    logHeader('COVERAGE IMPROVEMENT RECOMMENDATIONS');
    log(`${COLORS.GREEN}✓ All comprehensive tests passed!${COLORS.RESET}`);
    log('\nNext steps:');
    log('1. Run full test suite: npm test');
    log('2. Generate coverage report: npm run test:coverage');
    log('3. Check coverage improvements for:');
    log('   - exportManager.js');
    log('   - importManager.js');
    log('   - financialHandlers.js');
    log('   - settingsHandlers.js');
    log('   - validationSchemas.js');
    log('\n4. Target coverage goals:');
    log('   - Function coverage: >90%');
    log('   - Line coverage: >85%');
    log('   - Branch coverage: >80%');
  }

  process.exit(failedCount > 0 ? 1 : 0);
}

function runCoverageAnalysis() {
  logHeader('RUNNING COVERAGE ANALYSIS');

  try {
    log('Generating coverage report...');
    const coverageResult = execSync('npm run test:coverage', {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf8',
      stdio: 'pipe',
    });

    log(`${COLORS.GREEN}Coverage report generated successfully!${COLORS.RESET}`);
    log('\nCoverage report available at: coverage/lcov-report/index.html');

    // Extract coverage summary if available
    const coverageLines = coverageResult.split('\n');
    const summaryStart = coverageLines.findIndex((line) => line.includes('Coverage summary'));
    if (summaryStart !== -1) {
      log('\n' + COLORS.BLUE + 'COVERAGE SUMMARY:' + COLORS.RESET);
      coverageLines.slice(summaryStart, summaryStart + 10).forEach((line) => {
        if (line.trim()) log(line);
      });
    }
  } catch (error) {
    log(`${COLORS.RED}Failed to generate coverage report:${COLORS.RESET}`);
    log(error.message);
  }
}

// Main execution
function main() {
  const args = process.argv.slice(2);

  if (args.includes('--coverage-only')) {
    runCoverageAnalysis();
  } else if (args.includes('--help') || args.includes('-h')) {
    log('Comprehensive Test Runner');
    log('\nUsage:');
    log('  node scripts/run-comprehensive-tests.js [options]');
    log('\nOptions:');
    log('  --coverage-only    Run only coverage analysis');
    log('  --help, -h         Show this help message');
    log('\nDefault: Run all comprehensive tests');
  } else {
    runAllTests();

    if (args.includes('--with-coverage')) {
      runCoverageAnalysis();
    }
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  runAllTests,
  runCoverageAnalysis,
  COMPREHENSIVE_TEST_FILES,
};
