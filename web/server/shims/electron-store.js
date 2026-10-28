// electron-store for the web server: the values belong to the current branch. They are loaded
// when a branch request starts (rpc/branchRunner.js), read and written synchronously in
// memory like electron-store, and saved to platform.branch_kv when the request ends.

const context = require('../context');

class Store {
  constructor(options = {}) {
    this.storeName = options.name || 'config';
    this.defaults = options.defaults || {};
  }

  _values() {
    const ctx = context.current();
    if (!ctx || !ctx.kv) return null;
    if (!ctx.kv.has(this.storeName)) ctx.kv.set(this.storeName, {});
    return ctx.kv.get(this.storeName);
  }

  _changed(key) {
    const ctx = context.current();
    if (ctx) ctx.kvDirty.add(JSON.stringify([this.storeName, key]));
  }

  get(key, defaultValue) {
    const values = this._values();
    const value = values ? values[key] : undefined;
    if (value !== undefined) return clone(value);
    if (this.defaults[key] !== undefined) return clone(this.defaults[key]);
    return defaultValue;
  }

  set(key, value) {
    const values = this._values();
    if (!values) return; // outside a branch request there is nowhere to keep it
    if (key && typeof key === 'object') {
      for (const [k, v] of Object.entries(key)) {
        values[k] = clone(v);
        this._changed(k);
      }
    } else {
      values[key] = clone(value);
      this._changed(key);
    }
  }

  has(key) {
    const values = this._values();
    return !!values && values[key] !== undefined;
  }

  delete(key) {
    const values = this._values();
    if (values && key in values) {
      delete values[key];
      this._changed(key);
    }
  }

  clear() {
    const ctx = context.current();
    if (ctx && ctx.kv) {
      for (const key of Object.keys(ctx.kv.get(this.storeName) || {})) this._changed(key);
      ctx.kv.set(this.storeName, {});
    }
  }

  get store() {
    return clone(this._values() || {});
  }

  get path() {
    return `branch-kv:${this.storeName}`;
  }
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

module.exports = Store;
module.exports.default = Store;
