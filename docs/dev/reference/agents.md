# AGENTS.md

This document is intended for AI agents to provide a quick overview of the project structure, development workflow, and key files.

## Project Overview

This is an Electron desktop application for managing Quranic associations. It's built with a React frontend (using Vite) and a Node.js backend (the Electron main process). Data is stored locally in a SQLite database.

- **Frontend:** React, Vite, Bootstrap
- **Backend:** Electron, Node.js
- **Database:** SQLite
- **Packaging:** electron-builder

## Project Structure

The source code is located in the `src/` directory, with a clear separation between the Electron main process and the React renderer process.

- `src/main/`: Electron main process code.
  - `src/main/index.js`: Main entry point for Electron. Manages windows and application lifecycle.
  - `src/main/preload.js`: Securely exposes backend functionality to the frontend via `contextBridge`.
  - `src/main/handlers/`: Contains all the business logic for the application, organized by feature (e.g., `studentHandlers.js`, `classHandlers.js`). **This is where most backend logic lives.**
  - `src/main/financialHandlers.js`: Contains all business logic for the financial module.
- `src/renderer/`: React frontend code.
  - `src/renderer/pages/`: Top-level page components for each major feature.
  - `src/renderer/components/`: Reusable React components.
  - `src/renderer/App.jsx`: Main React component, handles routing.
- `src/db/`: Database-related files.
  - `src/db/schema.js`: The **single source of truth** for the database schema.
  - `src/db/migrations/`: Contains SQL scripts for applying changes to the database schema.
- `docs/`: Contains all project documentation.
   - `docs/user/`: Arabic manuals for end-users.
   - `docs/dev/`: English technical specifications and guides.

## Development Workflow

1.  **Install dependencies:**
    ```bash
    npm install
    ```
2.  **Run the development server:**
    This command starts both the Vite server for the frontend and the Electron app.
    ```bash
    npm run dev
    ```

## IPC / API Calls

The frontend communicates with the backend via IPC channels. The API is namespaced by feature.

- **Example:** To get all students, the frontend calls `window.electronAPI.invoke('students:get')`.
- **Location of Handlers:** The logic for these channels is defined in the `src/main/handlers/` and `src/main/financialHandlers.js` files. To understand what a channel does, find its `ipcMain.handle` definition in these files.
- **Preload Script:** The channels are exposed to the renderer in `src/main/preload.js`.

## Building the Application

To create a distributable installer, run:

```bash
npm run dist
```

The output will be in the `release/` directory.

## Testing

The project uses Jest for testing.

- **Run tests:**
  ```bash
  npm test
  ```
- **Test files:** Located in the `tests/` directory. They often mock Electron and database dependencies.

## Key Files to Edit for Common Tasks

- **Adding a new backend feature:**
  1.  Create a new handler function in the appropriate file in `src/main/handlers/`.
  2.  Register the new IPC channel using `ipcMain.handle` in the same file.
  3.  Expose the new channel in `src/main/preload.js` under the `electronAPI`.
  4.  Call the new channel from the React frontend using `window.electronAPI.invoke()`.
- **Changing the database schema:**
  1.  Do NOT edit `src/db/schema.js` directly for existing installations.
  2.  Create a new migration file in `src/db/migrations/` with the `ALTER TABLE` statements (e.g., `009-add-new-column.sql`). The migration runner will apply it automatically on startup.
- **Changing the UI:**
  1.  Identify the correct page in `src/renderer/pages/`.
  2.  Modify the relevant React components in `src/renderer/components/`.
  3.  Styling is done with Bootstrap classes and custom CSS in `src/renderer/styles/`.
