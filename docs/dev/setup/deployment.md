# Deployment Guide

How the app gets onto a branch's computer and how its data is kept safe. Building the installer
and publishing a release are covered in [building.md](building.md).

## Supported Platform

- **Windows 10/11, x64.** The installer is an NSIS setup (`QuranBranchManager Setup <version>.exe`).
- The app runs from source on Linux and macOS for development (`npm run dev`) and for the e2e
  tests, but no installer is built for them.

## Installing

1. Download the installer from the
   [GitHub releases](https://github.com/SalimElheni1/quran-association-manager/releases).
   Pre-releases (`-beta`, `-rc`) are for testing.
2. Run it. The installer is not code-signed, so Windows SmartScreen shows a warning:
   **More info → Run anyway**. The installation folder can be changed; desktop and Start menu
   shortcuts are created.
3. On first start the app asks for the **first superadmin account** (no default password
   exists). That user then creates the other accounts and roles from the users page.

Nothing else needs configuring: the installed app generates its database encryption key
(protected by Windows through Electron's `safeStorage`) and its session secret on first run. No
`.env` file is used outside development.

## Where the Data Lives

Everything is in the app's user-data folder (Electron's `userData`, under `%APPDATA%`):

- `quran_assoc_manager.sqlite`: the encrypted database.
- The key store files (the database key, protected by Windows for that user account).
- `app-logs.txt`: the application log.

Because the key is protected by the Windows account, **copying the database file to another
computer does not work**. Use a backup instead.

## Backups

In **الإعدادات → النسخ الاحتياطي**:

- **Association transfer key («رمز النقل الموحد للمؤسسة»)**: set it first. Backups are encrypted with
  it, so they can be restored on any computer that knows the key. Without it, backups use this
  computer's own key and can only be restored here; the tab warns while the field is empty.
  Keep the key somewhere safe: a backup cannot be opened without it.
- **Automatic backups**: enable them, choose daily / weekly / monthly and the time, and pick a
  folder, ideally on a USB drive or a synced folder rather than the same disk.
- **«نسخ احتياطي الآن»**: a backup on demand (`.qdb` file).

Backups are AES-256-GCM encrypted, which also detects changes: a modified or corrupted file is
refused on restore.

## Moving to a New Computer

1. On the old computer, make sure the transfer key is set, then make a backup.
2. Install the app on the new computer and create a superadmin.
3. In **النسخ الاحتياطي**, use **«استرجاع من نسخة احتياطية...»**, choose the backup file, and
   enter your password and the transfer key («رمز النسخة الاحتياطية») when asked. The app
   restarts on the restored data, which brings its own users, so log in with an account from
   the old computer afterwards.

## Upgrading

Download the new installer and run it over the existing installation. The data folder is kept
(`deleteAppDataOnUninstall: false`), and database migrations run automatically on the next
start. Make a backup before upgrading to a pre-release.

There is no auto-updater; users are told about new versions and install them by hand.

## Uninstalling

Uninstall from Windows settings. The data folder stays, so reinstalling finds the same data.
To remove the data too, delete the app's folder under `%APPDATA%` after uninstalling (make a
backup first if the data may be needed).

## Troubleshooting

- **SmartScreen blocks the installer**: expected for an unsigned installer; see "Installing".
- **"Backup can't be restored"**: the transfer key does not match the one the backup was made
  with, or the backup was made without a transfer key on another computer.
- **Anything else**: check `app-logs.txt` in the data folder; see also
  [docs/user/troubleshooting.md](../../user/troubleshooting.md) (Arabic) and
  [docs/dev/troubleshooting.md](../troubleshooting.md).
