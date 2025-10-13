const path = require('path');
const fs = require('fs');
const { initializeTestDatabase, closeDatabase, getQuery, allQuery } = require('../src/db/db');

// Use a dedicated test database file to avoid conflicts
const testDbPath = path.join(__dirname, '..', '.db', 'fresh_install_test.sqlite');

async function runFreshInstallTest() {
  console.log('--- Running Fresh Installation Test ---');

  try {
    // Initialize a fresh test database. initializeTestDatabase cleans up old files.
    console.log('Initializing a fresh test database...');
    await initializeTestDatabase(testDbPath);
    console.log('Database initialization complete.');

    // --- Verification Checks ---
    console.log('\nVerifying database state post-initialization...');

    // 1. Check if the superadmin user was created in the 'users' table
    const superadminUser = await getQuery("SELECT * FROM users WHERE username = 'superadmin'");
    if (!superadminUser) {
      throw new Error('TEST FAILED: Superadmin user was not created in the users table.');
    }
    console.log('✅ PASSED: Superadmin user exists in the users table.');

    // 2. Check if the 'roles' table was seeded correctly
    const roles = await allQuery('SELECT * FROM roles ORDER BY name');
    const roleNames = roles.map((r) => r.name);
    // Sort both arrays to ensure the comparison is order-independent
    const expectedRoles = [
      'Administrator',
      'FinanceManager',
      'SessionSupervisor',
      'Superadmin',
    ].sort();
    if (JSON.stringify(roleNames.sort()) !== JSON.stringify(expectedRoles)) {
      throw new Error(
        `TEST FAILED: Roles table not seeded correctly. Expected: [${expectedRoles.join(', ')}], Found: [${roleNames.join(', ')}]`,
      );
    }
    console.log('✅ PASSED: Roles table is correctly populated.');

    // 3. Check if the superadmin has the correct role assignment in 'user_roles'
    const superadminRole = await getQuery(
      `
      SELECT r.name
      FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = ?
    `,
      [superadminUser.id],
    );

    if (!superadminRole || superadminRole.name !== 'Superadmin') {
      throw new Error(
        `TEST FAILED: Superadmin user does not have the 'Superadmin' role. Found role: ${superadminRole ? superadminRole.name : 'None'}`,
      );
    }
    console.log('✅ PASSED: Superadmin user is correctly assigned the Superadmin role.');

    console.log('\n--- Fresh Installation Test Successful ---');
  } catch (error) {
    console.error('\n--- Fresh Installation Test FAILED ---');
    console.error(error.message);
    process.exit(1);
  } finally {
    await closeDatabase();
    // Clean up the test database file after the test run
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
      console.log(`\nCleaned up test database: ${testDbPath}`);
    }
  }
}

runFreshInstallTest();
