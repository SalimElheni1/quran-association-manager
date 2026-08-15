const jwt = require('jsonwebtoken');
const db = require('../db/db');

const getUserFromToken = async (token) => {
  if (!token) {
    throw new Error('Authentication token not provided.');
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await db.getQuery('SELECT id, username FROM users WHERE id = ?', [decoded.id]);

    if (!user) {
      throw new Error('User not found.');
    }

    const roles = await db.allQuery(
      'SELECT r.name FROM roles r JOIN user_roles ur ON r.id = ur.role_id WHERE ur.user_id = ?',
      [user.id],
    );

    user.roles = roles.map((r) => r.name);
    return user;
  } catch (error) {
    throw new Error('Invalid or expired authentication token.');
  }
};

const requireRoles = (allowedRoles) => {
  return (originalHandler) => {
    return async (event, ...args) => {
      // Extract token safely from invocation arguments or event context
      let token = null;

      if (event && event.authToken) {
        token = event.authToken;
      } else if (args.length > 0 && typeof args[args.length - 1] === 'object' && args[args.length - 1] !== null && args[args.length - 1].authToken) {
        token = args[args.length - 1].authToken;
      } else if (args.length > 0 && typeof args[0] === 'string' && args[0].startsWith('ey')) {
        token = args[0];
      } else if (args.length > 0 && typeof args[0] === 'object' && args[0] !== null && args[0].token) {
        token = args[0].token;
      } else if (event && event.sender && event.sender.authToken) {
        token = event.sender.authToken;
      }

      const user = await getUserFromToken(token);
      const hasRole = user.roles.some((role) => allowedRoles.includes(role));

      if (!hasRole) {
        throw new Error('Insufficient permissions.');
      }

      return await originalHandler(event, ...args);
    };
  };
};

module.exports = {
  getUserFromToken,
  requireRoles,
};
