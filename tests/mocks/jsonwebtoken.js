// Mocking the jsonwebtoken library
module.exports = {
  sign: jest.fn(() => 'mock-signed-token'),
  verify: jest.fn((token, _secret) => {
    // Return a mock decoded payload.
    // The auth middleware expects an 'id' property.
    if (token === 'mock-jwt-token') {
      return { id: 1, username: 'testuser' };
    }
    // For other tokens, throw an error to be safe in tests
    throw new Error('Invalid mock token');
  }),
};
