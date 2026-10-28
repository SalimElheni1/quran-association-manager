// Files the browser uploads for a handler that would open a file dialog on the desktop (Excel
// import, logo, backup restore). Each upload belongs to the session that sent it and expires.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { config } = require('../config');

const TTL_MS = 60 * 60 * 1000;
const entries = new Map(); // id -> { path, sessionId, expiresAt, name, size }
const ID_PATTERN = /^upload:([0-9a-f-]{36})$/;

const uploadsDir = () => path.join(config.dataDir, 'uploads');

/** A safe file name for an uploaded file (its original name, without folders). */
function safeName(name) {
  // eslint-disable-next-line no-control-regex -- strips control characters from file names
  const base = path.basename(String(name || '')).replace(/[\u0000-\u001f<>:"/\\|?*]+/g, '_');
  return base && base !== '.' && base !== '..' ? base.slice(0, 180) : 'upload';
}

/**
 * Keeps an uploaded file (multer memory buffer) for the session.
 * @returns {{id: string, name: string, size: number}}
 */
function save(sessionId, file) {
  const uuid = crypto.randomUUID();
  const dir = path.join(uploadsDir(), uuid);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const name = safeName(file.originalname);
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, file.buffer, { mode: 0o600 });
  const id = `upload:${uuid}`;
  entries.set(id, {
    path: filePath,
    sessionId,
    expiresAt: Date.now() + TTL_MS,
    name,
    size: file.size,
  });
  return { id, name, size: file.size };
}

function lookup(id, sessionId) {
  const entry = entries.get(id);
  if (!entry || entry.sessionId !== sessionId || entry.expiresAt < Date.now()) return null;
  return entry;
}

/** The paths of the given uploads that belong to the session. */
function take(ids, sessionId) {
  return (Array.isArray(ids) ? ids : [])
    .map((id) => lookup(String(id), sessionId))
    .filter(Boolean)
    .map((entry) => entry.path);
}

/** Replaces "upload:<id>" strings in the arguments by the uploaded files' paths. */
function resolveArgs(args, sessionId, depth = 0) {
  const resolve = (value, level) => {
    if (typeof value === 'string' && ID_PATTERN.test(value)) {
      const entry = lookup(value, sessionId);
      return entry ? entry.path : value;
    }
    if (level >= 3 || !value || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map((v) => resolve(v, level + 1));
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = resolve(v, level + 1);
    return out;
  };
  return (args || []).map((a) => resolve(a, depth));
}

function cleanup() {
  const now = Date.now();
  for (const [id, entry] of entries) {
    if (entry.expiresAt < now) {
      entries.delete(id);
      fs.rm(path.dirname(entry.path), { recursive: true, force: true }, () => {});
    }
  }
  // Folders left by a previous run of the server.
  fs.readdir(uploadsDir(), (err, names) => {
    if (err) return;
    for (const name of names) {
      const dir = path.join(uploadsDir(), name);
      fs.stat(dir, (statErr, stat) => {
        if (!statErr && now - stat.mtimeMs > TTL_MS * 2)
          fs.rm(dir, { recursive: true, force: true }, () => {});
      });
    }
  });
}

setInterval(cleanup, 10 * 60 * 1000).unref();

module.exports = { save, take, resolveArgs, lookup, cleanup };
