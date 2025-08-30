# Building and Packaging the Application

This document explains the process of building the application from source and creating distributable installers for Windows, macOS, and Linux.

## Tech Stack

The build process uses [Electron Forge](https://www.electronforge.io/) combined with [Vite](https://vitejs.dev/) to handle the bundling of the main and renderer processes.

-   **Electron Forge**: The core tool for packaging and creating installers.
-   **Vite**: The build tool used to transpile and bundle the React frontend (renderer process) and the Electron main process code.

## Prerequisites

-   Node.js (version specified in `package.json`)
-   NPM

## Development

To run the application in development mode with hot-reloading for both the main and renderer processes, use the following command:

```bash
npm start
```

This command utilizes Electron Forge's `start` script, which runs Vite in the background to serve the renderer and main processes.

## Building Installers

To create the distributable installers for your current operating system, run the following command:

```bash
npm run make
```

This command will trigger the `electron-forge make` process. The output will be placed in the `/out` directory.

The build is configured in `forge.config.js` to create the following types of installers:
-   **Windows**: Squirrel.Windows (`.exe` installer)
-   **macOS**: DMG (`.dmg` disk image)
-   **Linux**: DEB (`.deb`) and RPM (`.rpm`) packages

## Path Alias Configuration

The project uses path aliases (e.g., `@/`, `@renderer`, `@main`, `@db`) to simplify module imports. These aliases must work correctly in both the renderer and main processes.

This is achieved by using Vite to build both processes.

-   **`vite.renderer.config.js`**: This is the Vite configuration for the renderer process (the React application). It includes the necessary alias definitions.
-   **`vite.main.config.js`**: This is a separate Vite configuration specifically for the main process. It mirrors the alias definitions from the renderer's config, ensuring that `import` and `require` statements with aliases are correctly resolved when the main process code is transpiled.
-   **`vite.preload.config.js`**: A similar configuration for the preload script.

The `@electron-forge/plugin-vite` is configured in `forge.config.js` to use these separate configuration files for the different parts of the application, ensuring that all code is correctly processed before being packaged.
