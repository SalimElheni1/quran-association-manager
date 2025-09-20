// tests/mocks/electron-store.js
class Store {
  constructor() {
    this.data = new Map();
    this.get = jest.fn((key) => this.data.get(key));
    this.set = jest.fn((key, value) => this.data.set(key, value));
    this.delete = jest.fn((key) => this.data.delete(key));
    this.clear = jest.fn(() => this.data.clear());
  }
}

module.exports = Store;
