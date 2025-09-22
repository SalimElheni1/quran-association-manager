
const connect = require('@databases/sqlite');

const db = connect(); // In-memory database
let isOpen = false;

module.exports = {
    initializeDatabase: jest.fn(() => {
        isOpen = true;
        return Promise.resolve();
    }),
    initializeTestDatabase: jest.fn(() => {
        isOpen = true;
        return Promise.resolve(db);
    }),
    closeDatabase: jest.fn(() => {
        isOpen = false;
        return Promise.resolve();
    }),
    isDbOpen: jest.fn(() => isOpen),
    getQuery: jest.fn(() => Promise.resolve()),
    allQuery: jest.fn(() => Promise.resolve([])),
    runQuery: jest.fn(() => Promise.resolve({ id: 1, changes: 1 })),
    dbExec: jest.fn(() => Promise.resolve()),
    getDb: jest.fn(() => db),
    getDatabasePath: jest.fn(),
    dbClose: jest.fn(() => Promise.resolve()),
};
