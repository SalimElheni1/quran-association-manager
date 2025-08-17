#!/usr/bin/env node

/**
 * Manual Seeder Script for Quran Association Manager
 * Run this script when you need to populate demo/sample data
 * Usage: npm run seed:manual
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const {
  seedBranches,
  seedUsers,
  seedTeachers,
  seedStudents,
  seedClasses,
  seedEnrollments,
  seedAttendance,
} = require('../src/db/seederFunctions');

const { initializeDatabase } = require('../src/db/db');

async function manualSeeder() {
  console.log('🌱 Starting Manual Seeder Script...');
  console.log('=====================================');

  try {
    // Initialize database connection
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
    process.exit(1);
  }
}

// Run the seeder if this script is executed directly
if (require.main === module) {
  manualSeeder();
}

module.exports = { manualSeeder };
