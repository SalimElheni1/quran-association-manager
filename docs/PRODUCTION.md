# Production Build and Release Guide

This document outlines the process for creating a production-ready build of the Quran Association Manager application.

## Prerequisites

- Node.js (version specified in `.nvmrc` if available)
- npm
- A properly configured `.env` file at the project root.

## Environment Variables

The application requires a `.env` file in the project root for building. This file is **not** included in the final package but is used during the build process and for running in development mode.

A `.env.example` file is provided. Copy it to `.env` and fill in the values:

```bash
cp .env.example .env
```

The following variables are required:

- `JWT_SECRET`: A long, random, and secret string used to sign authentication tokens. This is critical for security.
- `SUPERADMIN_USERNAME`: The username for the initial superadministrator account.
- `SUPERADMIN_PASSWORD`: The password for the initial superadministrator account.
- `SUPERADMIN_EMAIL`: The email for the initial superadministrator account.
- `SUPERADMIN_FIRST_NAME`: The first name for the initial superadministrator account.
- `SUPERADMIN_LAST_NAME`: The last name for the initial superadministrator account.

**Note:** The superadmin is only created on the very first run when the database is initialized.

## Building for Production

To create production installers for all configured platforms (Windows and Linux), run the following command from the project root:

```bash
npm run dist
```

This command will:
1.  Run `npm run build`, which uses Vite to build and bundle the React frontend. The output is placed in the `dist/renderer` directory.
2.  Run `electron-builder` to package the Electron application.

The final installers and portable packages will be located in the `release/` directory.

## Build Outputs

- **Windows:**
  - `Quran Branch Manager Setup-x.x.x.exe` (NSIS Installer)
  - `Quran Branch Manager-x.x.x-win.zip` (Portable version)
- **Linux:**
  - `Quran Branch Manager-x.x.x.AppImage` (AppImage)
  - `quran-branch-manager_x.x.x_amd64.deb` (Debian package)

The version number `x.x.x` corresponds to the version specified in `package.json`.
