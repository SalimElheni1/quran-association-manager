# Technical Documentation: Quran Branch Manager

This document consolidates all technical aspects of the Quran Branch Manager application, providing a comprehensive reference for developers, architects, and technical stakeholders. It covers the project overview, development guide, technology stack, database schema, and API reference.

## 1. Project Overview

This section provides a high-level overview of the Quran Branch Manager application, outlining its purpose, target audience, core problems addressed, and key features.

### 1.1. Purpose of the Application

The Quran Branch Manager application is designed to modernize and streamline the administrative operations of Quranic associations, specifically the National Quran Association in Tunisia. Its primary goal is to transition from manual, paper-based, and Excel-driven workflows to a fully digital, centralized, and efficient system. The application will comprehensively manage student enrollment and tracking, teacher assignments, class scheduling, attendance monitoring, and generate detailed reports.

### 1.2. Target Audience

- **Primary:** Branch administrators who handle day-to-day operations.
- **Secondary:** Teachers who need to access student information and schedules.
- **Tertiary:** Regional managers who oversee multiple branches.

### 1.3. Core Problems Addressed

- Outdated manual, paper-based, and Excel-driven administrative workflows.
- Lack of a centralized system for managing student records, classes, and teachers.
- Inefficient processes for attendance monitoring and report generation.
- Difficulty in sharing information between branches and with the main organization.

### 1.4. Summary of Key Features

- Comprehensive management of student enrollment and tracking.
- Efficient teacher assignments and class scheduling.
- Automated attendance monitoring.
- Detailed report generation (PDF and Excel).
- User role management (Superadmin, Branch Admin, Teacher).
- Offline-first functionality with local data storage.
- Arabic language support with Right-to-Left (RTL) interface design.
- Scalability for future web-based expansion.
- Secure authentication using JSON Web Tokens (JWT).
- Robust security measures including password hashing and input validation.

### 1.5. Version Information

- **Version:** 1.0
- **As of:** August 2025

## 2. Design Decisions and Implementation Plans

This section provides insight into the design and implementation of major features.

### 2.1. Matricule System Implementation

A key feature implemented is the matricule (registration number) system for all core entities (students, teachers, users).

#### 2.1.1. Why a Matricule? (Benefits)

The previous system's reliance on auto-incrementing integer `id`s and user-provided data like `name` or `national_id` for identification was brittle and opaque. The matricule system addresses this by providing:

- **Reliability:** A unique, system-generated, and immutable matricule (e.g., `S-000001`) as the single source of truth.
- **Clarity:** A prefixed format (`S-` for students, `T-` for teachers, `U-` for users) for instant recognition.
- **Robust Imports:** Enables reliable "update-or-create" logic for Excel imports.
- **Improved Search:** A simple, guaranteed-unique value for searching.

#### 2.1.2. Alternatives Considered

- **Integer Keys (Current):** Simple but not suitable for external systems.
- **UUIDs (v4):** Globally unique but long, unreadable, and overkill for this application's needs.
- **Hashed Composite Keys:** Brittle, as changes to source data would change the key.
- **Prefixed Sequential ID (Proposed):** The best fit, offering readability and solving the import/export problem.

#### 2.1.3. Phased Rollout Plan

The implementation was planned in several phases:

1.  **Database & Migration:** Add a `matricule` column and back-populate it for all existing records.
2.  **Backend Logic:** Create a service to generate new matricules and update the `add` handlers.
3.  **Excel & IPC:** Update the import/export logic to be matricule-aware.
4.  **Frontend UI:** Display and allow searching by matricule.
5.  **Testing & Validation:** Add unit, integration, and E2E tests.

## 3. Development Guide

This section serves as the comprehensive and definitive resource for setting up, developing, and maintaining the Quran Branch Manager application. It provides a clear, accurate, and up-to-date roadmap for all developers, particularly those new to the project or the technologies involved.

### 2.1. Introduction and Purpose

This guide specifically addresses and rectifies several issues identified in previous documentation iterations, such as ambiguous versioning, incomplete setup instructions, and a lack of detailed explanations for junior developers. It incorporates the latest stable versions of key technologies as of August 2025, ensuring that the development environment is both modern and robust. Furthermore, it introduces best practices for security, testing, and project management, aiming to foster a collaborative and efficient development workflow.

### 2.2. Project Structure and Modular Organization

A well-defined and consistently applied project structure is paramount for any software project, especially one intended for long-term maintenance, scalability, and collaborative development. It significantly enhances readability, simplifies navigation, and enforces a clear separation of concerns, which is crucial for debugging and future expansions. The proposed structure for the `quran-branch-manager` project is designed with these principles in mind, promoting modularity and logical grouping of files. This structure ensures that different parts of the application can evolve independently, reducing interdependencies and making the codebase easier to manage.

```
quran-branch-manager/
├── public/                     # Static assets (index.html, icons, etc.)
├── src/                        # Main application source code
│   ├── main/                   # Electron main process code (handles native OS interactions, window management, IPC)
│   │   └── index.js            # Main Electron entry point for application startup and lifecycle management
│   │   └── preload.js          # Secure bridge between main and renderer processes (contextBridge)
│   ├── renderer/               # React frontend code (the user interface)
│   │   ├── assets/             # Images (g13.png, g247.png), fonts, global CSS variables, and other static media
│   │   ├── components/         # Reusable UI components (e.g., buttons, forms, modals, cards)
│   │   ├── contexts/           # React Context API providers for global state management (e.g., AuthContext, ThemeContext)
│   │   ├── hooks/              # Custom React hooks for encapsulating reusable logic (e.g., useAuth, useForm)
│   │   ├── layouts/            # Page layouts or templates (e.g., DashboardLayout, AuthLayout) for consistent page structure
│   │   ├── pages/              # Top-level page components, each representing a distinct view (e.g., StudentsPage, TeachersPage, DashboardPage)
│   │   ├── services/           # Abstraction layer for API calls, data fetching logic, and interactions with the main process (e.g., database operations)
│   │   ├── store/              # State management (e.g., Redux, Zustand, or simple React state management patterns) for application-wide data
│   │   ├── utils/              # General utility functions (e.g., date formatting, input validation, helper functions)
│   │   ├── App.js              # Main React component, typically handles routing and global layout
│   │   └── index.js            # React entry point, responsible for rendering the root React component
│   ├── db/                     # Database-related files (SQLite schema definition and interaction logic)
│   │   ├── schema.js           # SQLite database schema definition (CREATE TABLE statements)
│   │   └── db.js               # Database connection, initialization, and core query functions
│   ├── config/                 # Application configuration (e.g., constants, environment-specific settings, user roles, API endpoints)
│   └── styles/                 # Global styles, Bootstrap overrides, and other application-wide CSS
├── tests/                      # Unit, integration, and end-to-end tests for various parts of the application
├── .env                        # Environment variables (e.g., development flags, API keys, database paths) - NOT committed to version control
├── .gitignore                  # Specifies intentionally untracked files to ignore by Git
├── package.json                # Project metadata, dependencies, and npm scripts
├── README.md                   # Project documentation and quick start guide
└── electron-builder.yml        # Configuration file for Electron Builder, used for packaging and distributing the application
```

**Reasoning for this structure and its adherence to best practices:**

- **Clear Separation of Concerns:** The distinct `main/` and `renderer/` directories within `src/` are fundamental to Electron application development. `main/` encapsulates all Electron-specific logic, including window management, native API interactions, and direct database access. Conversely, `renderer/` houses the entire React frontend application, treating it essentially as a standard web application. This clear separation ensures that the Electron shell and the React UI can evolve independently, significantly improving modularity, testability, and maintainability.

- **Modularity and Logical Grouping:** Within `src/renderer/`, a type-based organization (e.g., `components/`, `pages/`, `services/`) is adopted. This approach groups similar types of files together, making it easy to locate specific assets or logic. For larger applications, a hybrid approach or a purely feature-based structure (grouping files by feature, e.g., `features/students/`, `features/teachers/`) might be considered, but for this project's scope, the current structure provides sufficient clarity and manageability.

- **Dedicated Data Layer (`db/`):** Centralizing database schema definitions (`schema.js`) and connection/query functions (`db.js`) within a `db/` directory is a critical best practice. This abstraction layer ensures that database interactions are consistent, can be easily modified without affecting other parts of the application, and facilitates the implementation of security measures like parameterized queries. It also simplifies database migration and version control.

- **Configuration Management (`config/`):** A dedicated `config/` directory for application-wide settings, constants, and role definitions promotes maintainability and flexibility. Hardcoding values throughout the codebase leads to significant technical debt and makes updates cumbersome. By centralizing configuration, developers can quickly adjust settings, manage different environments (development, production), and enforce consistency across the application. This approach also simplifies the implementation of role-based access control (RBAC) by providing a single source of truth for user roles and permissions.

- **Asset Management (`assets/`):** The inclusion of an `assets/` directory for images, fonts, and CSS variables is a standard practice in modern web development. This ensures that all static resources are organized and easily accessible. For the Quran Branch Manager, this is particularly relevant as it will house specific visual assets like `g13.png` and `g247.png`, which are integral to the application's visual identity and user experience, as discussed during the initial project planning phases.

- **Testing (`tests/`):** The presence of a `tests/` directory underscores the importance of automated testing. While this guide provides an overview, comprehensive testing methodologies (unit, integration, end-to-end) will be detailed in a separate `CONTRIBUTING.md` document. Its inclusion in the project structure signals a commitment to quality assurance. Comprehensive testing is a cornerstone of robust software development, ensuring that new features do not introduce regressions and that the application behaves as expected under various conditions.

- **Version Control and Environment Management:** Files like `.gitignore`, `package.json`, and `.env` are crucial for version control, dependency management, and environment-specific configurations. `.gitignore` prevents unnecessary files from being committed to the repository, keeping the codebase clean. `package.json` manages project dependencies and scripts, ensuring that all developers work with the same set of tools and libraries. The `.env` file allows for environment-specific variables (e.g., API keys, database paths) to be managed securely and outside of version control, which is a critical security best practice.

### 2.3. Development Environment Setup

This section provides a detailed, step-by-step guide to setting up your development environment for the Quran Branch Manager application. Adhering to these instructions will ensure a consistent and efficient development experience.

#### 2.3.1. Node.js Installation and Version Management

Node.js serves as the runtime environment for both the Electron main process and the React development server. Selecting the correct version and managing it effectively are crucial first steps.

**Best Practice: Node.js Version Management**

It is highly recommended to use a stable, Long Term Support (LTS) version of Node.js for new projects. As of August 9, 2025, **Node.js 22 LTS (e.g., v22.x.x or later)** is the preferred choice [1]. LTS releases receive extended maintenance and security updates, ensuring long-term stability and reducing the risk of compatibility issues with project dependencies. Using a version manager like `nvm` (Node Version Manager) is a best practice for easily switching between Node.js versions for different projects, preventing conflicts and ensuring consistent development environments across teams [2].

**Installation Steps:**

1.  **Download Node.js:** Visit the [official Node.js website](https://nodejs.org/) and download the recommended LTS installer for your operating system. Follow the installation instructions.

    - **Reference:** [1] Node.js Official Website: `https://nodejs.org/`

2.  **Verify Installation:** Open your terminal or command prompt and run the following commands to verify that Node.js and npm (Node Package Manager, which comes bundled with Node.js) are installed correctly:

    ```bash
    node -v
    npm -v
    ```

    The output should display the installed versions (e.g., `v22.x.x` for Node.js and `10.x.x` for npm).

3.  **Initialize Project Directory:** Create a new directory for your project and initialize a new npm project within it. This creates a `package.json` file, which will manage your project's dependencies and scripts.
    ```bash
    mkdir quran-branch-manager
    cd quran-branch-manager
    npm init -y
    ```
    The `npm init -y` command creates a `package.json` file with default values, streamlining the initialization process. This file is central to managing your project's dependencies and defining scripts for development and building.

#### 2.3.2. Electron Setup: Bridging Web Technologies with Desktop Capabilities

Electron is the core framework that transforms your React web application into a cross-platform desktop application. Proper setup and configuration are vital for security and maintainability.

**Best Practice: Pinning Electron Versions**

Always pin exact versions of your dependencies, including Electron (e.g., `electron@32.0.0`). Using `@latest` can lead to unexpected breaking changes when new versions are released, making your build process inconsistent and harder to debug, especially in team environments. Pinning versions ensures that all developers on a project use the exact same version, guaranteeing consistent behavior and build outputs [3].

**Installation Steps:**

1.  **Install Electron as a Development Dependency:**

    ```bash
    npm install --save-dev electron@32.0.0
    ```

    The `--save-dev` flag ensures that Electron is installed as a development dependency, meaning it's required for building and running the application during development but not included in the final production build, reducing the application's footprint.

2.  **Create Main Electron Entry Point (`src/main/index.js`):** This file is the heart of your Electron application. It manages the application lifecycle, creates browser windows, and handles native OS interactions. It also defines the `preload.js` script, which is critical for secure inter-process communication (IPC) between the Electron main process and the renderer process.

    ```javascript
    // src/main/index.js
    const { app, BrowserWindow, ipcMain } = require('electron');
    const path = require('path');

    function createWindow() {
      const mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800, // Minimum width to ensure usability
        minHeight: 600, // Minimum height to ensure usability
        webPreferences: {
          preload: path.join(__dirname, 'preload.js'), // Secure inter-process communication
          nodeIntegration: false, // CRITICAL: Keep false for security. Prevents renderer process from accessing Node.js APIs directly.
          contextIsolation: true, // CRITICAL: Keep true for security. Isolates preload scripts and Electron APIs from the renderer's global scope.
          enableRemoteModule: false, // DEPRECATED/CRITICAL: Ensure this is false or removed for security
        },
      });

      // Load the React app
      // In development, this will be your React dev server URL
      // In production, this will be the built React app file
      if (process.env.NODE_ENV === 'development') {
        mainWindow.loadURL('http://localhost:3000'); // Assuming React dev server runs on 3000
        mainWindow.webContents.openDevTools(); // Open DevTools in development for easier debugging
      } else {
        // For production, load the built React app from the 'renderer' directory
        mainWindow.loadFile(path.join(__dirname, '../renderer/dist/index.html'));
      }
    }

    app.whenReady().then(() => {
      createWindow();

      app.on('activate', () => {
        // On macOS, re-create a window when the dock icon is clicked and no other windows are open.
        if (BrowserWindow.getAllWindows().length === 0) {
          createWindow();
        }
      });
    });

    app.on('window-all-closed', () => {
      // Quit the app when all windows are closed, except on macOS (Cmd+Q).
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });

    // Example IPC communication (for secure interaction between renderer and main process)
    // This is where your renderer process can request data from SQLite via the main process
    ipcMain.handle('get-app-version', () => {
      return app.getVersion();
    });

    // You would add more ipcMain.handle calls here for database operations, file system access, etc.
    ```

**Best Practice Highlight: Electron Security**

The `webPreferences` in `BrowserWindow` are critical for maintaining a secure Electron application. Specifically:

- `nodeIntegration: false`: This is paramount for security. It prevents the renderer process (your React app) from directly accessing Node.js APIs and the file system. If set to `true`, malicious code injected into your frontend could potentially compromise the user's system.
- `contextIsolation: true`: This isolates preload scripts and Electron APIs from the renderer's global scope. It means that even if a vulnerability exists in your React code, it cannot directly access the Electron APIs exposed via the `preload.js` script, further enhancing security.
- `enableRemoteModule: false`: The `remote` module has been deprecated due to security concerns. Ensuring it's `false` or removed is a crucial step in securing your application. Always adhere to these security best practices to protect your users and your application from potential exploits [4].

**Reference:** [4] Electron Security Checklist: `https://www.electronjs.org/docs/latest/tutorial/security`

#### 2.3.3. Preload Script (`src/main/preload.js`): The Secure Bridge

The `preload.js` script runs in a sandboxed environment before the renderer process loads. It has access to both Node.js APIs and the `window` object, making it the ideal place to expose specific, controlled APIs to the renderer process without granting full Node.js access. This is crucial for security and is a fundamental pattern in secure Electron development.

**Best Practice Highlight: Secure IPC with `contextBridge`**

The `contextBridge` API is the recommended and most secure way to expose functionality from the main process to the renderer. It allows you to define a secure, isolated bridge, preventing arbitrary code execution and maintaining a strong security boundary between your application's parts. By exposing only the necessary functions and data, you minimize the attack surface and protect sensitive operations [5].

**Implementation:**

Create `src/main/preload.js` with the following content:

```javascript
// src/main/preload.js
const { contextBridge, ipcRenderer } = require(\'electron\');

contextBridge.exposeInMainWorld(\'electronAPI\', {
  // Example: Exposing a function to query the database securely
  dbQuery: (query, params) => ipcRenderer.invoke(\'db-query\', { query, params }),
  // Example: Exposing a function to get application version
  getAppVersion: () => ipcRenderer.invoke(\'get-app-version\'),
  // Add other secure IPC channels here as needed
});
```

**Reference:** [5] Electron `contextBridge` Documentation: `https://www.electronjs.org/docs/latest/api/context-bridge`

#### 2.3.4. React Frontend Setup with Vite

Vite is a next-generation frontend tooling that provides an extremely fast development server and optimizes the production build process for your React application.

**Best Practice: Pinning Vite and React Versions**

Similar to Electron, always pin exact versions of Vite and React (e.g., `vite@5.4.0`, `react@19.0.0`, `react-dom@19.0.0`). This ensures build consistency and avoids unexpected issues due to new releases [3].

**Installation Steps:**

1.  **Install React and Vite as Dependencies:**

    ```bash
    npm install react@19.0.0 react-dom@19.0.0
    npm install --save-dev vite@5.4.0 @vitejs/plugin-react
    ```

    `@vitejs/plugin-react` is the official plugin for React support in Vite.

2.  **Configure Vite (`vite.config.js`):** Create a `vite.config.js` file in the root of your project (or `src/renderer/` if you prefer a nested setup, adjusting paths accordingly).

    ```javascript
    // vite.config.js
    import { defineConfig } from \'vite\';
    import react from \'@vitejs/plugin-react\';

    export default defineConfig({
      plugins: [react()],
      base: \'./\', // Important for Electron to load assets correctly in production
      build: {
        outDir: \'dist\', // Output directory for production build
      },
      server: {
        port: 3000, // Ensure this matches the port in src/main/index.js
      },
    });
    ```

3.  **Create React Entry Point (`src/renderer/index.js` and `src/renderer/App.js`):**

    ```javascript
    // src/renderer/index.js
    import React from \'react\';
    import ReactDOM from \'react-dom/client\';
    import App from \'./App\';
    import \'./styles/index.css\'; // Your global styles

    ReactDOM.createRoot(document.getElementById(\'root\')).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
    ```

    ```javascript
    // src/renderer/App.js
    import React from \'react\';

    function App() {
      return (
        <div className="App">
          <h1>Welcome to Quran Branch Manager!</h1>
          <p>Your React app is running.</p>
        </div>
      );
    }

    export default App;
    ```

4.  **Update `public/index.html`:** Ensure your `public/index.html` has a `div` with `id="root"` (or similar) where the React app will be mounted. Vite will automatically inject the necessary script tags.

    ```html
    <!-- public/index.html -->
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Quran Branch Manager</title>
      </head>
      <body>
        <div id="root"></div>
        <script type="module" src="/src/renderer/index.js"></script>
      </body>
    </html>
    ```

#### 2.3.5. SQLite Database Setup

SQLite is the embedded relational database for local data storage. We will use the `sqlite3` Node.js driver to interact with it from the Electron main process.

**Best Practice: Parameterized Queries for SQL Injection Prevention**

Always use parameterized queries when interacting with your database. This is the most effective way to prevent SQL injection vulnerabilities, a critical security concern. Never concatenate user input directly into SQL queries [6].

**Reference:** [6] OWASP SQL Injection Prevention Cheat Sheet: `https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html`

**Installation Steps:**

1.  **Install `sqlite3`:**

    ```bash
    npm install sqlite3@5.1.7
    ```

2.  **Database Initialization (`src/db/db.js`):** This file will handle the database connection and schema initialization. The database file itself should be stored in a persistent, user-specific location, which Electron provides via `app.getPath(\'userData\')`.

    ```javascript
    // src/db/db.js
    const sqlite3 = require(\'sqlite3\').verbose();
    const path = require(\'path\');
    const { app } = require(\'electron\');

    let db;

    function initializeDatabase() {
      const userDataPath = app.getPath(\'userData\');
      const dbPath = path.join(userDataPath, \'quran_branch_manager.sqlite\');

      db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
          console.error(\'Could not connect to database\', err.message);
        } else {
          console.log(\'Connected to SQLite database at\', dbPath);
          createTables();
        }
      });
    }

    function createTables() {
      // Example table creation. Add all your schema definitions here.
      db.serialize(() => {
        db.run(`
          CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          );
        `);
        // Add other CREATE TABLE statements for students, teachers, classes, attendance, branches
        // Example for students table:
        db.run(`
          CREATE TABLE IF NOT EXISTS students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            age INTEGER,
            gender TEXT,
            enrollment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
            status TEXT DEFAULT \'active\',
            branch_id INTEGER,
            memorization_level TEXT,
            contact_info TEXT,
            parent_name TEXT,
            parent_contact TEXT,
            FOREIGN KEY (branch_id) REFERENCES branches(id)
          );
        `);
        console.log(\'Tables created or already exist.\');
      });
    }

    // Generic function to run queries securely
    function runQuery(sql, params = []) {
      return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
          if (err) {
            reject(err);
          } else {
            resolve({ id: this.lastID, changes: this.changes });
          }
        });
      });
    }

    // Generic function to get single row securely
    function getQuery(sql, params = []) {
      return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
          if (err) {
            reject(err);
          } else {
            resolve(row);
          }
        });
      });
    }

    // Generic function to get all rows securely
    function allQuery(sql, params = []) {
      return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows);
          }
        });
      });
    }

    module.exports = {
      initializeDatabase,
      runQuery,
      getQuery,
      allQuery,
    };
    ```

3.  **Integrate Database Initialization into Main Process:** Call `initializeDatabase()` from `src/main/index.js` when the app is ready.

    ```javascript
    // src/main/index.js (excerpt)
    const { initializeDatabase } = require(\'../db/db\'); // Adjust path as needed

    app.whenReady().then(() => {
      createWindow();
      initializeDatabase(); // Initialize the database

      app.on(\'activate\', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          createWindow();
        }
      });
    });
    ```

#### 2.3.6. UI Framework: Bootstrap 5 and React-Bootstrap

Bootstrap 5 provides a comprehensive set of responsive UI components, and React-Bootstrap re-implements them as React components, ensuring seamless integration and adherence to React paradigms. Crucially, Bootstrap 5 offers native Right-to-Left (RTL) support, which is essential for the Arabic UI.

**Installation Steps:**

1.  **Install Bootstrap and React-Bootstrap:**

    ```bash
    npm install bootstrap@5.3.3 react-bootstrap@2.10.4
    ```

2.  **Import Bootstrap CSS:** In your `src/renderer/index.js` (or a global CSS file), import Bootstrap CSS.

    ```javascript
    // src/renderer/index.js (excerpt)
    import \'bootstrap/dist/css/bootstrap.min.css\';
    // For RTL support, you might need to import the RTL specific CSS if not handled by dir="rtl" attribute
    // import \'bootstrap/dist/css/bootstrap.rtl.min.css\'; // Use this if you need explicit RTL CSS
    ```

3.  **Enable RTL:** Ensure your `public/index.html` has `dir="rtl"` and `lang="ar"` on the `<html>` tag for proper RTL rendering.

    ```html
    <!-- public/index.html (excerpt) -->
    <html lang="ar" dir="rtl"></html>
    ```

#### 2.3.7. Report Generation Libraries: PDFKit and ExcelJS

These libraries will be used in the Electron main process to generate PDF and Excel reports, respectively. Performing report generation in the main process avoids blocking the renderer process (UI) and allows direct file system access.

**Installation Steps:**

1.  **Install PDFKit and ExcelJS:**

    ```bash
    npm install pdfkit@0.15.0 exceljs@4.4.0
    ```

2.  **Example Usage (Main Process IPC Handler):**

    ```javascript
    // src/main/index.js (excerpt - within ipcMain.handle for report generation)
    const PDFDocument = require(\'pdfkit\');
    const ExcelJS = require(\'exceljs\');
    const fs = require(\'fs\');

    ipcMain.handle(\'generate-pdf-report\', async (event, data) => {
      const doc = new PDFDocument();
      const filePath = path.join(app.getPath(\'downloads\'), \'report.pdf\');
      doc.pipe(fs.createWriteStream(filePath));
      doc.fontSize(25).text(\'Student Report\', 100, 100);
      // Add more content based on \'data\'
      doc.end();
      return filePath;
    });

    ipcMain.handle(\'generate-excel-report\', async (event, data) => {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet(\'Students\');
      worksheet.columns = [
        { header: \'ID\', key: \'id\', width: 10 },
        { header: \'Name\', key: \'name\', width: 30 },
        // Add more columns
      ];
      worksheet.addRow({ id: 1, name: \'John Doe\' }); // Add data rows
      const filePath = path.join(app.getPath(\'downloads\'), \'report.xlsx\');
      await workbook.xlsx.writeFile(filePath);
      return filePath;
    });
    ```

#### 2.3.8. Authentication: JSON Web Tokens (JWT) and bcryptjs

For secure user authentication, we will use JWTs for session management and `bcryptjs` for password hashing. Since this is an offline-first desktop application, JWTs will be stored and validated locally.

**Best Practice: Secure Password Hashing**

Never store plain-text passwords. Always use a strong, adaptive hashing function like bcrypt to hash passwords before storing them. `bcryptjs` is a pure JavaScript implementation suitable for both main and renderer processes (though hashing should ideally happen in the main process or a secure backend if one existed) [7].

**Reference:** [7] OWASP Password Storage Cheat Sheet: `https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html`

**Installation Steps:**

1.  **Install `jsonwebtoken` and `bcryptjs`:**

    ```bash
    npm install jsonwebtoken@9.0.2 bcryptjs@2.4.3
    ```

2.  **Example Usage (Main Process - Login Handler):**

    ```javascript
    // src/main/index.js (excerpt - within ipcMain.handle for login)
    const jwt = require(\'jsonwebtoken\');
    const bcrypt = require(\'bcryptjs\');
    // Assume you have a function to get user from DB: getUserFromDb(username)

    ipcMain.handle(\'login\', async (event, { username, password }) => {
      const user = await getQuery(\'SELECT * FROM users WHERE username = ?\', [username]);
      if (user && bcrypt.compareSync(password, user.password)) {
        // User authenticated, generate JWT
        const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' }); // CRITICAL: Use an environment variable for the secret key
        // In a real app, store token securely (e.g., electron-store or OS keychain)
        return { success: true, token, user: { id: user.id, username: user.username, role: user.role } };
      } else {
        return { success: false, message: \'Invalid credentials\' };
      }
    });
    ```

#### 2.3.9. Local Storage: `electron-store`

`electron-store` is a simple way to persist user settings and application state. It uses JSON files and handles cross-platform differences automatically.

**Installation Steps:**

1.  **Install `electron-store`:**

    ```bash
    npm install electron-store@8.2.0
    ```

2.  **Example Usage (Main Process):**

    ```javascript
    // src/main/index.js (excerpt)
    const Store = require(\'electron-store\');
    const store = new Store();

    ipcMain.handle(\'set-setting\', (event, key, value) => {
      store.set(key, value);
    });

    ipcMain.handle(\'get-setting\', (event, key) => {
      return store.get(key);
    });
    ```

### 2.4. Development Workflow and Best Practices

This section outlines the recommended development workflow, including scripts for running the application, building for production, and incorporating modern best practices for code quality, testing, and continuous integration.

#### 2.4.1. Development Scripts (`package.json`)

Configure your `package.json` scripts to streamline development and build processes.

```json
// package.json (excerpt)
{
  "name": "quran-branch-manager",
  "version": "1.0.0",
  "main": "src/main/index.js",
  "scripts": {
    "start": "electron .",
    "react-dev": "vite --config src/renderer/vite.config.js",
    "dev": "concurrently \"npm run react-dev\" \"npm run start\"",
    "build-react": "vite build --config src/renderer/vite.config.js",
    "dist": "npm run build-react && electron-builder",
    "test": "jest",
    "lint": "eslint .",
    "format": "prettier --write ."
  },
  "devDependencies": {
    "electron": "32.0.0",
    "electron-builder": "24.13.3",
    "vite": "5.4.0",
    "@vitejs/plugin-react": "4.3.1",
    "concurrently": "8.2.2",
    "jest": "29.7.0",
    "eslint": "8.57.0",
    "prettier": "3.3.2"
  },
  "dependencies": {
    "react": "19.0.0",
    "react-dom": "19.0.0",
    "bootstrap": "5.3.3",
    "react-bootstrap": "2.10.4",
    "sqlite3": "5.1.7",
    "jsonwebtoken": "9.0.2",
    "bcryptjs": "2.4.3",
    "pdfkit": "0.15.0",
    "exceljs": "4.4.0",
    "electron-store": "8.2.0"
  }
}
```

**Explanation of Scripts:**

- `start`: Runs the Electron application directly, assuming `src/main/index.js` is the main entry point.
- `react-dev`: Starts the Vite development server for the React frontend.
- `dev`: Uses `concurrently` to run both `react-dev` and `start` simultaneously, providing a seamless development experience with live reloading for both frontend and backend changes.
- `build-react`: Builds the React frontend for production using Vite.
- `dist`: First builds the React frontend, then uses `electron-builder` to package the entire application for distribution (e.g., `.exe` for Windows, `.dmg` for macOS).
- `test`: Runs your test suite (e.g., Jest).
- `lint`: Runs ESLint to check for code quality issues.
- `format`: Runs Prettier to automatically format your code.

#### 2.4.2. Building and Packaging for Production

Electron Builder is a powerful tool for packaging and distributing your Electron application across various platforms. It handles code signing, auto-updates, and creates installers.

**Installation:** `electron-builder` is already included in the `devDependencies` in the `package.json` example above.

**Configuration (`electron-builder.yml`):** Create an `electron-builder.yml` file in your project root.

```yaml
# electron-builder.yml
appId: com.yourcompany.quranbranchmanager
productName: QuranBranchManager
copyright: Copyright © 2025 ${author}
files:
  - 'dist/**/*'
  - 'src/main/**/*'
  - 'package.json'
  - 'node_modules/**/*'

mac:
  category: 'public.app-category.utilities'
  target: 'dmg'

win:
  target: 'nsis'
  icon: 'build/icon.ico'

linux:
  target: 'AppImage'
  category: 'Utility'

directories:
  buildResources: 'build'
  output: 'release'
# Optional: Code signing configuration
# mac:
#   identity: "Developer ID Application: Your Company Name (XXXXXXXXXX)"
# win:
#   certificateFile: "./certs/your-cert.pfx"
#   certificatePassword: "your-cert-password"
```

**Explanation of Configuration:**

- `appId`, `productName`, `copyright`: Basic application metadata.
- `files`: Specifies which files from your project should be included in the final build. Crucially, this includes your built React app (`dist/**/*`), Electron main process files (`src/main/**/*`), `package.json`, and `node_modules`.
- `mac`, `win`, `linux`: Platform-specific configurations for targets (e.g., `dmg` for macOS, `nsis` for Windows installer, `AppImage` for Linux) and categories.
- `directories`: Defines where build resources are located and where the final output will be placed.
- `Code signing`: Essential for distributing applications securely. You will need to obtain developer certificates for macOS and Windows.

To build your application, run: `npm run dist`.

#### 2.4.3. Testing Strategy

Automated testing is crucial for ensuring the quality, reliability, and maintainability of the Quran Branch Manager application. A comprehensive testing strategy will include unit, integration, and end-to-end (E2E) tests.

- **Unit Tests:** Focus on individual functions, components, or modules in isolation. For React components, libraries like Jest and React Testing Library are ideal. For utility functions or database helper functions, Jest alone is sufficient.
- **Integration Tests:** Verify that different parts of the application work correctly together. This could involve testing the interaction between a React component and an IPC handler, or between an IPC handler and the SQLite database.
- **End-to-End (E2E) Tests:** Simulate real user scenarios to ensure the entire application flows as expected, from UI interactions to database operations. Tools like Playwright or Cypress are excellent choices for E2E testing Electron applications.

**Recommended Tools:**

- **Jest:** For unit and integration testing of JavaScript/TypeScript code.
- **React Testing Library:** For testing React components in a way that encourages good testing practices (testing user behavior, not implementation details).
- **Playwright:** For robust and reliable end-to-end testing of the Electron application.

**Example Test Script (`package.json`):**

```json
// package.json (excerpt)
"scripts": {
  "test": "jest",
  "test:e2e": "playwright test"
}
```

#### 2.4.4. Code Quality and Formatting

Maintaining consistent code quality and formatting is vital for collaborative development and long-term maintainability. ESLint and Prettier are indispensable tools for this purpose.

- **ESLint:** A static code analysis tool that identifies problematic patterns found in JavaScript code. It helps enforce coding standards, catch potential bugs, and ensure best practices.
- **Prettier:** An opinionated code formatter that automatically formats your code to adhere to a consistent style. This eliminates debates over formatting and allows developers to focus on writing logic.

**Installation:**

```bash
npm install --save-dev eslint prettier eslint-plugin-react eslint-config-prettier eslint-plugin-prettier
```

**Configuration (`.eslintrc.js` and `.prettierrc.js`):**

```javascript
// .eslintrc.js
module.exports = {
  env: {
    browser: true,
    es2021: true,
    node: true, // Enable Node.js global variables and Node.js scoping
  },
  extends: [
    \'eslint:recommended\',
    \'plugin:react/recommended\',
    \'plugin:prettier/recommended\',
  ],
  parserOptions: {
    ecmaFeatures: {
      jsx: true,
    },
    ecmaVersion: 12,
    sourceType: \'module\',
  },
  plugins: [
    \'react\',
    \'prettier\',
  ],
  rules: {
    // Custom rules or overrides
    \'react/react-in-jsx-scope\': \'off\', // For React 17+ JSX Transform
    \'prettier/prettier\': \'error\',
  },
  settings: {
    react: {
      version: \'detect\',
    },
  },
};
```

```javascript
// .prettierrc.js
module.exports = {
  semi: true,
  trailingComma: \'all\',
  singleQuote: true,
  printWidth: 100,
  tabWidth: 2,
};
```

**Integration with VS Code:** Install the ESLint and Prettier extensions in VS Code to enable automatic linting and formatting on save.

#### 2.4.5. Continuous Integration/Continuous Deployment (CI/CD)

Implementing CI/CD pipelines automates the build, test, and deployment processes, ensuring faster feedback loops, higher code quality, and more reliable releases. GitHub Actions is a popular choice for this.

**Benefits:**

- **Automated Testing:** Every code push triggers automated tests, catching bugs early.
- **Consistent Builds:** Ensures that the application is built consistently across all environments.
- **Faster Releases:** Automates the packaging and deployment process, enabling quicker delivery of new features and bug fixes.

**Example GitHub Actions Workflow (`.github/workflows/main.yml`):**

```yaml
# .github/workflows/main.yml
name: CI/CD

on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main

jobs:
  build-and-test:
    runs-on: ubuntu-latest

    steps:
      - name: Checkout code
        uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: \'22\'

      - name: Install dependencies
        run: npm install

      - name: Run tests
        run: npm test

      - name: Build React app
        run: npm run build-react

      - name: Build Electron app
        run: npm run dist
        env:
          # ELECTRON_BUILDER_ALLOW_UNRESOLVED_DEPENDENCIES: true # Uncomment if you have issues with native modules
          # GH_TOKEN: ${{ secrets.GITHUB_TOKEN }} # For publishing releases to GitHub

      - name: Upload artifacts (optional)
        uses: actions/upload-artifact@v3
        with:
          name: quran-branch-manager-build
          path: release/
```

### 2.5. Containerization with Docker (Development Environment Consistency)

Using Docker for your development environment can ensure that all developers work with the exact same dependencies and configurations, eliminating "it works on my machine" issues. While not strictly necessary for a small project, it's a valuable best practice for larger teams.

**Benefits:**

- **Environment Consistency:** Guarantees that the development environment is identical across all machines.
- **Isolation:** Prevents conflicts with other projects or system-wide dependencies.
- **Easy Onboarding:** New developers can get up and running quickly with a single `docker-compose up` command.

**Example `Dockerfile` (for development environment):**

```dockerfile
# Dockerfile
FROM node:22-slim

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

CMD ["npm", "run", "dev"]
```

**Example `docker-compose.yml`:**

```yaml
# docker-compose.yml
version: \'3.8\'
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - '3000:3000' # For React dev server
    volumes:
      - .:/app
      - /app/node_modules # Prevent host node_modules from overwriting container ones
    environment:
      - NODE_ENV=development
```

To use Docker, install Docker Desktop and then run `docker-compose up` in your project root.

### 2.6. Coding Conventions

#### 2.6.1. Translation and Notification Conventions

This document outlines the conventions for user-facing text (translations) and notifications within the Quran Branch Manager application.

##### Arabic Language Conventions

The application's primary user-facing language is Arabic. The following conventions should be followed to ensure consistency and a professional tone:

1.  **Clarity and Formality**: Use clear, formal Arabic. Avoid colloquialisms or overly casual language. For example, use "الشؤون المالية" instead of "المالية".
2.  **Conciseness**: Keep labels and button texts concise and to the point. For example, use "إضافة طالب" instead of "إضافة طالب جديد".
3.  **Consistency**: Use consistent terminology throughout the application. For example, always use "شؤون الطلاب" to refer to student management.
4.  **Contextual Accuracy**: Ensure that the translation accurately reflects the context of the UI element. For example, use "الرئيسية" for the main dashboard link.

##### Notification System

All user notifications should be displayed using toast messages. The application uses the `react-toastify` library for this purpose. A centralized utility has been created at `src/renderer/utils/toast.js` to standardize the appearance and behavior of these notifications.

###### Usage

To display a notification, import the appropriate function from the `toast.js` utility:

```javascript
import { showSuccessToast, showErrorToast, showInfoToast, showWarningToast } from '../utils/toast';

// Example usage
showSuccessToast('تم تحديث البيانات بنجاح!');
showErrorToast('فشل في تحميل البيانات.');
```

###### Notification Types

*   **Success (`showSuccessToast`)**: Use for successful operations, such as creating, updating, or deleting data. The message should be specific and confirm the action that was taken (e.g., "تم حذف الطالب 'اسم الطالب' بنجاح.").
*   **Error (`showErrorToast`)**: Use for failed operations or unexpected errors. The message should clearly state what went wrong.
*   **Info (`showInfoToast`)**: Use for general information or neutral messages.
*   **Warning (`showWarningToast`)**: Use for non-critical issues or to warn the user about a potential problem.

###### Raw Alerts

Raw `alert()` or `window.confirm()` calls should not be used. For confirmations, use the `ConfirmationModal` component to provide a consistent and professional user experience.

### 2.7. Path Handling in Electron + Vite

This document outlines the best practices for handling paths in an Electron application that uses Vite as the bundler for the renderer process. Correctly managing paths is critical because they behave differently in the development environment versus the packaged production application.

#### The Core Problem

In development, files are loaded from their original locations in the source tree. In a packaged production app, files are bundled into a single archive (an `.asar` file), and paths become relative to the application's executable. A path that works in development (e.g., `../assets/icon.png`) will break in production if not handled correctly.

We must distinguish between two types of paths:
1.  **Compile-Time Paths:** These are the paths used in `import` and `require()` statements to link modules together. They are resolved by the bundler (Vite/Rollup) or the Node.js runtime at build time.
2.  **Runtime Paths:** These are paths used to access the filesystem *while the application is running*. This includes accessing databases, writing logs, reading user-generated content, or loading static assets like icons.

---

#### 2.7.1. Compile-Time Paths (Imports & Requires)

For linking modules in your code, you should **never** use `path.join`. These paths are not dynamic; they are part of the static code structure.

##### For the Renderer Process (Vite)

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

##### For the Main Process (Node.js)

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

#### 2.7.2. Runtime Paths (Filesystem Access)

For accessing files and directories while the app is running, you **must** use absolute paths constructed dynamically with `path.join`. This is the only way to ensure the path points to the correct location in both development and production.

##### Key Electron APIs & Variables

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

##### Example: Accessing the Database

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

## 4. Technology Stack: Core Technologies and Rationale

This section provides a comprehensive overview of the technology stack chosen for the Quran Branch Manager application. Each component is selected based on its suitability for an offline-first desktop application, performance considerations, maintainability, and alignment with modern development practices. The rationale behind each choice is detailed to provide clarity and guide future development decisions.

### 3.1. Frontend Technologies

The frontend is responsible for the user interface and user experience, providing an intuitive and responsive interaction with the application.

#### 3.1.1. Framework: React (Version 19.0.0)

- **Purpose:** React is a declarative, component-based JavaScript library for building user interfaces. It allows for the creation of reusable UI components, which simplifies development, enhances maintainability, and promotes a consistent user experience.
- **Rationale:** React was chosen for its robust ecosystem, strong community support, and its ability to efficiently manage complex UIs through its virtual DOM. Its component-based architecture aligns well with modular development, making it easier to build and scale the application. Version 19.0.0 represents the latest stable release, offering performance improvements and new features that enhance developer productivity.
- **Alternatives Considered:** Vue.js, Angular. While both are capable frameworks, React's widespread adoption, extensive tooling, and large talent pool were key deciding factors.

#### 3.1.2. Build Tool: Vite (Version 5.4.0)

- **Purpose:** Vite is a next-generation frontend tooling that provides an extremely fast development server and optimizes the production build process for modern web projects.
- **Rationale:** Vite was selected for its exceptional development speed, leveraging native ES modules for instant server start and hot module replacement (HMR). This significantly improves developer productivity by reducing waiting times during development. Its efficient build process also results in optimized production bundles, contributing to faster application load times. Version 5.4.0 ensures compatibility with the latest React features and performance enhancements.
- **Alternatives Considered:** Webpack, Parcel. While Webpack is powerful, its configuration can be complex. Vite offers a simpler, faster, and more modern development experience.

#### 3.1.3. UI Framework: Bootstrap 5 (Version 5.3.3) with React-Bootstrap (Version 2.10.4)

- **Purpose:** Bootstrap is a popular open-source CSS framework directed at responsive, mobile-first front-end web development. React-Bootstrap re-implements Bootstrap components as React components, integrating seamlessly with the React ecosystem.
- **Rationale:** Bootstrap 5 was chosen for its comprehensive set of pre-designed, responsive UI components, which accelerate development and ensure a consistent, professional look and feel across the application. Its native Right-to-Left (RTL) support is crucial for the Arabic UI of the Quran Branch Manager. React-Bootstrap provides a React-friendly API, avoiding direct DOM manipulation and adhering to React's declarative paradigm. Version 5.3.3 and 2.10.4 respectively ensure the latest features and bug fixes.
- **Alternatives Considered:** Material-UI, Ant Design. Bootstrap's widespread familiarity and strong RTL support were key differentiators.

#### 3.1.4. Styling: Custom CSS and SCSS

- **Purpose:** To provide global styles, override Bootstrap defaults, and implement application-specific visual designs.
- **Rationale:** While Bootstrap provides a solid foundation, custom CSS (or SCSS for pre-processing) allows for fine-grained control over the application's aesthetics, ensuring brand consistency and unique UI elements. This approach enables developers to extend and customize Bootstrap's styles without ejecting or heavily modifying the framework itself.

### 3.2. Backend (Electron Main Process) Technologies

In the context of a desktop application, the term "backend" primarily refers to the Electron main process. This process handles interactions with the local SQLite database, system-level operations, and other functionalities that require native access.

#### 3.2.1. Runtime Environment: Node.js (Version 22.5.1 LTS)

- **Purpose:** Node.js provides a JavaScript runtime environment that allows server-side (or in this case, desktop-side) execution of JavaScript code. It powers the Electron main process and facilitates interaction with the operating system.
- **Rationale:** Node.js is the foundational technology for Electron, enabling the use of JavaScript for both frontend and "backend" logic. Its asynchronous, event-driven architecture is well-suited for I/O-bound operations like database interactions and file system access. Choosing Node.js 22.5.1 LTS ensures long-term stability, performance, and access to the latest features and security updates.
- **Alternatives Considered:** While other languages could be used for the main process (e.g., Python with a bridge), Node.js offers a unified language stack with the frontend, simplifying development and reducing context switching.

#### 3.2.2. Desktop Application Framework: Electron (Version 32.0.0)

- **Purpose:** Electron is a framework that allows developers to build cross-platform desktop applications using web technologies (HTML, CSS, and JavaScript).
- **Rationale:** Electron was chosen to transform the React web application into a native desktop experience, providing offline-first capabilities and direct access to system resources. It enables the application to run on Windows 10/11 and optionally macOS, reaching a wider user base without significant code changes. Version 32.0.0 offers the latest Chromium and Node.js versions, ensuring modern web capabilities and performance.
- **Alternatives Considered:** NW.js, Tauri. Electron's maturity, extensive documentation, and large community support were key factors in its selection.

#### 3.2.3. Inter-Process Communication (IPC): Electron's `ipcMain` and `ipcRenderer` with `contextBridge`

- **Purpose:** IPC mechanisms facilitate secure communication between the Electron main process and the renderer (web page) processes.
- **Rationale:** In Electron, the main process has full Node.js API access, while renderer processes typically do not (for security reasons). IPC allows the renderer to securely request services from the main process (e.g., database queries, file operations) without exposing the entire Node.js environment. The `contextBridge` API is specifically used to expose a controlled, secure API to the renderer, preventing malicious code injection and maintaining a strong security boundary. This is a critical security best practice.

### 3.3. Database Technologies

#### 3.3.1. Type: SQLite (Version 3.46.0)

- **Purpose:** SQLite is a self-contained, serverless, zero-configuration, transactional SQL database engine that stores data in a single file.
- **Rationale:** SQLite is the ideal choice for an offline-first desktop application due to its lightweight nature, embedded capabilities, and ease of deployment. It requires no separate server process, simplifying installation and maintenance for end-users. Version 3.46.0 ensures access to the latest features and performance optimizations.
- **Alternatives Considered:** IndexedDB (browser-based, less robust for complex data), other file-based databases. SQLite's SQL compliance and proven reliability were decisive.

#### 3.3.2. Node.js Driver: `sqlite3` (Version 5.1.7)

- **Purpose:** The `sqlite3` package provides a Node.js interface to the SQLite database.
- **Rationale:** This driver enables the Electron main process to interact directly with the SQLite database file, executing SQL queries and managing data. Version 5.1.7 ensures compatibility with the chosen SQLite version and provides a stable API for database operations.

#### 3.3.3. Storage Location: `app.getPath('userData')`

- **Purpose:** To store the SQLite database file in a persistent, user-specific location that is appropriate for the operating system.
- **Rationale:** Electron's `app.getPath('userData')` method provides a cross-platform way to access a directory where user-specific application data can be stored. This ensures that the database file is saved in a standard, accessible, and persistent location, separate from the application's executable, preventing data loss during updates or reinstallation.

### 3.4. Deployment Tools

#### 3.4.1. Packaging and Distribution: Electron Builder (Version 24.13.3)

- **Purpose:** Electron Builder is a complete solution to package and build a ready for distribution Electron app for macOS, Windows, and Linux.
- **Rationale:** Electron Builder automates the complex process of packaging the Electron application, including code signing, creating installers (e.g., `.exe`, `.dmg`, `AppImage`), and handling auto-updates. It significantly simplifies the release process and ensures a professional distribution experience for end-users. Version 24.13.3 provides the latest features and platform support.

### 3.5. Other Libraries and Tools

#### 3.5.1. Report Generation (PDF): PDFKit (Version 0.15.0)

- **Purpose:** A JavaScript PDF generation library for Node.js and the browser.
- **Rationale:** PDFKit allows the application to dynamically generate professional-looking PDF reports directly from data, fulfilling a key functional requirement. Its programmatic API provides fine-grained control over document layout and content. Version 0.15.0 ensures stability and feature richness.

#### 3.5.2. Report Generation (Excel): ExcelJS (Version 4.4.0)

- **Purpose:** A powerful library for reading, writing, and manipulating XLSX files.
- **Rationale:** ExcelJS enables the application to generate detailed Excel reports, providing users with flexible data analysis capabilities. It supports various data types, formatting, and complex spreadsheet structures. Version 4.4.0 offers robust functionality for Excel file manipulation.

#### 3.5.3. Authentication: JSON Web Tokens (JWT) and `bcryptjs`

- **Purpose:** JWTs are used for secure session management, and `bcryptjs` is used for robust password hashing.
- **Rationale:** JWTs provide a compact, URL-safe means of representing claims to be transferred between two parties. In this offline-first context, they are used for local session management after initial authentication. `bcryptjs` is a strong, adaptive hashing algorithm that securely hashes user passwords before storage, protecting against brute-force attacks and rainbow table attacks. This combination ensures secure user authentication and data protection.

#### 3.5.4. Local Storage: `electron-store` (Version 8.2.0)

- **Purpose:** A simple data persistence module for Electron apps that saves and loads data in a JSON file.
- **Rationale:** `electron-store` provides a convenient and cross-platform way to store user settings and application state persistently. It simplifies the management of configuration data that needs to survive application restarts, such as user preferences or application-specific settings.

#### 3.5.5. Version Control: Git

#### 3.5.5. State Management: React Context API

- **Purpose:** To manage global application state, such as user authentication status, user information, and theme (light/dark mode).
- **Rationale:** For the initial scope of this project, React's built-in Context API is sufficient for managing global state. It avoids the need for external libraries like Redux or Zustand, simplifying the learning curve and reducing boilerplate. As the application grows, a more robust state management solution can be considered if needed.

#### 3.5.6. Version Control: Git

- **Purpose:** A distributed version control system for tracking changes in source code during software development.
- **Rationale:** Git is the industry standard for version control, enabling collaborative development, tracking changes, reverting to previous states, and managing different branches of development. Its distributed nature ensures robustness and flexibility.

#### 3.5.6. Package Manager: npm (Node Package Manager)

- **Purpose:** The default package manager for Node.js, used to install, manage, and publish Node.js packages.
- **Rationale:** npm is integral to the Node.js ecosystem, handling project dependencies, running scripts, and managing the entire development workflow. It ensures that all necessary libraries and tools are correctly installed and versioned.

## 4. Database Schema: A Comprehensive Guide

This section provides a detailed overview of the SQLite database schema used by the Quran Branch Manager application, including table definitions, relationships, and an example SQL creation script.

### 4.1. Introduction to the Database Design Philosophy

The choice of SQLite as the embedded database solution is central to the application's design. SQLite is a self-contained, serverless, zero-configuration, transactional SQL database engine. Its lightweight nature and file-based storage make it ideal for desktop applications where a separate database server is unnecessary and offline access is paramount. The schema design prioritizes clarity, normalization, and ease of maintenance, allowing for future scalability and feature expansion while minimizing data redundancy.

### 4.2. Detailed Table Definitions

Each table in the database serves a specific purpose, storing distinct sets of information critical to the Quran Branch Manager's operations. The following sections detail each table, providing a comprehensive data dictionary that includes column names, their data types, and any applicable constraints.

#### 4.2.1. `users` Table

**Purpose:** This table is designed to securely store user authentication details and manage role-based access within the application. It is fundamental for controlling who can access different features and data based on their assigned permissions.

| Column Name  | Data Type | Constraints                                              | Description                                                                                                                                     |
| :----------- | :-------- | :------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`         | INTEGER   | PRIMARY KEY, AUTOINCREMENT                               | Unique identifier for each user. Automatically increments with each new user record.                                                            |
| `username`   | TEXT      | UNIQUE, NOT NULL                                         | The user's unique login username. Must be unique across all users and cannot be empty.                                                          |
| `password`   | TEXT      | NOT NULL (stores hashed passwords)                       | The user's password. **Crucially, this column stores cryptographically hashed passwords, not plain text, to ensure security.** Cannot be empty. |
| `role`       | TEXT      | NOT NULL (e.g., 'Superadmin', 'Branch Admin', 'Teacher') | The role assigned to the user, determining their permissions and access levels within the application. Cannot be empty.                         |
| `created_at` | DATETIME  | DEFAULT CURRENT_TIMESTAMP                                | The timestamp when the user account was created. Defaults to the current date and time upon insertion.                                          |

**Sample Data:**

| id  | username      | password (hashed)             | role         | created_at          |
| --- | ------------- | ----------------------------- | ------------ | ------------------- |
| 1   | superadmin    | `$2a$10$hashedpassword123...` | Superadmin   | 2025-01-15 10:00:00 |
| 2   | branch_tunis  | `$2a$10$hashedpassword456...` | Branch Admin | 2025-01-15 10:05:00 |
| 3   | teacher_ahmed | `$2a$10$hashedpassword789...` | Teacher      | 2025-01-16 09:30:00 |

#### 4.2.2. `students` Table

**Purpose:** This table is central to managing student records, including their personal details, enrollment information, and academic progress within the Quranic association.

| Column Name          | Data Type | Constraints                           | Description                                                                                                |
| :------------------- | :-------- | :------------------------------------ | :--------------------------------------------------------------------------------------------------------- |
| `id`                 | INTEGER   | PRIMARY KEY, AUTOINCREMENT            | Unique identifier for each student. Automatically increments with each new student record.                 |
| `name`               | TEXT      | NOT NULL                              | The full name of the student. Cannot be empty.                                                             |
| `age`                | INTEGER   |                                       | The age of the student.                                                                                    |
| `gender`             | TEXT      |                                       | The gender of the student (e.g., 'Male', 'Female').                                                        |
| `enrollment_date`    | DATETIME  | DEFAULT CURRENT_TIMESTAMP             | The date and time when the student was enrolled. Defaults to the current date and time upon insertion.     |
| `status`             | TEXT      | DEFAULT 'active'                      | The current status of the student (e.g., 'active', 'inactive', 'graduated'). Defaults to 'active'.         |
| `branch_id`          | INTEGER   | FOREIGN KEY REFERENCES `branches(id)` | The ID of the branch the student is associated with. Establishes a relationship with the `branches` table. |
| `memorization_level` | TEXT      |                                       | The current memorization level of the student (e.g., 'Juz Amma', 'Half Quran', 'Full Quran').              |
| `contact_info`       | TEXT      |                                       | Student's contact information (e.g., phone number, email).                                                 |
| `parent_name`        | TEXT      |                                       | The name of the student's parent or guardian.                                                              |
| `parent_contact`     | TEXT      |                                       | Parent's contact information.                                                                              |

**Sample Data:**

| id  | name            | age | gender | enrollment_date     | status | branch_id | memorization_level | contact_info     | parent_name  | parent_contact |
| --- | --------------- | --- | ------ | ------------------- | ------ | --------- | ------------------ | ---------------- | ------------ | -------------- |
| 1   | Fatima Al-Zahra | 8   | Female | 2024-09-01 09:00:00 | active | 1         | Juz Amma           | 012345678        | Aisha Khan   | 012345679      |
| 2   | Omar Abdullah   | 10  | Male   | 2024-09-01 09:15:00 | active | 1         | Baqarah            | omar@example.com | Abdullah Ali | 012345680      |

#### 4.2.3. `teachers` Table

**Purpose:** This table stores comprehensive profiles of teachers, including their contact details and areas of specialization, facilitating efficient assignment to classes.

| Column Name      | Data Type | Constraints                | Description                                                                                              |
| :--------------- | :-------- | :------------------------- | :------------------------------------------------------------------------------------------------------- |
| `id`             | INTEGER   | PRIMARY KEY, AUTOINCREMENT | Unique identifier for each teacher. Automatically increments with each new teacher record.               |
| `name`           | TEXT      | NOT NULL                   | The full name of the teacher. Cannot be empty.                                                           |
| `contact_info`   | TEXT      |                            | Teacher's contact information (e.g., phone number, email).                                               |
| `specialization` | TEXT      |                            | The teacher's area of expertise (e.g., 'Tajweed', 'Hifz', 'Arabic Language').                            |
| `created_at`     | DATETIME  | DEFAULT CURRENT_TIMESTAMP  | The timestamp when the teacher record was created. Defaults to the current date and time upon insertion. |

**Sample Data:**

| id  | name          | contact_info       | specialization | created_at          |
| --- | ------------- | ------------------ | -------------- | ------------------- |
| 1   | Ustadh Khalid | khalid@example.com | Tajweed        | 2024-08-20 11:00:00 |
| 2   | Ustadha Amina | 012345681          | Hifz           | 2024-08-20 11:10:00 |

#### 4.2.4. `classes` Table

**Purpose:** This table manages information about the various classes offered, including their names, assigned teachers, and scheduling details.

| Column Name  | Data Type | Constraints                           | Description                                                                                            |
| :----------- | :-------- | :------------------------------------ | :----------------------------------------------------------------------------------------------------- |
| `id`         | INTEGER   | PRIMARY KEY, AUTOINCREMENT            | Unique identifier for each class. Automatically increments with each new class record.                 |
| `name`       | TEXT      | NOT NULL                              | The name or title of the class (e.g., 'Beginner Tajweed', 'Hifz Group A'). Cannot be empty.            |
| `teacher_id` | INTEGER   | FOREIGN KEY REFERENCES `teachers(id)` | The ID of the teacher assigned to this class. Establishes a relationship with the `teachers` table.    |
| `schedule`   | TEXT      |                                       | Details about the class schedule (e.g., 'Monday, Wednesday, Friday 4-5 PM', 'Daily after Asr').        |
| `created_at` | DATETIME  | DEFAULT CURRENT_TIMESTAMP             | The timestamp when the class record was created. Defaults to the current date and time upon insertion. |

**Sample Data:**

| id  | name             | teacher_id | schedule             | created_at          |
| --- | ---------------- | ---------- | -------------------- | ------------------- |
| 1   | Beginner Tajweed | 1          | Mon, Wed, Fri 4-5 PM | 2024-08-25 14:00:00 |
| 2   | Hifz Group A     | 2          | Daily after Asr      | 2024-08-25 14:15:00 |

#### 4.2.5. `attendance` Table

**Purpose:** This table records student attendance for specific classes on particular dates, providing a historical log for monitoring and reporting.

| Column Name  | Data Type | Constraints                                     | Description                                                                                                                       |
| :----------- | :-------- | :---------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------- |
| `id`         | INTEGER   | PRIMARY KEY, AUTOINCREMENT                      | Unique identifier for each attendance record. Automatically increments with each new record.                                      |
| `student_id` | INTEGER   | NOT NULL, FOREIGN KEY REFERENCES `students(id)` | The ID of the student whose attendance is being recorded. Establishes a relationship with the `students` table. Cannot be empty.  |
| `class_id`   | INTEGER   | NOT NULL, FOREIGN KEY REFERENCES `classes(id)`  | The ID of the class for which attendance is being recorded. Establishes a relationship with the `classes` table. Cannot be empty. |
| `date`       | DATETIME  | DEFAULT CURRENT_TIMESTAMP                       | The date and time of the attendance record. Defaults to the current date and time upon insertion.                                 |
| `status`     | TEXT      | NOT NULL (e.g., 'present', 'absent', 'late')    | The attendance status of the student for that class and date. Cannot be empty.                                                    |

**Sample Data:**

| id  | student_id | class_id | date                | status  |
| --- | ---------- | -------- | ------------------- | ------- |
| 1   | 1          | 1        | 2025-01-01 16:00:00 | present |
| 2   | 2          | 1        | 2025-01-01 16:00:00 | present |
| 3   | 1          | 1        | 2025-01-03 16:00:00 | absent  |

#### 4.2.6. `branches` Table

**Purpose:** This table manages information about different Quranic association branches. It is designed to support multi-branch functionality, allowing the application to scale and manage operations across various locations.

| Column Name  | Data Type | Constraints                | Description                                                                                              |
| :----------- | :-------- | :------------------------- | :------------------------------------------------------------------------------------------------------- |
| `id`         | INTEGER   | PRIMARY KEY, AUTOINCREMENT | Unique identifier for each branch. Automatically increments with each new branch record.                 |
| `name`       | TEXT      | UNIQUE, NOT NULL           | The unique name of the branch (e.g., 'Tunis Branch', 'Sfax Branch'). Must be unique and cannot be empty. |
| `location`   | TEXT      |                            | The physical address or general location of the branch.                                                  |
| `created_at` | DATETIME  | DEFAULT CURRENT_TIMESTAMP  | The timestamp when the branch record was created. Defaults to the current date and time upon insertion.  |

**Sample Data:**

| id  | name                       | location        | created_at          |
| --- | -------------------------- | --------------- | ------------------- |
| 1   | Local Branch Masabih Quran | Bishri, Tunisia | 2024-07-01 08:00:00 |
| 2   | Tunis Grand Branch         | Tunis, Tunisia  | 2024-07-01 08:30:00 |

#### 4.2.7. Financial Tables

To support the financial management module, the following tables are introduced.

##### `payments` Table
**Purpose:** Tracks student tuition fees and other payments.

| Column Name      | Data Type | Constraints                                     | Description                                      |
| :--------------- | :-------- | :---------------------------------------------- | :----------------------------------------------- |
| `id`             | INTEGER   | PRIMARY KEY, AUTOINCREMENT                      | Unique identifier for each payment.              |
| `student_id`     | INTEGER   | NOT NULL, FOREIGN KEY REFERENCES `students(id)` | The student making the payment.                  |
| `amount`         | REAL      | NOT NULL                                        | The amount paid.                                 |
| `payment_date`   | DATETIME  | DEFAULT CURRENT_TIMESTAMP                       | The date of the payment.                         |
| `payment_method` | TEXT      |                                                 | Method of payment (e.g., 'Cash', 'Bank Transfer').|
| `notes`          | TEXT      |                                                 | Additional notes about the payment.              |
| `created_at`     | DATETIME  | DEFAULT CURRENT_TIMESTAMP                       | Timestamp of record creation.                    |
| `updated_at`     | DATETIME  | DEFAULT CURRENT_TIMESTAMP                       | Timestamp of last update.                        |

##### `salaries` Table
**Purpose:** Tracks salary payments made to teachers and staff.

| Column Name  | Data Type | Constraints                                     | Description                                      |
| :----------- | :-------- | :---------------------------------------------- | :----------------------------------------------- |
| `id`         | INTEGER   | PRIMARY KEY, AUTOINCREMENT                      | Unique identifier for each salary payment.       |
| `teacher_id` | INTEGER   | NOT NULL, FOREIGN KEY REFERENCES `teachers(id)` | The teacher receiving the salary.                |
| `amount`     | REAL      | NOT NULL                                        | The amount paid.                                 |
| `payment_date` | DATETIME  | NOT NULL                                        | The date the salary was paid.                    |
| `notes`      | TEXT      |                                                 | Additional notes about the salary payment.       |
| `created_at` | DATETIME  | DEFAULT CURRENT_TIMESTAMP                       | Timestamp of record creation.                    |
| `updated_at` | DATETIME  | DEFAULT CURRENT_TIMESTAMP                       | Timestamp of last update.                        |

##### `donations` Table
**Purpose:** Records all donations received, both cash and in-kind.

| Column Name     | Data Type | Constraints                | Description                                      |
| :-------------- | :-------- | :------------------------- | :----------------------------------------------- |
| `id`            | INTEGER   | PRIMARY KEY, AUTOINCREMENT | Unique identifier for each donation.             |
| `donor_name`    | TEXT      | NOT NULL                   | The name of the person or entity donating.       |
| `amount`        | REAL      |                            | The monetary amount, for cash donations. Null for in-kind. |
| `donation_date` | DATETIME  | NOT NULL                   | The date the donation was received.              |
| `donation_type` | TEXT      | NOT NULL, DEFAULT 'Cash'   | The type of donation ('Cash' or 'In-kind').      |
| `description`   | TEXT      |                            | Description of the item(s) for in-kind donations. |
| `notes`         | TEXT      |                            | Additional general notes about the donation.     |
| `created_at`    | DATETIME  | DEFAULT CURRENT_TIMESTAMP  | Timestamp of record creation.                    |
| `updated_at`    | DATETIME  | DEFAULT CURRENT_TIMESTAMP  | Timestamp of last update.                        |

##### `expenses` Table
**Purpose:** Tracks all organizational expenses.

| Column Name        | Data Type | Constraints                | Description                                      |
| :----------------- | :-------- | :------------------------- | :----------------------------------------------- |
| `id`               | INTEGER   | PRIMARY KEY, AUTOINCREMENT | Unique identifier for each expense.              |
| `category`         | TEXT      | NOT NULL                   | The category of the expense (e.g., 'Utilities', 'Supplies'). |
| `amount`           | REAL      | NOT NULL                   | The amount of the expense.                       |
| `expense_date`     | DATETIME  | NOT NULL                   | The date the expense was incurred.               |
| `responsible_person`| TEXT      |                            | The person responsible for the expense.          |
| `description`      | TEXT      |                            | A detailed description of the expense.           |
| `created_at`       | DATETIME  | DEFAULT CURRENT_TIMESTAMP  | Timestamp of record creation.                    |
| `updated_at`       | DATETIME  | DEFAULT CURRENT_TIMESTAMP  | Timestamp of last update.                        |


### 4.3. Database Relationships

The relationships between tables are crucial for maintaining data integrity and enabling complex queries that span across different entities. The Quran Branch Manager database employs the following key relationships:

- **`students` to `branches`:** This is a **One-to-Many** relationship. A single branch (`branches` table) can have multiple students associated with it (`students` table), but each student belongs to only one branch. This is enforced by the `branch_id` foreign key in the `students` table, referencing the `id` in the `branches` table.

- **`classes` to `teachers`:** This is a **Many-to-One** relationship. A teacher (`teachers` table) can be assigned to teach multiple classes (`classes` table), but each class is assigned to only one teacher. This is enforced by the `teacher_id` foreign key in the `classes` table, referencing the `id` in the `teachers` table.

- **`attendance` to `students`:** This is a **Many-to-One** relationship. A student (`students` table) can have many attendance records (`attendance` table), but each attendance record pertains to a single student. This is enforced by the `student_id` foreign key in the `attendance` table, referencing the `id` in the `students` table.

- **`attendance` to `classes`:** This is a **Many-to-One** relationship. A class (`classes` table) can have many attendance records (`attendance` table), but each attendance record pertains to a single class. This is enforced by the `class_id` foreign key in the `attendance` table, referencing the `id` in the `classes` table.

- **`payments` to `students`:** This is a **Many-to-One** relationship. A student can have many payments, but each payment belongs to a single student. This is enforced by the `student_id` foreign key in the `payments` table.

- **`salaries` to `teachers`:** This is a **Many-to-One** relationship. A teacher can have many salary payments, but each salary payment belongs to a single teacher. This is enforced by the `teacher_id` foreign key in the `salaries` table.

### 4.4. Example SQL Creation Script

For clarity and ease of understanding, here is a simplified SQL script demonstrating the creation of the `users` table. Similar `CREATE TABLE` statements would be used for all other tables defined in the schema.

```sql
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS branches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    location TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    age INTEGER,
    gender TEXT,
    enrollment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'active',
    branch_id INTEGER,
    memorization_level TEXT,
    contact_info TEXT,
    parent_name TEXT,
    parent_contact TEXT,
    FOREIGN KEY (branch_id) REFERENCES branches(id)
);

CREATE TABLE IF NOT EXISTS teachers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    contact_info TEXT,
    specialization TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS classes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    teacher_id INTEGER,
    schedule TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (teacher_id) REFERENCES teachers(id)
);

CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    class_id INTEGER NOT NULL,
    date DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT NOT NULL,
    FOREIGN KEY (student_id) REFERENCES students(id),
    FOREIGN KEY (class_id) REFERENCES classes(id)
);

CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    payment_method TEXT,
    notes TEXT,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS salaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teacher_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    payment_date DATETIME NOT NULL,
    notes TEXT,
    FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS donations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    donor_name TEXT NOT NULL,
    amount REAL NOT NULL,
    donation_date DATETIME NOT NULL,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    amount REAL NOT NULL,
    expense_date DATETIME NOT NULL,
    responsible_person TEXT,
    description TEXT
);
```

### 4.5. Indexing Strategy (Future Consideration)

To optimize database performance, especially as the volume of data grows, an indexing strategy will be crucial. While not explicitly defined in the initial schema, the following columns are candidates for indexing due to their frequent use in queries and relationships:

- `users.username` (already unique, but explicit index can help search performance)
- `students.name`
- `students.branch_id`
- `teachers.name`
- `classes.teacher_id`
- `attendance.student_id`
- `attendance.class_id`
- `attendance.date`

Indexes will be added incrementally based on performance profiling and specific query patterns observed during development and testing.

### 4.6. Schema Migration Strategy (Future Consideration)

### 4.6. Schema Migration Strategy

As the application evolves, changes to the database schema will inevitably be required. A robust schema migration strategy is essential to manage these changes without data loss and to ensure smooth updates for users. This will involve:

- **Version Control for Schema:** Treating schema definitions as code and managing them under version control (e.g., Git).
- **Migration Scripts:** Developing incremental SQL scripts (or using a migration tool) to apply schema changes (e.g., adding new columns, modifying existing ones, creating new tables).
- **Automated Migration:** Integrating migration execution into the application's startup process, ensuring that the database schema is always up-to-date when the application launches.
- **Backup Before Migration:** Always performing a database backup before applying any schema migrations to allow for rollback in case of issues.

### 4.7. Entity-Relationship (ER) Diagram Description

For a visual representation of the database schema and its relationships, an Entity-Relationship (ER) diagram can be generated using various tools. This diagram would visually depict:

- **Entities (Tables):** Represented as rectangles (e.g., `users`, `students`, `teachers`, `classes`, `attendance`, `branches`).
- **Attributes (Columns):** Listed within each entity, with primary keys typically underlined.
- **Relationships:** Lines connecting entities, indicating the type of relationship (e.g., one-to-many, many-to-one) and cardinality (e.g., crow's foot notation).

Tools like `dbdiagram.io`, `draw.io`, or specialized database modeling tools can be used to create such diagrams from the SQL schema or by direct input. An ER diagram provides an invaluable visual aid for understanding the data model at a glance, especially for new developers joining the project.

### 4.8. User Schemas and Field Definitions

This document outlines the detailed schema and field definitions for various user types within the Quran Branch Manager application: Students (categorized by age and gender), Teachers, and Administrative roles (Admin/Super Admin). These definitions are derived from the provided PDF forms, augmented with best practices from general student and teacher information management systems, and tailored for consistent form generation within the application.

Each schema includes a `Field Name`, `Data Type`, `Description`, `Source` (indicating if it's from a PDF, research, or derived), and `Applicability` (specifying which user sub-category it applies to).

#### 4.8.1. Student Schemas

Student data management is central to the Quran Branch Manager application. To accommodate the diverse needs of different age groups and genders, the student schema is designed with common core fields and specific fields tailored to children, teenagers, and adults. This approach ensures comprehensive data capture while maintaining flexibility for form generation.

##### 4.8.1.1. Core Student Fields (Applicable to All Students)

These fields are fundamental and apply to all students regardless of age or gender. They form the base of every student record.

| Field Name           | Data Type | Description                                                                                             | Source             | Applicability        |
| :------------------- | :-------- | :------------------------------------------------------------------------------------------------------ | :----------------- | :------------------- |
| `fullName`           | TEXT      | Full name of the student.                                                                               | PDF (Both)         | All Students         |
| `dateOfBirth`        | DATE      | Student's date of birth.                                                                                | PDF (Both)         | All Students         |
| `gender`             | TEXT      | Student's gender (e.g., 'Male', 'Female').                                                              | Derived            | All Students         |
| `address`            | TEXT      | Student's residential address.                                                                          | PDF (Both)         | All Students         |
| `phoneNumber`        | TEXT      | Student's primary contact phone number.                                                                 | PDF (Both)         | All Students         |
| `email`              | TEXT      | Student's email address.                                                                                | PDF (Both)         | All Students         |
| `enrollmentDate`     | DATE      | Date when the student was officially enrolled in the association.                                       | Research           | All Students         |
| `status`             | TEXT      | Current status of the student (e.g., 'Active', 'Inactive', 'Graduated', 'On Leave').                    | Research           | All Students         |
| `branchId`           | INTEGER   | Foreign key linking to the `branches` table, indicating the student's associated branch.                | Derived (DB Schema)| All Students         |
| `memorizationLevel`  | TEXT      | Current level of Quran memorization (e.g., 'Juz Amma', 'Half Quran', 'Full Quran', 'Specific Surahs'). | PDF (Adult)        | All Students         |
| `notes`              | TEXT      | Any additional notes or remarks about the student.                                                      | Research           | All Students         |

##### 4.8.1.2. Student Fields by Category

###### 4.8.1.2.1. Kids (Ages ~4-12)

This category focuses on younger students, where parental involvement is high. The fields reflect the need for guardian information.

| Field Name           | Data Type | Description                                                                                             | Source             | Applicability        |
| :------------------- | :-------- | :------------------------------------------------------------------------------------------------------ | :----------------- | :------------------- |
| `guardianName`       | TEXT      | Full name of the primary guardian/parent.                                                               | PDF (Children)     | Kids                 |
| `guardianRelation`   | TEXT      | Relationship of the guardian to the child (e.g., 'Father', 'Mother', 'Grandparent').                    | Research           | Kids                 |
| `guardianPhoneNumber`| TEXT      | Guardian's contact phone number.                                                                        | PDF (Children)     | Kids                 |
| `guardianEmail`      | TEXT      | Guardian's email address.                                                                               | Research           | Kids                 |
| `emergencyContactName`| TEXT      | Name of an emergency contact person.                                                                    | Research           | Kids                 |
| `emergencyContactPhone`| TEXT      | Phone number of the emergency contact.                                                                  | Research           | Kids                 |
| `healthConditions`   | TEXT      | Any relevant health conditions or allergies.                                                            | Research           | Kids                 |

###### 4.8.1.2.2. Teens (Ages ~13-18)

Teenagers might have more independence but still require guardian oversight. The `nationalId` field becomes relevant here, though it might be optional.

| Field Name           | Data Type | Description                                                                                             | Source             | Applicability        |
| :------------------- | :-------- | :------------------------------------------------------------------------------------------------------ | :----------------- | :------------------- |
| `nationalId`         | TEXT      | National Identity Card (CIN) number. **Optional for some teens.**                                       | PDF (Adult)        | Teens, Adults        |
| `guardianName`       | TEXT      | Full name of the primary guardian/parent (still relevant for legal purposes).                           | Derived            | Teens                |
| `guardianPhoneNumber`| TEXT      | Guardian's contact phone number.                                                                        | Derived            | Teens                |
| `schoolName`         | TEXT      | Name of the school the teen attends.                                                                    | Research           | Teens                |
| `gradeLevel`         | TEXT      | Current grade or academic level.                                                                        | Research           | Teens                |

###### 4.8.1.2.3. Adults (Ages 18+)

Adult students are typically self-reliant. Fields focus on their personal and professional details.

| Field Name           | Data Type | Description                                                                                             | Source             | Applicability        |
| :------------------- | :-------- | :------------------------------------------------------------------------------------------------------ | :----------------- | :------------------- |
| `nationalId`         | TEXT      | National Identity Card (CIN) number.                                                                    | PDF (Adult)        | Teens, Adults        |
| `educationalLevel`   | TEXT      | Highest educational qualification (e.g., 'High School', 'Bachelor', 'Master', 'PhD').                   | PDF (Adult)        | Adults               |
| `occupation`         | TEXT      | Current profession or occupation.                                                                       | PDF (Adult)        | Adults               |

##### 4.8.1.3. Student Category Logic for Form Generation

When generating forms for students, the application should dynamically adjust fields based on the student's age and potentially gender. A common approach is to use the `dateOfBirth` field to determine the age category.

*   **Kids:** If `age <= 12` (or a similar threshold).
*   **Teens:** If `13 <= age <= 18`.
*   **Adults:** If `age > 18`.

Gender (`Male`/`Female`) will primarily influence UI presentation (e.g., honorifics, specific visual elements) rather than field availability, except for specific gender-segregated programs if applicable (which would be handled by `class` or `program` fields).

#### 4.8.2. Teacher Schema

The teacher schema focuses on professional qualifications, contact information, and specialization areas relevant to Quranic education. This allows for efficient assignment of teachers to classes based on their expertise.

| Field Name           | Data Type | Description                                                                                             | Source             | Applicability        |
| :------------------- | :-------- | :------------------------------------------------------------------------------------------------------ | :----------------- | :------------------- |
| `fullName`           | TEXT      | Full name of the teacher.                                                                               | Research           | All Teachers         |
| `nationalId`         | TEXT      | National Identity Card (CIN) number.                                                                    | Research           | All Teachers         |
| `phoneNumber`        | TEXT      | Teacher's primary contact phone number.                                                                 | Research           | All Teachers         |
| `email`              | TEXT      | Teacher's email address.                                                                                | Research           | All Teachers         |
| `address`            | TEXT      | Teacher's residential address.                                                                          | Research           | All Teachers         |
| `dateOfBirth`        | DATE      | Teacher's date of birth.                                                                                | Research           | All Teachers         |
| `gender`             | TEXT      | Teacher's gender (e.g., 'Male', 'Female').                                                              | Research           | All Teachers         |
| `educationalLevel`   | TEXT      | Highest educational qualification (e.g., 'Bachelor in Islamic Studies', 'Master in Quranic Sciences').  | PDF (Adult)        | All Teachers         |
| `specialization`     | TEXT      | Area of expertise in Quranic studies (e.g., 'Tajweed', 'Hifz', 'Tafsir', 'Arabic Language').            | PDF (Adult)        | All Teachers         |
| `yearsOfExperience`  | INTEGER   | Number of years teaching experience.                                                                    | Research           | All Teachers         |
| `availability`       | TEXT      | Teacher's general availability (e.g., 'Weekdays Mornings', 'Evenings', 'Full-time').                    | Research           | All Teachers         |
| `assignedBranchId`   | INTEGER   | Foreign key linking to the `branches` table, indicating the teacher's primary assigned branch.          | Derived (DB Schema)| All Teachers         |
| `notes`              | TEXT      | Any additional notes or remarks about the teacher.                                                      | Research           | All Teachers         |

#### 4.8.3. Admin and Super Admin Schemas

Administrative roles require fields primarily focused on identification, contact, and role assignment within the system. Security and access control are paramount for these roles.

##### 4.8.3.1. Core Admin/Super Admin Fields

| Field Name           | Data Type | Description                                                                                             | Source             | Applicability        |
| :------------------- | :-------- | :------------------------------------------------------------------------------------------------------ | :----------------- | :------------------- |
| `userId`             | INTEGER   | Unique identifier for the user account (primary key).                                                   | Derived (DB Schema)| All Admins           |
| `username`           | TEXT      | Unique username for login.                                                                              | Derived (DB Schema)| All Admins           |
| `passwordHash`       | TEXT      | Hashed password for secure authentication.                                                              | Derived (DB Schema)| All Admins           |
| `role`               | TEXT      | User's role (e.g., 'Admin', 'Superadmin').                                                              | Derived (DB Schema)| All Admins           |
| `fullName`           | TEXT      | Full name of the administrator.                                                                         | Research           | All Admins           |
| `phoneNumber`        | TEXT      | Administrator's contact phone number.                                                                   | Research           | All Admins           |
| `email`              | TEXT      | Administrator's email address.                                                                          | Research           | All Admins           |
| `nationalId`         | TEXT      | National Identity Card (CIN) number.                                                                    | Research           | All Admins           |
| `assignedBranchId`   | INTEGER   | Foreign key linking to the `branches` table, indicating the admin's primary assigned branch (if applicable).| Derived (DB Schema)| Admin (Branch Admin) |
| `lastLogin`          | DATETIME  | Timestamp of the last successful login.                                                                 | Research           | All Admins           |
| `createdAt`          | DATETIME  | Timestamp when the user account was created.                                                            | Derived (DB Schema)| All Admins           |
| `updatedAt`          | DATETIME  | Timestamp of the last update to the user record.                                                        | Research           | All Admins           |

##### 4.8.3.2. Role-Specific Considerations

*   **Superadmin:** This role typically has full system access and is not usually tied to a specific `branchId`. The `assignedBranchId` field would be null or irrelevant for a Superadmin.
*   **Branch Admin:** This role is specifically tied to a `branchId`, limiting their scope of management to a particular branch.

#### 4.8.4. Consistent Form Generation and Categorization

To ensure consistent form generation in the application, the following principles should be applied:

*   **Dynamic Field Rendering:** Forms should be dynamically rendered based on the user type and, for students, their age category. This means that when adding a new student, the application would first ask for `dateOfBirth` (and perhaps `gender`), then dynamically present the relevant fields (`guardianName` for kids, `nationalId` for teens/adults, `occupation` for adults, etc.).
*   **Reusability:** Common fields (like `fullName`, `phoneNumber`, `email`) should be defined once and reused across different user types to ensure consistency in data capture and validation logic.
*   **Validation Rules:** Each field should have associated validation rules (e.g., `phoneNumber` must be numeric, `email` must be a valid email format, `nationalId` must adhere to a specific format and length). These rules should be enforced at the form level (frontend) and the API/database level (backend).
*   **Categorization Fields:** Fields like `gender`, `age`, `educationalLevel`, and `specialization` serve as important categorization fields that can be used for filtering, reporting, and assigning users to specific programs or classes. These should often be implemented as dropdowns or selection lists in the UI to ensure data consistency.
*   **Data Integrity:** Ensure that foreign key relationships (e.g., `branchId`, `assignedBranchId`) are properly enforced to maintain data integrity across related tables.

By adhering to these structured schemas and form generation principles, the Quran Branch Manager application can efficiently manage diverse user data, provide a tailored user experience during data entry, and support robust reporting and analysis capabilities.

## 5. API Reference: Inter-Process Communication (IPC) and Database Interactions

This section details the secure communication channels between the Electron main process and the renderer (React) process, specifically focusing on Inter-Process Communication (IPC) and direct database interactions. Understanding these APIs is crucial for building new features, debugging existing ones, and ensuring the security and integrity of the application.

### 5.1. Introduction to Electron IPC

In an Electron application, the main process (which runs Node.js) and the renderer processes (which run web pages) operate in separate environments. They cannot directly access each other's global variables or APIs. Inter-Process Communication (IPC) is the mechanism that allows these processes to communicate securely. Electron provides `ipcMain` (in the main process) and `ipcRenderer` (in the renderer process) modules for this purpose.

**Security Best Practice: `contextBridge`**

For enhanced security, the `contextBridge` API is used to expose specific, controlled functions from the main process to the renderer process. This prevents the renderer process from having direct access to Node.js APIs, minimizing the attack surface and protecting sensitive operations. All interactions with the database or system-level functionalities from the renderer process **must** go through these exposed `contextBridge` APIs.

### 5.2. Exposed APIs via `contextBridge` (`electronAPI`)

The `preload.js` script (located at `src/main/preload.js`) is responsible for exposing a global `electronAPI` object to the renderer process. This object contains functions that allow the renderer to securely invoke methods in the main process.

#### 5.2.1. `electronAPI.dbQuery(query, params)`

- **Description:** Executes a database query in the main process. This is a generic function designed to handle various SQL operations (INSERT, UPDATE, DELETE).
- **Main Process Handler:** `ipcMain.handle('db-query', async (event, { query, params }) => { ... })`
- **Parameters:**
  - `query` (String): The SQL query string to execute. **MUST use placeholders (`?`) for parameters to prevent SQL injection.**
  - `params` (Array): An array of values to be bound to the placeholders in the `query` string. If no parameters, pass an empty array.
- **Returns:** (Promise<Object>): A promise that resolves to an object containing `id` (the last inserted row ID, if applicable) and `changes` (the number of rows affected). Rejects on database error.
- **Example Usage (Renderer Process):**

  ```javascript
  // In your React component or service
  async function addStudent(name, age, branchId) {
    try {
      const sql = 'INSERT INTO students (name, age, branch_id) VALUES (?, ?, ?)';
      const params = [name, age, branchId];
      const result = await window.electronAPI.dbQuery(sql, params);
      console.log('Student added with ID:', result.id);
      return result.id;
    } catch (error) {
      console.error('Error adding student:', error);
      throw error;
    }
  }
  ```

#### 5.2.2. `electronAPI.dbGet(query, params)`

- **Description:** Executes a database query in the main process and returns a single row result. Ideal for fetching a single record (e.g., user by ID, specific configuration).
- **Main Process Handler:** `ipcMain.handle('db-get', async (event, { query, params }) => { ... })`
- **Parameters:**
  - `query` (String): The SQL query string to execute. **MUST use placeholders (`?`) for parameters.**
  - `params` (Array): An array of values to be bound to the placeholders in the `query` string.
- **Returns:** (Promise<Object | undefined>): A promise that resolves to a single row object if found, or `undefined` if no row matches. Rejects on database error.
- **Example Usage (Renderer Process):**

  ```javascript
  // In your React component or service
  async function getUserById(userId) {
    try {
      const sql = 'SELECT id, username, role FROM users WHERE id = ?';
      const params = [userId];
      const user = await window.electronAPI.dbGet(sql, params);
      if (user) {
        console.log('Fetched user:', user);
      } else {
        console.log('User not found.');
      }
      return user;
    } catch (error) {
      console.error('Error fetching user:', error);
      throw error;
    }
  }
  ```

#### 5.2.3. `electronAPI.dbAll(query, params)`

- **Description:** Executes a database query in the main process and returns all matching rows. Ideal for fetching lists of records (e.g., all students, all classes).
- **Main Process Handler:** `ipcMain.handle('db-all', async (event, { query, params }) => { ... })`
- **Parameters:**
  - `query` (String): The SQL query string to execute. **MUST use placeholders (`?`) for parameters.**
  - `params` (Array): An array of values to be bound to the placeholders in the `query` string.
- **Returns:** (Promise<Array<Object>>): A promise that resolves to an array of row objects. Returns an empty array if no rows match. Rejects on database error.
- **Example Usage (Renderer Process):**

  ```javascript
  // In your React component or service
  async function getAllStudents() {
    try {
      const sql = 'SELECT id, name, branch_id FROM students ORDER BY name ASC';
      const students = await window.electronAPI.dbAll(sql);
      console.log('Fetched students:', students);
      return students;
    } catch (error) {
      console.error('Error fetching students:', error);
      throw error;
    }
  }
  ```

#### 5.2.4. `electronAPI.getAppVersion()`

- **Description:** Retrieves the application version from the main process.
- **Main Process Handler:** `ipcMain.handle('get-app-version', () => { return app.getVersion(); })`
- **Parameters:** None.
- **Returns:** (Promise<String>): A promise that resolves to the application version string.
- **Example Usage (Renderer Process):**

  ```javascript
  // In your React component or service
  async function displayAppVersion() {
    try {
      const version = await window.electronAPI.getAppVersion();
      console.log('Application Version:', version);
      // Update UI with version
    } catch (error) {
      console.error('Error getting app version:', error);
    }
  }
  ```

#### 5.2.5. `electronAPI.login(username, password)`

- **Description:** Handles user authentication by sending credentials to the main process for validation against the database.
- **Main Process Handler:** `ipcMain.handle('login', async (event, { username, password }) => { ... })`
- **Parameters:**
  - `username` (String): The user's login username.
  - `password` (String): The user's plain-text password.
- **Returns:** (Promise<Object>): A promise that resolves to an object `{ success: boolean, token?: string, user?: Object, message?: string }`. If successful, `token` (JWT) and `user` object are returned. Otherwise, `success` is `false` and `message` provides error details.
- **Example Usage (Renderer Process):**

  ```javascript
  // In your login component
  async function handleLogin(username, password) {
    try {
      const response = await window.electronAPI.login(username, password);
      if (response.success) {
        console.log('Login successful! Token:', response.token);
        // Store token securely (e.g., in electron-store via another IPC call)
        // Redirect to dashboard
      } else {
        console.error('Login failed:', response.message);
        // Display error message to user
      }
    } catch (error) {
      console.error('Login IPC error:', error);
    }
  }
  ```

#### 5.2.6. `electronAPI.generatePdfReport(data)`

- **Description:** Triggers the generation of a PDF report in the main process.
- **Main Process Handler:** `ipcMain.handle('generate-pdf-report', async (event, data) => { ... })`
- **Parameters:**
  - `data` (Object): An object containing all necessary data for the report generation (e.g., student list, class details, date ranges).
- **Returns:** (Promise<String>): A promise that resolves to the file path of the generated PDF report. Rejects on error.
- **Example Usage (Renderer Process):**

  ```javascript
  // In your reports component
  async function createStudentReport(studentData) {
    try {
      const filePath = await window.electronAPI.generatePdfReport(studentData);
      console.log('PDF report generated at:', filePath);
      // Provide link to user or open file
    } catch (error) {
      console.error('Error generating PDF report:', error);
    }
  }
  ```

#### 5.2.7. `electronAPI.generateExcelReport(data)`

- **Description:** Triggers the generation of an Excel report in the main process.
- **Main Process Handler:** `ipcMain.handle('generate-excel-report', async (event, data) => { ... })`
- **Parameters:**
  - `data` (Object): An object containing all necessary data for the report generation (e.g., attendance records, financial summaries).
- **Returns:** (Promise<String>): A promise that resolves to the file path of the generated Excel report. Rejects on error.
- **Example Usage (Renderer Process):**

  ```javascript
  // In your reports component
  async function createAttendanceExcel(attendanceRecords) {
    try {
      const filePath = await window.electronAPI.generateExcelReport(attendanceRecords);
      console.log('Excel report generated at:', filePath);
      // Provide link to user or open file
    } catch (error) {
      console.error('Error generating Excel report:', error);
    }
  }
  ```

#### 5.2.8. `electronAPI.setSetting(key, value)`

- **Description:** Stores a key-value pair in the application's persistent settings using `electron-store`.
- **Main Process Handler:** `ipcMain.handle('set-setting', (event, key, value) => { store.set(key, value); })`
- **Parameters:**
  - `key` (String): The setting key.
  - `value` (Any): The value to store.
- **Returns:** (Promise<void>): A promise that resolves when the setting is saved.
- **Example Usage (Renderer Process):**

  ```javascript
  // In your settings component
  async function saveThemePreference(theme) {
    try {
      await window.electronAPI.setSetting('theme', theme);
      console.log('Theme preference saved:', theme);
    } catch (error) {
      console.error('Error saving theme preference:', error);
    }
  }
  ```

#### 5.2.9. `electronAPI.getSetting(key)`

- **Description:** Retrieves a value from the application's persistent settings using `electron-store`.
- **Main Process Handler:** `ipcMain.handle('get-setting', (event, key) => { return store.get(key); })`
- **Parameters:**
  - `key` (String): The setting key.
- **Returns:** (Promise<Any>): A promise that resolves to the stored value, or `undefined` if the key does not exist.
- **Example Usage (Renderer Process):**

  ```javascript
  // In your settings component or App initialization
  async function loadThemePreference() {
    try {
      const theme = await window.electronAPI.getSetting('theme');
      if (theme) {
        console.log('Loaded theme preference:', theme);
        // Apply theme to UI
      }
      return theme;
    } catch (error) {
      console.error('Error loading theme preference:', error);
    }
  }
  ```

### 5.3. Database Query Examples (Main Process)

These are examples of how the main process (`src/db/db.js`) provides generic functions to interact with the SQLite database. These functions are then exposed to the renderer process via the `contextBridge` as shown above.

#### 5.3.1. `runQuery(sql, params)`

- **Description:** Executes an SQL query that does not return data (e.g., INSERT, UPDATE, DELETE, CREATE TABLE).
- **Parameters:**
  - `sql` (String): The SQL query string.
  - `params` (Array): An array of parameters for the query.
- **Returns:** (Promise<Object>): Resolves with `{ id: lastInsertedRowId, changes: numberOfAffectedRows }`.

#### 5.3.2. `getQuery(sql, params)`

- **Description:** Executes an SQL query that returns a single row of data (e.g., SELECT with LIMIT 1).
- **Parameters:**
  - `sql` (String): The SQL query string.
  - `params` (Array): An array of parameters for the query.
- **Returns:** (Promise<Object | undefined>): Resolves with the first row found, or `undefined`.

#### 5.3.3. `allQuery(sql, params)`

- **Description:** Executes an SQL query that returns multiple rows of data (e.g., SELECT all).
- **Parameters:**
  - `sql` (String): The SQL query string.
  - `params` (Array): An array of parameters for the query.
- **Returns:** (Promise<Array<Object>>): Resolves with an array of all rows found.

### 5.4. Error Handling

All exposed `electronAPI` functions are designed to return Promises, allowing for standard JavaScript `try...catch` blocks and `.then().catch()` chains for error handling. It is crucial to implement robust error handling in both the renderer and main processes to provide meaningful feedback to the user and log issues for debugging.

- **Main Process:** Log detailed error messages to the console or a dedicated log file. Avoid sending sensitive error details directly to the renderer process.
- **Renderer Process:** Display user-friendly error messages. For critical errors, consider providing options to report the issue or restart the application.

### 5.5. Security Considerations

- **No Direct Node.js Access:** As emphasized, the renderer process should never have direct access to Node.js APIs. All interactions must be mediated through `contextBridge`.
- **Input Validation:** All data received from the renderer process (e.g., user input for database queries) must be rigorously validated in the main process before being used in SQL queries or other sensitive operations. This prevents common vulnerabilities like SQL injection.
- **Least Privilege:** Expose only the absolute minimum necessary functions and data through `contextBridge`. Do not expose generic database access functions if more specific, controlled functions can be provided.
- **Sensitive Data Handling:** Be extremely cautious with sensitive data (e.g., user credentials, personal information). Ensure it is handled securely, encrypted where necessary, and never exposed unnecessarily.

## 6. References

[1] Node.js Official Website: `https://nodejs.org/`
[2] nvm (Node Version Manager) GitHub Repository: `https://github.com/nvm-sh/nvm`
[3] Semantic Versioning 2.0.0: `https://semver.org/`
[4] Electron Security Checklist: `https://www.electronjs.org/docs/latest/tutorial/security`
[5] Electron `contextBridge` Documentation: `https://www.electronjs.org/docs/latest/api/context-bridge`
[6] OWASP SQL Injection Prevention Cheat Sheet: `https://cheatsheetseries.owasp.org/cheatsheets/SQL_Injection_Prevention_Cheat_Sheet.html`
[7] OWASP Password Storage Cheat Sheet: `https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html`

---

_Authored by Manus AI_
