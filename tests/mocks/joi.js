// This is a comprehensive mock for Joi that supports chaining.
// By default, validate/validateAsync are plain jest.fn(), allowing tests
// to define their return values without interference.
const chainable = {
  string: jest.fn().mockReturnThis(),
  min: jest.fn().mockReturnThis(),
  max: jest.fn().mockReturnThis(),
  required: jest.fn().mockReturnThis(),
  messages: jest.fn().mockReturnThis(),
  email: jest.fn().mockReturnThis(),
  pattern: jest.fn().mockReturnThis(),
  alphanum: jest.fn().mockReturnThis(),

  number: jest.fn().mockReturnThis(),
  integer: jest.fn().mockReturnThis(),
  positive: jest.fn().mockReturnThis(),

  date: jest.fn().mockReturnThis(),
  iso: jest.fn().mockReturnThis(),

  boolean: jest.fn().mockReturnThis(),

  array: jest.fn().mockReturnThis(),
  items: jest.fn().mockReturnThis(),
  any: jest.fn().mockReturnThis(),

  allow: jest.fn().mockReturnThis(),
  optional: jest.fn().mockReturnThis(),
  unknown: jest.fn().mockReturnThis(),
  valid: jest.fn().mockReturnThis(),
  default: jest.fn().mockReturnThis(),
  keys: jest.fn().mockReturnThis(),
  when: jest.fn().mockReturnThis(),
  try: jest.fn().mockReturnThis(),
  with: jest.fn().mockReturnThis(),

  ref: jest.fn((ref) => `ref:${ref}`),

  // These are now plain mocks, to be implemented by tests as needed.
  validateAsync: jest.fn(),
  validate: jest.fn(),
};

// The actual mock that Jest will use.
module.exports = {
  object: jest.fn(() => chainable),
  string: jest.fn(() => chainable),
  number: jest.fn(() => chainable),
  boolean: jest.fn(() => chainable),
  date: jest.fn(() => chainable),
  array: jest.fn(() => chainable),
  any: jest.fn(() => chainable),
  alternatives: jest.fn(() => chainable),
  exist: jest.fn(() => chainable),
  required: jest.fn(() => chainable),
  valid: jest.fn().mockReturnThis(),
  ref: (ref) => chainable.ref(ref),
  // Mock ValidationError as a class that can be instantiated
  ValidationError: class ValidationError extends Error {
    constructor(message, details) {
      super(message);
      this.details = details;
    }
  },
};
