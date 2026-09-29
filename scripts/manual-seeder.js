#!/usr/bin/env node

/**
 * Manual Seeder Script for Quran Association Manager
 * Populates the development database (the one `npm run dev` opens) with demo data.
 * Usage: npm run seed:manual   (runs this file with Electron; quit the app first)
 *
 * It runs inside Electron, not plain Node, because the SQLite module is built for Electron and
 * the database key is protected with Electron's safeStorage. The demo superadmin logs in with
 * SUPERADMIN_USERNAME / SUPERADMIN_PASSWORD from .env.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { app } = require('electron');

if (!app) {
  console.error('Run this script with Electron: npm run seed:manual');
  process.exit(1);
}
// Same app name, so the same userData folder, key store and database as `npm run dev`.
app.setName(require('../package.json').name);

const {
  seedBranches,
  seedUsers,
  seedTeachers,
  seedStudents,
  seedClasses,
  seedEnrollments,
  seedAttendance,
} = require('../src/db/seederFunctions');

const { initializeDatabase, closeDatabase } = require('../src/db/db');

async function manualSeeder() {
  console.log('🌱 Starting Manual Seeder Script...');
  console.log('=====================================');

  let failed = false;
  try {
    console.log('📊 Initializing database connection...');
    await initializeDatabase();
    console.log('✅ Database connection established');

    // Seed demo data in sequence
    console.log('\n🎯 Seeding demo data...');

    console.log('1️⃣ Seeding branches...');
    await seedBranches();

    console.log('2️⃣ Seeding users...');
    await seedUsers();

    console.log('3️⃣ Seeding teachers...');
    await seedTeachers();

    console.log('4️⃣ Seeding students...');
    await seedStudents();

    console.log('5️⃣ Seeding classes...');
    await seedClasses();

    console.log('6️⃣ Seeding enrollments...');
    await seedEnrollments();

    console.log('7️⃣ Seeding attendance...');
    await seedAttendance();

    console.log('\n✨ Manual seeding completed successfully!');
    console.log('=====================================');
    console.log('📋 Demo data has been populated in your database');
    console.log('🔄 You can run this script again to add more demo data');
  } catch (error) {
    console.error('❌ Error during manual seeding:', error);
    failed = true;
  } finally {
    await closeDatabase();
  }
  return !failed;
}

// Run the seeder when Electron starts this file (`electron scripts/manual-seeder.js`). Electron
// loads it through its own entry point, so `require.main === module` is false here.
if (process.type === 'browser') {
  app
    .whenReady()
    .then(manualSeeder)
    .then((ok) => app.exit(ok ? 0 : 1));
}

module.exports = { manualSeeder };
