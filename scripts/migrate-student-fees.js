/**
 * @fileoverview Data migration script for the new student fee system.
 * Migrates existing payment data from the legacy 'payments' table to the new ledger-based system.
 *
 * Migration Strategy:
 * - Copy legacy payments to student_payments table
 * - Create special "migration_source" charges in student_fee_charges table
 * - Link payments to charges via student_payment_breakdown table
 * - Maintains full payment history while integrating with new system
 *
 * @author Quran Branch Manager Team
 * @version 1.0.1
 */

const db = require('../src/db/db');
const { error: logError } = require('../src/main/logger');

async function migrateStudentFees() {
  console.log('🟡 Starting student fee migration...');

  try {
    await db.initializeDatabase();

    // Check if migration has already been run
    const migrationCheck = await db.getQuery("SELECT id FROM migrations WHERE name = 'student-fee-migration-completed' LIMIT 1");
    if (migrationCheck) {
      console.log('✅ Migration has already been completed. Skipping...');
      return;
    }

    await db.runQuery('BEGIN TRANSACTION;');

    console.log('🔍 Checking for existing payment data...');

    // Get the total number of legacy payments
    const paymentCountResult = await db.getQuery('SELECT COUNT(*) as count FROM payments');
    const totalPayments = paymentCountResult?.count || 0;

    if (totalPayments === 0) {
      console.log('📝 No legacy payment data found. Migration not needed.');
      await db.runQuery('COMMIT;');

      // Mark migration as completed even when no data
      await db.runQuery("INSERT INTO migrations (name) VALUES ('student-fee-migration-completed')");
      return;
    }

    console.log(`📊 Found ${totalPayments} legacy payments to migrate`);

    // Check if legacy tables exist
    const legacyTableCheck = await db.getQuery("SELECT name FROM sqlite_master WHERE type='table' AND name='payments'");
    if (!legacyTableCheck) {
      throw new Error('Legacy payments table not found. Is this a fresh installation?');
    }

    // Step 1: Get all legacy payments
    console.log('📥 Fetching legacy payment data...');
    const legacyPayments = await db.allQuery('SELECT * FROM payments ORDER BY payment_date ASC');

    // Step 2: Create a single "migration source" charge for each student
    // This charge will hold all migrated payment amounts as "covering legacy debt"
    console.log('🏗️ Creating migration charges...');

    const migrationCharges = [];
    for (const payment of legacyPayments) {
      // Check if we already created a migration charge for this student
      let migrationCharge = migrationCharges.find(mc => mc.student_id === payment.student_id);

      if (!migrationCharge) {
        // Calculate total legacy amount for this student
        const studentTotal = await db.getQuery(
          'SELECT SUM(amount) as total FROM payments WHERE student_id = ?',
          [payment.student_id]
        );

        const chargeId = await db.runQuery(
          `INSERT INTO student_fee_charges
           (student_id, charge_type, amount, description, academic_year, charge_date)
           VALUES (?, 'migration_source', ?, 'Migrated from legacy payments', '2024-2025', ?)`,
          [payment.student_id, studentTotal.total, new Date().toISOString()]
        );

        migrationCharge = {
          id: chargeId.id,
          student_id: payment.student_id,
          total_amount: studentTotal.total,
          description: 'Legacy payment migration charge'
        };
        migrationCharges.push(migrationCharge);

        console.log(`   ✓ Created migration charge for student ${payment.student_id}: ${studentTotal.total} د.ت`);
      }
    }

    // Step 3: Migrate payments to student_payments table
    console.log('💳 Migrating payment records...');
    let migratedPayments = 0;

    for (const legacyPayment of legacyPayments) {
      const paymentId = await db.runQuery(
        `INSERT INTO student_payments
         (student_id, amount, payment_date, payment_method, payment_type, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'legacy_migration', ?, ?, ?)`,
        [
          legacyPayment.student_id,
          legacyPayment.amount,
          legacyPayment.payment_date,
          legacyPayment.payment_method,
          legacyPayment.notes || 'Migrated from legacy system',
          legacyPayment.created_at,
          legacyPayment.updated_at
        ]
      );

      console.log(`   ✓ Migrated payment ${legacyPayment.id} → payment ${paymentId.id} (${legacyPayment.amount} د.ت)`);
      migratedPayments++;
    }

    // Step 4: Create payment breakdown records (link each payment to the student's migration charge)
    console.log('🔗 Creating payment breakdown records...');
    let breakdownRecords = 0;

    for (const legacyPayment of legacyPayments) {
      // Find the corresponding migration charge
      const migrationCharge = migrationCharges.find(mc => mc.student_id === legacyPayment.student_id);
      if (!migrationCharge) {
        console.log(`⚠️  Could not find migration charge for student ${legacyPayment.student_id}, skipping payment ${legacyPayment.id}`);
        continue;
      }

      // Get the newly inserted payment ID (we need to fetch it)
      const newPayment = await db.getQuery(
        'SELECT id FROM student_payments WHERE student_id = ? AND amount = ? AND payment_date = ? ORDER BY id DESC LIMIT 1',
        [legacyPayment.student_id, legacyPayment.amount, legacyPayment.payment_date]
      );

      if (!newPayment) {
        console.log(`⚠️  Could not find migrated payment record for legacy payment ${legacyPayment.id}`);
        continue;
      }

      await db.runQuery(
        `INSERT INTO student_payment_breakdown
         (student_payment_id, student_fee_charge_id, amount)
         VALUES (?, ?, ?)`,
        [newPayment.id, migrationCharge.id, legacyPayment.amount]
      );

      console.log(`   ✓ Created breakdown ${newPayment.id} → charge ${migrationCharge.id} (${legacyPayment.amount} د.ت)`);
      breakdownRecords++;
    }

    // Step 5: Create backup of legacy table before deletion
    console.log('💾 Backing up legacy data...');
    await db.runQuery(`
      CREATE TABLE IF NOT EXISTS payments_backup AS
      SELECT * FROM payments
    `);

    // Step 6: Clean up legacy data (optional - can be done after verification)
    // For safety, we'll leave the legacy table intact and just mark the migration complete
    console.log('📋 Legacy table preserved for safety (payments_backup created)');

    // Mark migration as completed
    await db.runQuery("INSERT INTO migrations (name) VALUES ('student-fee-migration-completed')");

    await db.runQuery('COMMIT;');

    // Migration summary
    console.log('\n===========================================================');
    console.log('✅ STUDENT FEE MIGRATION COMPLETED SUCCESSFULLY!');
    console.log('===========================================================');
    console.log(`   Legacy payments processed: ${totalPayments}`);
    console.log(`   Migrated payments: ${migratedPayments}`);
    console.log(`   Migration charges created: ${migrationCharges.length}`);
    console.log(`   Breakdown records created: ${breakdownRecords}`);
    console.log('\n📋 WHAT HAPPENED:');
    console.log('   - All legacy payments moved to student_payments table');
    console.log('   - Migration charges created to maintain ledger concept');
    console.log('   - Payments properly allocated to charges');
    console.log('   - Legacy data safely backed up in payments_backup table');
    console.log('\n🔄 NEXT STEPS:');
    console.log('   - Verify payment data in student fees tab');
    console.log('   - Run system tests to ensure everything works');
    console.log('   - Remove migration charges if historical data view is not needed');

  } catch (error) {
    await db.runQuery('ROLLBACK;');
    logError('❌ Error during student fee migration:', error);
    console.error('\n===========================================================');
    console.error('❌ STUDENT FEE MIGRATION FAILED!');
    console.error('===========================================================');
    console.error(`Error: ${error.message}`);
    console.error('\n📧 Recovery: Please check logs and database integrity.');
    console.error('    You may need to restore from backup if data was corrupted.');
    throw error;
  } finally {
    await db.closeDatabase();
  }
}

// Run the migration
migrateStudentFees().catch((err) => {
  console.error('Unhandled error during migration:', err);
  process.exit(1);
});
