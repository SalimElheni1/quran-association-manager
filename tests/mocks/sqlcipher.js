module.exports = {
  verbose: () => ({
    Database: class {
      constructor(path, callback) {
        if (callback) {
          callback(null);
        }
      }
      run(sql, params, callback) {
        if (callback) {
          callback.call({ lastID: 1, changes: 1 }, null);
        }
        return this;
      }
      get(sql, params, callback) {
        if (callback) {
          callback(null, {});
        }
        return this;
      }
      all(sql, params, callback) {
        if (callback) {
          callback(null, []);
        }
        return this;
      }
      close(callback) {
        if (callback) {
          callback(null);
        }
      }
      serialize(callback) {
        callback();
      }
    },
  }),
};
