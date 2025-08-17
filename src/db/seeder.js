const { getQuery, allQuery } = require('./db');
const {
  seedBranches,
  seedUsers,
  seedTeachers,
  seedStudents,
  seedClasses,
  seedEnrollments,
  seedAttendance,
} = require('./seederFunctions');

let isSeeding = false;
let seedingPromise = null;

async function checkIfSeeded() {
  try {
    const result = await allQuery('SELECT COUNT(*) as count FROM branches');
    return result[0].count > 0;
  } catch (error) {
    console.error('Error checking if database is seeded:', error);
    return false;
  }
}

async function seedDatabase() {
  // If seeding is already in progress, return the existing promise
  if (seedingPromise) {
    return seedingPromise;
  }

  // If already seeding, don't start another seeding process
  if (isSeeding) {
    console.log('Seeding already in progress...');
    return;
  }

  isSeeding = true;
  console.log('Starting database seeding...');

  seedingPromise = (async () => {
    try {
      // Check if database is already seeded
      const isSeeded = await checkIfSeeded();
      if (isSeeded) {
        console.log('Database already seeded, skipping...');
        return;
      }

      // Seed in sequence to maintain data consistency
      console.log('Seeding database in sequence...');
      await seedBranches();
      await seedUsers();
      await seedTeachers();
      await seedStudents();
      await seedClasses();
      await seedEnrollments();
      await seedAttendance();

      console.log('Database seeding completed successfully.');
    } catch (error) {
      console.error('Error during database seeding:', error);
      throw error;
    } finally {
      isSeeding = false;
      seedingPromise = null;
    }
  })();

  return seedingPromise;
}

module.exports = { seedDatabase };
