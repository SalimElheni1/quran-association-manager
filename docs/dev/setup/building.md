# Building and Packaging the Application

How to build the Windows installer, locally or with GitHub Actions, and publish a release.

## Prerequisites

- Node.js (v22.x.x or later)
- npm (v10.x.x or later)
- To build the installer locally: Windows (x64). `npm run dist` builds for Windows only.

## Building Locally

1. **Install dependencies.** `postinstall` rebuilds the native SQLite module
   (`better-sqlite3-multiple-ciphers`) for Electron:

   ```bash
   npm install
   ```

2. **Generate the installer icon** (once; `release/` is ignored by git).
   `electron-builder.yml` reads `release/.icon-ico/icon.ico`, made from `build/icon.png`:

   ```bash
   "$(node -p "require('app-builder-bin').appBuilderPath")" icon --format ico --root build --input build/icon.png --out release/.icon-ico
   ```

3. **Build the renderer and package the installer:**

   ```bash
   npm run dist
   ```

   The installer (`.exe`) is written to `release/`.

`npm run build` alone builds the renderer into `dist/renderer`, which is what the e2e tests
run against.

## Releasing with GitHub Actions

`.github/workflows/release.yml` builds the Windows installer on GitHub's Windows machines, so a
release needs no Windows PC and no token (it uses the workflow's own `GITHUB_TOKEN`).

1. Set the version in `package.json` (e.g. `1.4.0-beta.1`), move the `[Unreleased]` entries of
   `CHANGELOG.md` under it, commit, and push to `main`.
2. Tag that commit with the same version and push the tag:

   ```bash
   git tag v1.4.0-beta.1
   git push origin v1.4.0-beta.1
   ```

3. The workflow runs lint and the unit tests, checks the tag matches `package.json`, builds the
   installer and publishes the release with it. Versions with a suffix (`-beta.1`, `-rc.1`) are
   published as pre-releases, plain versions (`1.4.0`) as releases. Follow it in the **Actions**
   tab.

To try an installer before releasing it: **Actions → Release (Windows) → Run workflow**, leave
"publish" unticked, then download the installer from the run's **Artifacts**.

Publishing from a local machine is not set up: `electron-builder.yml` has no `publish` section
(the workflow passes it on the command line), so use the workflow.

## Updates

The app has no auto-updater. Users install a new version by downloading the installer from the
GitHub release and running it over the existing installation; the database lives in the user's
app data folder and is kept (`deleteAppDataOnUninstall: false`), and migrations run on the next
start.

## Code Signing

The installer is not code-signed, so Windows SmartScreen warns on first install ("More info →
Run anyway"). `npm run dist:ci` forces signing and fails without a certificate; it is not used by
the workflow.
