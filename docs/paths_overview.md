# Path Handling in Electron + Vite

This document outlines the best practices for handling paths in an Electron application that uses Vite as the bundler for the renderer process. Correctly managing paths is critical because they behave differently in the development environment versus the packaged production application.

## The Core Problem

In development, files are loaded from their original locations in the source tree. In a packaged production app, files are bundled into a single archive (an `.asar` file), and paths become relative to the application's executable. A path that works in development (e.g., `../assets/icon.png`) will break in production if not handled correctly.

We must distinguish between two types of paths:
1.  **Compile-Time Paths:** These are the paths used in `import` and `require()` statements to link modules together. They are resolved by the bundler (Vite/Rollup) or the Node.js runtime at build time.
2.  **Runtime Paths:** These are paths used to access the filesystem *while the application is running*. This includes accessing databases, writing logs, reading user-generated content, or loading static assets like icons.

---

## 1. Compile-Time Paths (Imports & Requires)

For linking modules in your code, you should **never** use `path.join`. These paths are not dynamic; they are part of the static code structure.

### For the Renderer Process (Vite)

The renderer process code (in `src/renderer`) is bundled by Vite.

- **Best Practice:** Use Vite's **path aliasing** feature. This makes imports cleaner, easier to maintain, and independent of the file's location.

- **How-to:** Configure `resolve.alias` in `vite.config.js`:
  ```javascript
  // vite.config.js
  import { defineConfig } from 'vite';
  import path from 'path';

  export default defineConfig({
    // ... other configs
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
        '@renderer': path.resolve(__dirname, './src/renderer'),
        '@main': path.resolve(__dirname, './src/main'),
        '@db': path.resolve(__dirname, './src/db'),
      },
    },
  });
  ```
- **Usage:**
  ```javascript
  // Instead of: import MyComponent from '../../components/MyComponent';
  import MyComponent from '@renderer/components/MyComponent';

  // Instead of: import { someUtil } from '../../../utils';
  import { someUtil } from '@/utils';
  ```

### For the Main Process (Node.js)

The main process files (in `src/main`) are not bundled by Vite but are run directly by Electron's Node.js runtime. Vite aliases do not work here.

- **Best Practice:** Use **static relative paths**. They are simple, efficient, and universally understood by Node.js.

- **Usage:**
  ```javascript
  // Correct:
  const db = require('../db/db');
  const { registerUserHandlers } = require('./handlers/userHandlers');

  // Incorrect (DO NOT DO THIS):
  // const db = require(path.join(__dirname, '..', 'db', 'db'));
  ```

---

## 2. Runtime Paths (Filesystem Access)

For accessing files and directories while the app is running, you **must** use absolute paths constructed dynamically with `path.join`. This is the only way to ensure the path points to the correct location in both development and production.

### Key Electron APIs & Variables

- **`app.isPackaged`**: A boolean that is `true` when the application is running from a packaged archive. Use this to create different paths for dev and prod if necessary.

- **`app.getPath(name)`**: The most reliable method for getting standard system directories. Always use this for user-specific data.
  - `app.getPath('userData')`: The primary location for storing application state, databases, and configuration files.
  - `app.getPath('documents')`: For user-facing files they might want to access directly.
  - `app.getPath('logs')`: For application log files.
  - `app.getPath('temp')`: For temporary files.

- **`__dirname`**:
  - **In Development**: The absolute path to the directory containing the currently executing script.
  - **In Production**: The absolute path to the directory containing the script *inside the .asar archive*. It is read-only. Useful for accessing assets bundled with your app.

- **`process.resourcesPath`**:
  - **In Development**: Points to the `node_modules/electron/dist/resources` directory.
  - **In Production**: Points to the `resources` directory inside the application's installation folder (alongside the `.asar` archive). This is the best place to put external assets (like executables or templates) that should not be bundled inside the `.asar` file.

### Example: Accessing the Database

The database file should live in the `userData` directory so the application has write permissions.

```javascript
// src/db/db.js
const { app } = require('electron');
const path = require('path');

// The most robust way to get the database path
const dbPath = path.join(app.getPath('userData'), 'app_database.db');

// Now use dbPath to connect...
```

By following these guidelines, we can ensure that paths are handled consistently and reliably across the entire application, in both development and production environments.
