#!/usr/bin/env node

/**
 * Matricule Format Fixer Script
 *
 * This script ensures all matricules in the database are in the correct 4-digit format.
 * It can be run during app updates or after importing backups from older versions.
 *
 * Usage:
 *   node scripts/fix-matricule-format.js
 */

const db = require('../src/db/db');
const { log, error: logError } = require('../src/main/logger');

async function fixMatriculeFormat() {
  try {
    log('Starting matricule format fix...');

    // Check if database is initialized
    if (!db.isDbOpen()) {
      log('Database not initialized. Please start the application first.');
      process.exit(1);
    }

    const tables = [
      { name: 'students', prefix: 'S-' },
      { name: 'teachers', prefix: 'T-' },
      { name: 'users', prefix: 'U-' },
      { name: 'groups', prefix: 'G-' },
      { name: 'inventory_items', prefix: 'INV-' },
    ];

    let totalFixed = 0;

    for (const table of tables) {
      log(`Checking ${table.name} table...`);

      // Get all matricules that need fixing (more than 4 digits after prefix)
      const matriculesToFix = await db.allQuery(`
        SELECT id, matricule
        FROM ${table.name}
        WHERE matricule IS NOT NULL
          AND LENGTH(matricule) > 0
          AND LENGTH(SUBSTR(matricule, INSTR(matricule, '-') + 1)) > 4
      `);

      if (matriculesToFix.length > 0) {
        log(`Found ${matriculesToFix.length} matricules to fix in ${table.name}`);

        for (const record of matriculesToFix) {
          // Extract the numeric part and convert to 4-digit format
          const parts = record.matricule.split('-');
          if (parts.length === 2) {
            const prefix = parts[0] + '-';
            const number = parseInt(parts[1], 10);
            const newMatricule = prefix + number.toString().padStart(4, '0');

            // Update the record
            await db.runQuery(`UPDATE ${table.name} SET matricule = ? WHERE id = ?`, [
              newMatricule,
              record.id,
            ]);

            log(`Fixed: ${record.matricule} → ${newMatricule}`);
            totalFixed++;
          }
        }
      } else {
        log(`No matricules to fix in ${table.name}`);
      }
    }

    log(`Matricule format fix completed. Total matricules fixed: ${totalFixed}`);

    if (totalFixed > 0) {
      log('✅ All matricules are now in the correct 4-digit format.');
    } else {
      log('ℹ️  All matricules were already in the correct format.');
    }
  } catch (error) {
    logError('Error during matricule format fix:', error);
    process.exit(1);
  } finally {
    // Close database connection
    await db.closeDatabase();
    process.exit(0);
  }
}

// Run the script
fixMatriculeFormat();
