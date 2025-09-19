
const connect = require('@databases/sqlite');

const db = connect(); // In-memory database
let isOpen = false;

module.exports = {
    initializeDatabase: () => {
        isOpen = true;
        return Promise.resolve();
    },
    initializeTestDatabase: () => {
        isOpen = true;
        return Promise.resolve(db);
    },
    closeDatabase: () => {
        isOpen = false;
        return Promise.resolve();
    },
    isDbOpen: () => isOpen,
    getQuery: () => Promise.resolve(),
    allQuery: () => Promise.resolve([]),
    runQuery: () => Promise.resolve({ id: 1, changes: 1 }),
    dbExec: () => Promise.resolve(),
    getDb: () => db,
    dbClose: () => Promise.resolve(),
};
