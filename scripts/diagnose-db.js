const Database = require('better-sqlite3-multiple-ciphers');
const fs = require('fs');
const path = require('path');

const testDbPath = path.join(__dirname, 'test.db');
const key = 'test-key-123';

try {
    console.log('--- Starting Database Diagnostic ---');
    if (fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
    }

    console.log('Creating encrypted database...');
    const db = new Database(testDbPath);
    db.pragma(`key = '${key}'`);
    db.exec('CREATE TABLE test (id INTEGER PRIMARY KEY, value TEXT)');
    db.prepare('INSERT INTO test (value) VALUES (?)').run('Hello World');
    db.close();
    console.log('Database created successfully.');

    console.log('Attempting to reopen database...');
    const db2 = new Database(testDbPath);
    db2.pragma(`key = '${key}'`);
    const row = db2.prepare('SELECT * FROM test').get();
    console.log('Row retrieved:', row);
    db2.close();

    if (row.value === 'Hello World') {
        console.log('SUCCESS: Database library is working correctly.');
    } else {
        console.log('FAILURE: Data mismatch.');
    }

} catch (error) {
    console.error('CRITICAL FAILURE:', error);
} finally {
    if (fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
    }
}
