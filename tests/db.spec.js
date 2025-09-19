const { initializeDatabase, closeDatabase, isDbOpen } = require('../src/db/db');

describe('Database Initialization', () => {
  it('should initialize the database and run migrations for an existing database', async () => {
    const credentials = await initializeDatabase();
    expect(isDbOpen()).toBe(true);
    await closeDatabase();
    expect(isDbOpen()).toBe(false);
  });
});
