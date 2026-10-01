// tests/db/helpers/electronStoreMock.js
// Stands in for 'electron-store' in the db-integration project (see jest.config.js).
// Values live in memory for the test file only; nothing is read from or written to the
// user's config directory. `path` points inside the test's temporary userData directory
// (see electronMock) so code that reports the store location never names a real file.

const path = require('path');
const { __getUserDataDir } = require('./electronMock');

const stores = new Map();

class Store {
  constructor(options = {}) {
    this.name = options.name || 'config';
    if (!stores.has(this.name)) {
      stores.set(this.name, new Map(Object.entries(options.defaults || {})));
    }
    this.data = stores.get(this.name);
  }

  get path() {
    const dir = __getUserDataDir();
    return dir ? path.join(dir, `${this.name}.json`) : null;
  }

  get store() {
    return Object.fromEntries(this.data);
  }

  get(key, defaultValue) {
    return this.data.has(key) ? this.data.get(key) : defaultValue;
  }

  set(key, value) {
    if (key && typeof key === 'object') {
      Object.entries(key).forEach(([k, v]) => this.data.set(k, v));
      return;
    }
    this.data.set(key, value);
  }

  has(key) {
    return this.data.has(key);
  }

  delete(key) {
    this.data.delete(key);
  }

  clear() {
    this.data.clear();
  }
}

module.exports = Store;
