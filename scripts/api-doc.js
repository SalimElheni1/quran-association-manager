/**
 * Regenerates the channel reference in docs/dev/specs/api.md from the code, so it cannot drift:
 * every ipcMain.handle/on channel registered at runtime, the window.electronAPI method that calls
 * it (src/main/preload.js), the roles allowed by src/main/ipcSecurity.js, and where it lives.
 *
 * Usage: npm run docs:api
 */
const fs = require('fs');
const path = require('path');
const { getPolicy } = require('../src/main/ipcSecurity');

const ROOT = path.join(__dirname, '..');
const MAIN = path.join(ROOT, 'src', 'main');
const DOC = path.join(ROOT, 'docs', 'dev', 'specs', 'api.md');
const START = '<!-- api-doc:start -->';
const END = '<!-- api-doc:end -->';

function listJs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name.startsWith('__') ? [] : listJs(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

const files = listJs(MAIN).map((file) => ({ file, source: fs.readFileSync(file, 'utf8') }));
const allSource = files.map((f) => f.source).join('\n');

// A register function that nothing calls registers nothing at runtime.
function isCalled(name) {
  const calls = allSource.match(new RegExp(`\\b${name}\\(`, 'g')) || [];
  const definitions = allSource.match(new RegExp(`function ${name}\\(`, 'g')) || [];
  return calls.length > definitions.length;
}

const channels = new Map();
const unregistered = new Set();
for (const { file, source } of files) {
  const registration = /ipcMain\.(?:handle|on)\(\s*['"]([^'"]+)['"]/g;
  let match;
  while ((match = registration.exec(source))) {
    const before = source.slice(0, match.index);
    const enclosing = [...before.matchAll(/^(?:async )?function (\w+)\(/gm)].pop();
    const fn = enclosing && enclosing[1];
    if (fn && /^register\w+/.test(fn) && !isCalled(fn)) {
      unregistered.add(`\`${match[1]}\` (${path.relative(ROOT, file)}, \`${fn}\` is never called)`);
      continue;
    }
    channels.set(match[1], path.relative(MAIN, file).replace(/\\/g, '/'));
  }
}

const preload = fs.readFileSync(path.join(MAIN, 'preload.js'), 'utf8');
const methods = new Map();
const exposed =
  /(\w+):\s*(?:async\s*)?(?:\([^)]*\)|\w+)\s*=>\s*(?:\/\/[^\n]*\n\s*)*(?:\{[^}]*?)?ipcRenderer\.(?:invoke|send)\(\s*['"]([^'"]+)['"]/g;
let m;
while ((m = exposed.exec(preload))) {
  if (!methods.has(m[2])) methods.set(m[2], m[1]);
}

function access(channel) {
  const policy = getPolicy(channel);
  if (policy.public) return 'Public (before login)';
  if (policy.roles) return policy.roles.join(', ');
  return 'Any logged-in user';
}

function group(channel) {
  const [prefix] = channel.split(/[:-]/);
  return prefix;
}

const byGroup = new Map();
for (const channel of [...channels.keys()].sort()) {
  const key = group(channel);
  if (!byGroup.has(key)) byGroup.set(key, []);
  byGroup.get(key).push(channel);
}

const lines = [START, '', `${channels.size} channels.`, ''];
for (const [key, list] of [...byGroup.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  lines.push(
    `### ${key}`,
    '',
    '| Channel | `window.electronAPI` | Allowed | File |',
    '|---|---|---|---|',
  );
  for (const channel of list) {
    const method = methods.get(channel);
    lines.push(
      `| \`${channel}\` | ${method ? `\`${method}\`` : '—'} | ${access(channel)} | \`${channels.get(channel)}\` |`,
    );
  }
  lines.push('');
}

const missing = [...methods.keys()].filter((channel) => !channels.has(channel)).sort();
if (missing.length || unregistered.size) {
  lines.push('### Loose ends', '');
  for (const channel of missing) {
    lines.push(
      `- \`${methods.get(channel)}\` in preload.js calls \`${channel}\`, which has no handler.`,
    );
  }
  for (const entry of [...unregistered].sort()) lines.push(`- Not registered: ${entry}.`);
  lines.push('');
}
lines.push(END);

const doc = fs.readFileSync(DOC, 'utf8');
const start = doc.indexOf(START);
const end = doc.indexOf(END);
if (start === -1 || end === -1) throw new Error(`${DOC} has no ${START} / ${END} markers.`);
fs.writeFileSync(DOC, doc.slice(0, start) + lines.join('\n') + doc.slice(end + END.length));
console.log(`Wrote ${channels.size} channels to ${path.relative(ROOT, DOC)}.`);
