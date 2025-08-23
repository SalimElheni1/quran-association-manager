module.exports = {
  hashSync: jest.fn((data) => `hashed_${data}`),
  compare: jest.fn().mockResolvedValue(true),
  genSalt: jest.fn().mockResolvedValue('somesalt'),
  hash: jest.fn().mockResolvedValue('somehash'),
};
