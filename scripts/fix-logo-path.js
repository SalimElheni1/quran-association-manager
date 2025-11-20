/**
 * One-time script to fix the logo path in the database
 * Changes g247.png to assets/logos/icon.png
 */

const db = require('../src/db/db');

async function fixLogoPath() {
  try {
    console.log('Initializing database...');
    await db.initializeDatabase();

    console.log('Checking current national_logo_path setting...');

    // Get current setting
    const result = await db.getQuery('SELECT value FROM settings WHERE key = ?', [
      'national_logo_path',
    ]);
    const currentPath = result?.value;

    console.log('Current logo path:', currentPath);

    if (currentPath === 'assets/logos/icon.png') {
      console.log('Logo path is already correct!');
      return;
    }

    // Update to correct path
    await db.runQuery('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [
      'national_logo_path',
      'assets/logos/icon.png',
    ]);
    console.log('Updated logo path to: assets/logos/icon.png');
  } catch (error) {
    console.error('Error fixing logo path:', error);
  } finally {
    await db.closeDatabase();
  }
}

// Run the fix
fixLogoPath().catch(console.error);
