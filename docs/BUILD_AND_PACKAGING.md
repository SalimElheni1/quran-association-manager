# Build and Packaging

This document outlines the process for building and packaging the Quran Branch Manager application.

## Packaging Tool

The project uses **`electron-builder`** to package the application for different platforms.

## Reasons for Choosing `electron-builder`

`electron-builder` was chosen for the following reasons:

- **Robust and Mature:** It is a well-established and widely-used tool for packaging Electron applications.
- **Fine-grained Control:** It provides a `files` configuration option in `package.json` which allows for precise control over which files are included in the final package. This was the key to solving the issue of the large package size, as it prevents development dependencies and unnecessary files from being bundled.
- **Multi-platform Support:** It can build distributables for Windows, macOS, and Linux.
- **Auto-updates and GitHub Releases:** It has built-in support for publishing releases to GitHub and integrating auto-update functionality into the application, which was a key requirement for the project.

## Packaging Steps

To package the application, follow these steps:

1.  **Install Dependencies:**
    ```bash
    npm install
    ```

2.  **Build the Application:**
    The `dist` script in `package.json` will build the application. It first runs `vite build` to prepare the frontend assets, and then runs `electron-builder`.

    ```bash
    npm run dist
    ```
    This will create the distributables in the `release` directory.

### Building for Windows on Linux

To build the Windows installer (`.exe`) on a Linux machine, you need to have `wine` and `mono` installed. On Debian-based systems, you can install them with the following command:

```bash
sudo dpkg --add-architecture i386 && sudo apt-get update && sudo apt-get install -y wine32 mono-complete
```

If you encounter issues with the `wine` environment, the most reliable way to build for Windows is to use a Windows machine or a CI/CD service (like GitHub Actions) with a Windows runner.
