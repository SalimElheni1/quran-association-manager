/**
 * Opens app data preserved by the real-world e2e scenario in the real app, so you can
 * browse what the tests created.
 *
 *   npm run e2e:open-data                      # data after phase 2 (restore + continued work)
 *   npm run e2e:open-data -- 01-seed           # data right after phase 1 (the seed)
 *
 * The app runs in its e2e mode against a COPY of the preserved data (your real app data is
 * never touched) and loads the built renderer, so run `npm run build` first if needed.
 */
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const phase = process.argv[2] || '02-continue';
const source = path.join(ROOT, 'e2e-artifacts', 'realworld', phase, 'app-data');

if (!fs.existsSync(source)) {
  console.error(`No preserved app data at ${source}. Run: npm run test:e2e:realworld`);
  process.exit(1);
}
if (!fs.existsSync(path.join(ROOT, 'dist', 'renderer', 'index.html'))) {
  console.error('Renderer build not found. Run: npm run build');
  process.exit(1);
}

// Work on a copy so browsing never changes the preserved artifacts.
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), `qbm-${phase}-`));
fs.cpSync(source, workDir, { recursive: true });
console.log(`Opening a copy of ${path.relative(ROOT, source)} (${workDir})`);
console.log('Credentials: e2e-artifacts/realworld/README.md');

const electron = require('electron');
const child = spawn(electron, ['.', '--password-store=basic'], {
  cwd: ROOT,
  stdio: 'inherit',
  // The key store was written with the "basic" password store, so the same flag is
  // needed to unlock the database.
  env: { ...process.env, QBM_E2E: '1', QBM_E2E_USER_DATA: workDir },
});
child.on('exit', (code) => process.exit(code ?? 0));
