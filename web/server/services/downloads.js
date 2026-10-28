// Files a handler wrote through dialog.showSaveDialog (exports, templates, backups). The
// browser fetches each one once, with the session that made it, within a few minutes.

const fs = require('fs');
const path = require('path');
const { config } = require('../config');

const TTL_MS = 15 * 60 * 1000;
const entries = new Map(); // id -> { path, name, sessionId, expiresAt }

/**
 * Registers the files of a finished request; returns the ones that were actually written.
 * @param {{id: string, path: string, name: string}[]} files
 * @param {string|null} sessionId
 * @returns {{id: string, name: string}[]}
 */
function register(files, sessionId) {
  const out = [];
  for (const file of files || []) {
    if (!fs.existsSync(file.path)) {
      fs.rm(path.dirname(file.path), { recursive: true, force: true }, () => {});
      continue;
    }
    entries.set(file.id, { ...file, sessionId, expiresAt: Date.now() + TTL_MS });
    out.push({ id: file.id, name: file.name });
  }
  return out;
}

/** Adds a file written by web code (not through a dialog). */
function add(filePath, name, sessionId) {
  const id = path.basename(path.dirname(filePath));
  entries.set(id, { id, path: filePath, name, sessionId, expiresAt: Date.now() + TTL_MS });
  return { id, name };
}

/** A new empty folder for a generated file. */
function newFilePath(name) {
  const id = require('crypto').randomUUID();
  const dir = path.join(config.dataDir, 'downloads', id);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return path.join(dir, name);
}

/** The file for this session, removed from the list (one download per file). */
function take(id, sessionId) {
  const entry = entries.get(id);
  if (!entry || entry.sessionId !== sessionId || entry.expiresAt < Date.now()) return null;
  entries.delete(id);
  return entry;
}

function remove(entry) {
  fs.rm(path.dirname(entry.path), { recursive: true, force: true }, () => {});
}

function cleanup() {
  const now = Date.now();
  for (const [id, entry] of entries) {
    if (entry.expiresAt < now) {
      entries.delete(id);
      remove(entry);
    }
  }
  const root = path.join(config.dataDir, 'downloads');
  fs.readdir(root, (err, names) => {
    if (err) return;
    for (const name of names) {
      if (entries.has(name)) continue;
      const dir = path.join(root, name);
      fs.stat(dir, (statErr, stat) => {
        if (!statErr && now - stat.mtimeMs > TTL_MS * 2) fs.rm(dir, { recursive: true, force: true }, () => {});
      });
    }
  });
}

setInterval(cleanup, 5 * 60 * 1000).unref();

module.exports = { register, add, newFilePath, take, remove, cleanup };
