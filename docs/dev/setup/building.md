# Building and Packaging the Application

This document provides instructions on how to build the application from source, create a distributable installer, and publish it to GitHub Releases.

## Prerequisites

- Node.js (v22.x.x or later)
- npm (v10.x.x or later)
- A configured `GH_TOKEN` environment variable for publishing to GitHub.

## Building the Application

To build the application and create a distributable installer, follow these steps:

1. **Install Dependencies:**
   Open your terminal or command prompt, navigate to the project's root directory, and run the following command to install the required dependencies:
   ```bash
   npm install
   ```

2. **Run the Build Script:**
   Once the dependencies are installed, run the following command to build the application and package it into an installer:
   ```bash
   npm run dist
   ```

## Publishing to GitHub Releases

To publish a new release to GitHub, you need to have a `GH_TOKEN` (GitHub token) environment variable set up with the `repo` scope.

1. **Create a new version:**
   - Bump the `version` in `package.json`.
   - Commit and push your changes to the `main` branch.
   - Create a new git tag for the version (e.g., `git tag v1.0.1`).
   - Push the tag to GitHub (e.g., `git push origin v1.0.1`).

2. **Run the publish command:**
   After building the application with `npm run dist`, you can publish the release to GitHub by running:
   ```bash
   npm run dist -- --publish always
   ```
   Alternatively, you can configure electron-builder to always publish by adding `--publish always` to the `dist` script in `package.json`.

   Electron Builder will then create a new release on GitHub, upload the installer artifacts, and generate a `latest.yml` file for the auto-updater.

## Auto-Update System

The application is configured to automatically check for updates when it starts.

### How it Works

1.  **Check for Updates:** When the application is launched, it silently checks for a new release on GitHub.
2.  **Download in Background:** If a new version is available, it will be downloaded in the background without interrupting the user.
3.  **Notification:** Once the download is complete, the user will see a notification with an "Install" button.
4.  **Install and Restart:** Clicking "Install" will quit the current application, install the new version, and restart the application.

This ensures a seamless and secure update process for all users.

## Releasing with GitHub Actions

`.github/workflows/release.yml` builds the Windows installer on GitHub's Windows machines, so a
release needs no Windows PC and no token (it uses the workflow's own `GITHUB_TOKEN`).

1. Set the version in `package.json` (e.g. `1.4.0-beta.1`), commit, and push to `main`.
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
