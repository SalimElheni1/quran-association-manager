// tests/mocks/electron-store.js
const mockStore = {
  get: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
  clear: jest.fn(),
};

class Store {
  constructor() {
    return mockStore;
  }
}

module.exports = Store;
