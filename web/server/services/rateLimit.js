// In-memory rate limits for logins and invitation links (one server process).

const { config } = require('../config');

const buckets = new Map(); // key -> { count, resetAt, lockedUntil }

/**
 * A fixed-window counter.
 * @param {string} key
 * @param {number} limit - Attempts allowed per window.
 * @param {number} windowMs
 * @returns {{allowed: boolean, retryAfterSec: number}}
 */
function hit(key, limit, windowMs) {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs, lockedUntil: 0 };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  return {
    allowed: bucket.count <= limit * config.rateLimitScale,
    retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000),
  };
}

/** Whether a key is locked (after too many failures). */
function lockedFor(key) {
  const bucket = buckets.get(key);
  if (!bucket || !bucket.lockedUntil) return 0;
  const left = bucket.lockedUntil - Date.now();
  return left > 0 ? Math.ceil(left / 1000) : 0;
}

/**
 * Counts a failure; locks the key for lockMs after maxFailures within lockMs.
 * The lock is per account name and branch, so one person cannot lock out a whole branch.
 */
function fail(key, maxFailures = 5, lockMs = 5 * 60 * 1000) {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + lockMs, lockedUntil: 0 };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  if (bucket.count >= maxFailures) {
    bucket.lockedUntil = now + lockMs;
    bucket.resetAt = bucket.lockedUntil;
  }
}

function clear(key) {
  buckets.delete(key);
}

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now && bucket.lockedUntil <= now) buckets.delete(key);
  }
}, 60 * 1000).unref();

module.exports = { hit, fail, lockedFor, clear };
