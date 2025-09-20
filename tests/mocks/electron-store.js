// tests/mocks/electron-store.js
// Global shared data store
const globalData = new Map();

// Create mock methods that operate on the global data
const mockMethods = {
  get: jest.fn((key) => globalData.get(key)),
  set: jest.fn((key, value) => globalData.set(key, value)),
  delete: jest.fn((key) => globalData.delete(key)),
  clear: jest.fn(() => globalData.clear()),
};

class Store {
  constructor() {
    // Assign mock methods to this instance
    Object.assign(this, mockMethods);
  }
}

// Export the mock methods for test access
Store.mockMethods = mockMethods;
Store.globalData = globalData;
module.exports = Store;
