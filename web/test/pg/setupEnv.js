// Environment for the web-postgres Jest project (jest.pg.config.js).
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/qam_jest';
process.env.DATA_DIR =
  process.env.DATA_DIR || require('path').join(require('os').tmpdir(), 'qam-jest-data');
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'warn';
