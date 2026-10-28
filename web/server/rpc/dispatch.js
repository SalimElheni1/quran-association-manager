// Calls one desktop IPC channel for an HTTP request, with the desktop's own authorization
// rules (ipcSecurity.js CHANNEL_ROLES) and argument schemas (ipcValidation.js).

require('../bootstrap');
const path = require('path');
const { ROOT } = require('../bootstrap');
const { loadHandlers } = require('./registry');
const { runInBranch } = require('../services/branchRunner');
const uploads = require('../services/uploads');
const downloads = require('../services/downloads');

const ipcSecurity = require(path.join(ROOT, 'src', 'main', 'ipcSecurity.js'));
const { validateChannelArgs } = require(path.join(ROOT, 'src', 'main', 'ipcValidation.js'));
const sessionManager = require(path.join(ROOT, 'src', 'main', 'sessionManager.js'));
const { WEB_CHANNEL_ROLES, WEB_ARG_SCHEMAS } = require('./webHandlers');

const { ERRORS, ROLES } = ipcSecurity;

// Desktop channels the browser never calls through RPC: login and logout have their own HTTP
// routes, and the toasts are shown in the browser directly.
const NOT_RPC = new Set([
  'auth:login',
  'auth:setup-superadmin',
  'logout',
  'ui:show-error-toast',
  'ui:show-success-toast',
]);

// Channels the browser may call before signing in (the login page shows the branch logo).
const WEB_PUBLIC = new Set([
  'get-app-version',
  'get-is-packaged',
  'get-initial-credentials',
  'settings:getLogo',
]);

let senderSeq = 0;

class RpcError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function policyFor(channel) {
  if (WEB_CHANNEL_ROLES[channel]) return { public: false, roles: WEB_CHANNEL_ROLES[channel] };
  if (WEB_PUBLIC.has(channel)) return { public: true, roles: null };
  const policy = ipcSecurity.getPolicy(channel);
  if (policy.public) return { public: false, roles: ROLES.SESSION };
  // Unclassified channels are refused on the web (the desktop only warns).
  if (policy.unknown) return null;
  return { public: false, roles: policy.roles };
}

function validateArgs(channel, args) {
  const webSchema = WEB_ARG_SCHEMAS[channel];
  if (webSchema) {
    if (args.length > webSchema.length) return 'too many arguments';
    for (let i = 0; i < webSchema.length; i += 1) {
      const { error } = webSchema[i].validate(args[i]);
      if (error) return `argument ${i + 1}: ${error.details[0].type}`;
    }
    return null;
  }
  return validateChannelArgs(channel, args);
}

/**
 * Invokes a channel.
 * @param {object} req
 * @param {import('../context').BranchRef} req.branch
 * @param {{id: number, username: string, roles: string[]}|null} req.user
 * @param {string|null} req.sessionId
 * @param {string} req.channel
 * @param {Array} req.args
 * @param {string[]} [req.uploadIds] - Files uploaded for the handler's open dialog.
 * @param {object} [req.meta] - { ip, userAgent } for the audit log.
 * @returns {Promise<{result: *, downloads: {id: string, name: string}[], events: object[]}>}
 */
async function invoke({ branch, user, sessionId, channel, args, uploadIds = [], meta = {} }) {
  const handlers = loadHandlers();
  if (NOT_RPC.has(channel)) throw new RpcError('Not available through this endpoint.', 404);
  const handler = handlers.get(channel);
  const policy = handler ? policyFor(channel) : null;
  if (!handler || !policy) throw new RpcError('Unknown channel.', 404);

  if (!policy.public) {
    if (!user) throw new RpcError(ERRORS.AUTH_REQUIRED, 401);
    if (policy.roles && !policy.roles.some((role) => user.roles.includes(role))) {
      throw new RpcError(ERRORS.FORBIDDEN, 403);
    }
  }

  const resolvedArgs = uploads.resolveArgs(args, sessionId);
  const problem = validateArgs(channel, args);
  if (problem) {
    console.warn(`[rpc] Rejected invalid arguments for "${channel}": ${problem}`);
    throw new RpcError(ERRORS.INVALID_INPUT, 400);
  }

  senderSeq = (senderSeq % 1_000_000_000) + 1;
  const senderId = 1_000_000 + senderSeq;
  const sender = { id: senderId, getURL: () => '', isDestroyed: () => false, send: () => {} };
  const event = { sender, senderFrame: null, reply: () => {}, returnValue: undefined };

  return runInBranch(branch, { user, sessionId, senderId, meta }, async (ctx) => {
    ctx.pendingUploads = uploads.take(uploadIds, sessionId);
    if (user) sessionManager.createSession(sender, user, null);
    try {
      const result = await handler(event, ...resolvedArgs);
      return {
        result: result === undefined ? null : result,
        downloads: downloads.register(ctx.downloads, sessionId),
        events: ctx.events,
      };
    } finally {
      sessionManager.revokeSession(senderId);
    }
  });
}

module.exports = { invoke, RpcError, policyFor };
