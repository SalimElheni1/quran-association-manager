const path = require('path');
const fs = require('fs');
const dbModule = require('../src/db/db');
const { closeDatabase, getQuery, allQuery } = dbModule;

// Path to the source pre-migration DB
const preMigrationDbPath = path.join(__dirname, '..', '.db', 'quran_assoc_manager_pre_migration.sqlite');
// Path to the database the application will actually use during the test
const targetDbPath = path.join(__dirname, '..', '.db', 'quran_assoc_manager.sqlite');

// Helper function to get a user's roles
async function getUserRoles(username) {
  const user = await getQuery('SELECT id FROM users WHERE username = ?', [username]);
  if (!user) return [];

  const roles = await allQuery(`
    SELECT r.name
    FROM user_roles ur
    JOIN roles r ON ur.role_id = r.id
    WHERE ur.user_id = ?
  `, [user.id]);

  return roles.map(r => r.name);
}

async function runExistingDbMigrationTest() {
  console.log('--- Running Existing Database Migration Test ---');

  // 1. Setup: Copy the pre-migration database to the location the app expects.
  if (!fs.existsSync(preMigrationDbPath)) {
    throw new Error(`Pre-migration database not found at: ${preMigrationDbPath}. Please run setup-pre-migration-db.js first.`);
  }
  // Delete any existing DB at the target path to ensure a clean test
  if (fs.existsSync(targetDbPath)) {
    fs.unlinkSync(targetDbPath);
  }
  fs.copyFileSync(preMigrationDbPath, targetDbPath);
  console.log(`Copied pre-migration DB to ${targetDbPath} for testing.`);

  try {
    // 2. Execution: Initialize the database. It will now find our test DB automatically.
    console.log('Initializing the database to trigger migration...');
    // We don't need to patch anything now; it will use the default path.
    await dbModule.initializeDatabase();
    console.log('Database initialization and migration complete.');

    // 3. Verification
    console.log('\nVerifying data state post-migration...');

    // Test Case 1: Superadmin migration
    const superadminRoles = await getUserRoles('superadmin');
    if (superadminRoles.length === 1 && superadminRoles[0] === 'Superadmin') {
      console.log('✅ PASSED: `superadmin` was correctly migrated to the Superadmin role.');
    } else {
      throw new Error(`TEST FAILED: \`superadmin\` has incorrect roles. Expected: ['Superadmin'], Found: [${superadminRoles.join(', ')}]`);
    }

    // Test Case 2: Generic admin migration
    const testadminRoles = await getUserRoles('testadmin');
    if (testadminRoles.length === 1 && testadminRoles[0] === 'Administrator') {
      console.log('✅ PASSED: `testadmin` was correctly migrated to the Administrator role.');
    } else {
      throw new Error(`TEST FAILED: \`testadmin\` has incorrect roles. Expected: ['Administrator'], Found: [${testadminRoles.join(', ')}]`);
    }

    // Test Case 3: Flawed logic verification (Expected Failure)
    const financeAdminRoles = await getUserRoles('financeadmin_user');
    if (financeAdminRoles.length === 1 && financeAdminRoles[0] === 'Administrator') {
      console.log('⚠️ CONFIRMED FLAW: `financeadmin_user` was incorrectly migrated to Administrator due to `LIKE \'%admin%\'` logic.');
    } else {
      throw new Error(`TEST FAILED: The flawed logic test for \`financeadmin_user\` did not behave as expected. Roles: [${financeAdminRoles.join(', ')}]`);
    }

    // Test Case 4: Non-admin user should not be migrated
    const supervisorRoles = await getUserRoles('supervisor_user');
    if (supervisorRoles.length === 0) {
      console.log('✅ PASSED: `supervisor_user` was correctly ignored by the migration script.');
    } else {
      throw new Error(`TEST FAILED: \`supervisor_user\` was incorrectly assigned roles: [${supervisorRoles.join(', ')}]`);
    }

    // Test Case 5: Data Integrity Check
    const originalUser = await getQuery("SELECT email FROM users WHERE username = 'financeadmin_user'");
    if(originalUser.email !== 'finance@test.com') {
        throw new Error(`TEST FAILED: Data integrity check failed for user. Email was modified.`);
    }
    console.log('✅ PASSED: User data was not corrupted during migration.');


    console.log('\n--- Existing Database Migration Test Completed Successfully ---');

  } catch (error) {
    console.error('\n--- Existing Database Migration Test FAILED ---');
    console.error(error.message);
    process.exit(1);
  } finally {
    await closeDatabase();
    // Clean up the test database file
    if (fs.existsSync(targetDbPath)) {
        fs.unlinkSync(targetDbPath);
        console.log(`\nCleaned up test database: ${targetDbPath}`);
    }
  }
}

runExistingDbMigrationTest();