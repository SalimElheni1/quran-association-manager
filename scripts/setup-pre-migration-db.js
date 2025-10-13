#!/usr/bin/env node

/**
 * Pre-Migration Database Setup Script
 *
 * This script creates a clean, unencrypted SQLite database that mimics the state
 * of the application *before* the multi-role migration (015-multi-role-migration.sql).
 *
 * This allows for consistent and repeatable testing of the migration process.
 *
 * Usage: node scripts/setup-pre-migration-db.js
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const dbDir = path.join(__dirname, '..', '.db');
const dbPath = path.join(dbDir, 'quran_assoc_manager_pre_migration.sqlite');

// Ensure the .db directory exists
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Delete the old pre-migration database file if it exists
if (fs.existsSync(dbPath)) {
  fs.unlinkSync(dbPath);
  console.log(`Deleted existing pre-migration database at: ${dbPath}`);
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Failed to create pre-migration database:', err);
    process.exit(1);
  }
  console.log(`Successfully created pre-migration database at: ${dbPath}`);
});

const OLD_SCHEMA = `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT, -- The old single role column
    first_name TEXT,
    last_name TEXT,
    email TEXT,
    phone_number TEXT,
    employment_type TEXT,
    start_date TEXT,
    status TEXT,
    national_id TEXT,
    date_of_birth TEXT,
    occupation TEXT,
    civil_status TEXT,
    matricule TEXT,
    onboarding_status TEXT,
    onboarding_completed_date TEXT
  );

  -- Create other tables that might be referenced, but keep them empty for this test
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE branches (id INTEGER PRIMARY KEY, name TEXT, location TEXT);
`;

const PRE_MIGRATION_USERS = [
  {
    username: 'superadmin',
    password: 'password123',
    role: 'Superadmin', // This role name is used by the migration script
    first_name: 'Super',
    last_name: 'Admin',
    email: 'superadmin@test.com',
  },
  {
    username: 'testadmin',
    password: 'password123',
    role: 'Admin', // A generic admin
    first_name: 'Test',
    last_name: 'Admin',
    email: 'testadmin@test.com',
  },
  {
    username: 'financeadmin_user', // This user has "admin" in the name and should be tested
    password: 'password123',
    role: 'Finance', // A role that should NOT be migrated to Administrator
    first_name: 'Finance',
    last_name: 'User',
    email: 'finance@test.com',
  },
  {
    username: 'supervisor_user',
    password: 'password123',
    role: 'Supervisor', // Another role that should not be migrated
    first_name: 'Supervisor',
    last_name: 'User',
    email: 'supervisor@test.com',
  },
];

db.serialize(() => {
  console.log('Applying old schema...');
  db.exec(OLD_SCHEMA, (err) => {
    if (err) {
      console.error('Error applying schema:', err);
      process.exit(1);
    }
    console.log('Schema applied successfully.');

    console.log('Inserting pre-migration users...');
    const stmt = db.prepare(
      'INSERT INTO users (username, password, role, first_name, last_name, email) VALUES (?, ?, ?, ?, ?, ?)',
    );

    for (const user of PRE_MIGRATION_USERS) {
      const hashedPassword = bcrypt.hashSync(user.password, 10);
      stmt.run(
        user.username,
        hashedPassword,
        user.role,
        user.first_name,
        user.last_name,
        user.email,
        (err) => {
          if (err) {
            console.error(`Error inserting user ${user.username}:`, err);
          } else {
            console.log(`Inserted user: ${user.username}`);
          }
        },
      );
    }

    stmt.finalize((err) => {
      if (err) {
        console.error('Error finalizing statement:', err);
      } else {
        console.log('All pre-migration users inserted.');
      }

      // Close the database connection
      db.close((err) => {
        if (err) {
          console.error('Error closing the database:', err);
        } else {
          console.log('Database connection closed. Pre-migration setup is complete.');
        }
      });
    });
  });
});
