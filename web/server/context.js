// The request context. Everything the shared desktop handlers kept in module-level state
// (the open database, the logged-in session, electron-store values) is per request on the
// web, and lives here. AsyncLocalStorage carries it through every await, timer and promise
// started while handling the request.

const { AsyncLocalStorage } = require('async_hooks');

const storage = new AsyncLocalStorage();

/**
 * @typedef {object} BranchRef
 * @property {number} id
 * @property {string} slug
 * @property {string} name
 * @property {string} schema - The Postgres schema (branch_<id>).
 * @property {string} status - 'active' | 'suspended'.
 *
 * @typedef {object} RequestContext
 * @property {BranchRef|null} branch
 * @property {{id: number, username: string, roles: string[]}|null} user
 * @property {number|null} senderId - The synthetic webContents id the handlers see.
 * @property {string|null} sessionId - The web session row (platform.sessions.id).
 * @property {object} db - Connection state, managed by db/adapter.js.
 * @property {string[]} pendingUploads - Files for the next dialog.showOpenDialog.
 * @property {{path: string, name: string}[]} downloads - Files written by dialog.showSaveDialog.
 * @property {Map<string, object>|null} kv - electron-store values of this branch.
 * @property {Set<string>} kvDirty
 * @property {string[]} events - Renderer events to replay (financial-data-changed, ...).
 */

/**
 * Creates a context object.
 * @param {Partial<RequestContext>} init
 * @returns {RequestContext}
 */
function createContext(init = {}) {
  return {
    branch: null,
    user: null,
    senderId: null,
    sessionId: null,
    db: { client: null, connecting: null, queue: Promise.resolve(), txDepth: 0 },
    pendingUploads: [],
    downloads: [],
    kv: null,
    kvDirty: new Set(),
    events: [],
    ...init,
  };
}

/** @returns {RequestContext|undefined} */
function current() {
  return storage.getStore();
}

/**
 * The current context; throws outside a request so nothing ever runs against "no branch".
 * @returns {RequestContext}
 */
function require_() {
  const ctx = storage.getStore();
  if (!ctx) throw new Error('No request context: database access outside a branch request.');
  return ctx;
}

/**
 * Runs fn inside ctx.
 * @template T
 * @param {RequestContext} ctx
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
function run(ctx, fn) {
  return storage.run(ctx, fn);
}

module.exports = { createContext, current, require: require_, run };
