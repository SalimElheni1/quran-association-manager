const db = {}; // Not a real connection
let isOpen = false;

const mockUser = { id: 1, username: 'testuser', first_name: 'Test', last_name: 'User' };
const mockAdminRoles = [{ name: 'Administrator' }];

const getQuery = jest.fn((sql, params) => {
  // Mock the user lookup for the auth middleware
  if (sql.includes('SELECT id, username FROM users WHERE id = ?') && params[0] === 1) {
    return Promise.resolve(mockUser);
  }
  // Default behavior for other getQuery calls
  return Promise.resolve(null);
});

const allQuery = jest.fn((sql) => {
  // Mock the role lookup for the auth middleware
  if (sql.includes('SELECT r.name FROM roles r JOIN user_roles ur')) {
    return Promise.resolve(mockAdminRoles);
  }
  // Default behavior for other allQuery calls
  return Promise.resolve([]);
});

const runQuery = jest.fn(() => Promise.resolve({ id: 1, changes: 1 }));
const withTransaction = jest.fn(async (callback) => {
  // Execute the callback and return its result
  return await callback();
});

// Resets mock state AND drains mockResolvedValueOnce queues (jest.clearAllMocks
// does not clear queued once-values, which leaks across tests), then restores the
// default implementations above.
function resetMocks() {
  getQuery.mockReset();
  allQuery.mockReset();
  runQuery.mockReset();
  withTransaction.mockReset();

  getQuery.mockImplementation((sql, params) => {
    if (sql.includes('SELECT id, username FROM users WHERE id = ?') && params[0] === 1) {
      return Promise.resolve(mockUser);
    }
    return Promise.resolve(null);
  });
  allQuery.mockImplementation((sql) => {
    if (sql.includes('SELECT r.name FROM roles r JOIN user_roles ur')) {
      return Promise.resolve(mockAdminRoles);
    }
    return Promise.resolve([]);
  });
  runQuery.mockImplementation(() => Promise.resolve({ id: 1, changes: 1 }));
  withTransaction.mockImplementation(async (callback) => {
    return await callback();
  });
}

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
  getQuery,
  allQuery,
  runQuery,
  dbExec: jest.fn(() => Promise.resolve()),
  withTransaction,
  getDb: jest.fn(() => db),
  getDatabasePath: jest.fn(),
  dbClose: jest.fn(() => Promise.resolve()),
  hasSuperadmin: jest.fn(() => Promise.resolve(false)),
  createSuperadminUser: jest.fn((username) => Promise.resolve({ id: 1, username })),
  resetMocks,
};
