const joi = require('joi');

// This is a more robust, explicit mock for Joi that supports chaining.
// It works by having each method return a reference to the same object.
const chainable = {
  string: jest.fn().mockReturnThis(),
  min: jest.fn().mockReturnThis(),
  max: jest.fn().mockReturnThis(),
  required: jest.fn().mockReturnThis(),
  messages: jest.fn().mockReturnThis(),
  email: jest.fn().mockReturnThis(),
  pattern: jest.fn().mockReturnThis(),
  unknown: jest.fn().mockReturnThis(),
  valid: jest.fn().mockReturnThis(),
  boolean: jest.fn().mockReturnThis(),
  number: jest.fn().mockReturnThis(),
  integer: jest.fn().mockReturnThis(),
  allow: jest.fn().mockReturnThis(),
  optional: jest.fn().mockReturnThis(),
  // The most important functions to mock for validation itself.
  // By default, we simulate successful validation.
  validateAsync: jest.fn().mockImplementation((value) => Promise.resolve(value)),
  validate: jest.fn().mockImplementation((value) => ({ value, error: undefined })),
};

jest.mock('joi', () => ({
  object: jest.fn(() => chainable),
  // Mock top-level types as well, so they can be used directly.
  string: jest.fn(() => chainable),
  number: jest.fn(() => chainable),
  boolean: jest.fn(() => chainable),
  date: jest.fn(() => chainable),
  array: jest.fn(() => chainable),
  // Keep the original ValidationError class for accurate error checking.
  ValidationError: joi.ValidationError,
}));
