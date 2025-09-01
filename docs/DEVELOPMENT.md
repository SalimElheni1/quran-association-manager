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

**Developer Note on RTL Implementation:**
Implementing and maintaining the Right-to-Left (RTL) layout for the Arabic interface is primarily handled by two things:
1.  **HTML `dir` attribute:** The root `index.html` file has `dir="rtl"` set on the `<html>` tag. This is the most important step, as it signals to the browser and Bootstrap to flip the layout.
2.  **Bootstrap's RTL Support:** Bootstrap 5 has native RTL support. When `dir="rtl"` is detected, Bootstrap automatically reverses its grid system, flex utilities, margins, paddings, and component alignments. For example, `ms-auto` (margin-start) will apply a margin to the right in an RTL layout, instead of the left.
3.  **Custom CSS:** For any custom components or styles, developers must be mindful of RTL. Instead of using `margin-left` or `padding-right`, use logical properties like `margin-inline-start` and `padding-inline-end`. This ensures the styles work correctly in both LTR and RTL contexts without extra code.

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

## 4. Database Schema

This section provides a detailed and up-to-date overview of the SQLite database schema used by the Quran Branch Manager application. The schema is the single source of truth for all data structures.

### 4.1. Entity-Relationship Diagram (ERD)

A visual representation of the database schema helps in understanding the relationships between different tables.

*(A text-based ERD can be added here for clarity if needed, or a link to a generated diagram.)*

```mermaid
erDiagram
    users ||--o{ branches : "can be associated with"
    students ||--o{ branches : "belongs to"
    teachers ||--o{ branches : "belongs to"
    classes ||--|{ teachers : "is taught by"
    class_students }|--|| classes : "enrollment"
    class_students }|--|| students : "enrollment"
    attendance }|--|| students : "records for"
    attendance }|--|| classes : "records for"
    payments }|--|| students : "made by"
    salaries }|--|| teachers : "paid to"

    users {
        INTEGER id PK
        TEXT username UNIQUE
        TEXT password
        TEXT first_name
        TEXT last_name
        DATE date_of_birth
        TEXT national_id UNIQUE
        TEXT email UNIQUE
        TEXT phone_number
        TEXT occupation
        TEXT civil_status
        TEXT employment_type
        DATE start_date
        DATE end_date
        TEXT role
        TEXT status
        TEXT notes
        DATETIME created_at
        INTEGER branch_id FK
    }

    branches {
        INTEGER id PK
        TEXT name UNIQUE
        TEXT location
        DATETIME created_at
    }

    students {
        INTEGER id PK
        TEXT name
        DATE date_of_birth
        TEXT gender
        TEXT address
        TEXT contact_info
        TEXT email
        DATETIME enrollment_date
        TEXT status
        INTEGER branch_id FK
        TEXT memorization_level
        TEXT notes
        TEXT parent_name
        TEXT guardian_relation
        TEXT parent_contact
        TEXT guardian_email
        TEXT emergency_contact_name
        TEXT emergency_contact_phone
        TEXT health_conditions
        TEXT national_id
        TEXT school_name
        TEXT grade_level
        TEXT educational_level
        TEXT occupation
        TEXT civil_status
        TEXT related_family_members
        TEXT financial_assistance_notes
    }

    teachers {
        INTEGER id PK
        TEXT name
        TEXT national_id
        TEXT contact_info
        TEXT email
        TEXT address
        DATE date_of_birth
        TEXT gender
        TEXT educational_level
        TEXT specialization
        INTEGER years_of_experience
        TEXT availability
        TEXT notes
        DATETIME created_at
        INTEGER branch_id FK
    }

    classes {
        INTEGER id PK
        TEXT name
        TEXT class_type
        INTEGER teacher_id FK
        TEXT schedule
        DATE start_date
        DATE end_date
        TEXT status
        INTEGER capacity
        DATETIME created_at
        TEXT gender
    }

    class_students {
        INTEGER class_id PK, FK
        INTEGER student_id PK, FK
        DATETIME enrollment_date
    }

    attendance {
        INTEGER student_id PK, FK
        INTEGER class_id PK, FK
        TEXT date PK
        TEXT status
    }

    payments {
        INTEGER id PK
        INTEGER student_id FK
        REAL amount
        DATETIME payment_date
        TEXT payment_method
        TEXT notes
        DATETIME created_at
        DATETIME updated_at
    }

    salaries {
        INTEGER id PK
        INTEGER teacher_id FK
        REAL amount
        DATETIME payment_date
        TEXT notes
        DATETIME created_at
        DATETIME updated_at
    }

    donations {
        INTEGER id PK
        TEXT donor_name
        REAL amount
        DATETIME donation_date
        TEXT donation_type
        TEXT description
        TEXT notes
        DATETIME created_at
        DATETIME updated_at
    }

    expenses {
        INTEGER id PK
        TEXT category
        REAL amount
        DATETIME expense_date
        TEXT responsible_person
        TEXT description
        DATETIME created_at
        DATETIME updated_at
    }

    settings {
        TEXT key PK
        TEXT value
    }

    migrations {
        INTEGER id PK
        TEXT name UNIQUE
        DATETIME applied_at
    }
```

### 4.2. Detailed Table Definitions

This section provides the `CREATE TABLE` statements as the definitive source for the database structure.

#### `users`
Manages user accounts, credentials, personal information, and role-based access.
```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  date_of_birth DATE,
  national_id TEXT UNIQUE,
  email TEXT UNIQUE,
  phone_number TEXT,
  occupation TEXT,
  civil_status TEXT CHECK(civil_status IN ('Single', 'Married', 'Divorced', 'Widowed')),
  employment_type TEXT CHECK(employment_type IN ('volunteer', 'contract')),
  start_date DATE,
  end_date DATE,
  role TEXT NOT NULL CHECK(role IN (
    'Superadmin',
    'Manager',
    'FinanceManager',
    'Admin',
    'SessionSupervisor'
  )),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  branch_id INTEGER,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
);
```

#### `students`
Stores comprehensive records for all students.
```sql
CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  date_of_birth DATE,
  gender TEXT,
  address TEXT,
  contact_info TEXT,
  email TEXT,
  enrollment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'active',
  branch_id INTEGER,
  memorization_level TEXT,
  notes TEXT,
  parent_name TEXT,
  guardian_relation TEXT,
  parent_contact TEXT,
  guardian_email TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  health_conditions TEXT,
  national_id TEXT,
  school_name TEXT,
  grade_level TEXT,
  educational_level TEXT,
  occupation TEXT,
  civil_status TEXT,
  related_family_members TEXT,
  financial_assistance_notes TEXT,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
);
```

#### `teachers`
Stores comprehensive profiles for all teachers.
```sql
CREATE TABLE IF NOT EXISTS teachers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  national_id TEXT,
  contact_info TEXT,
  email TEXT,
  address TEXT,
  date_of_birth DATE,
  gender TEXT,
  educational_level TEXT,
  specialization TEXT,
  years_of_experience INTEGER,
  availability TEXT,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  branch_id INTEGER,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE SET NULL
);
```

#### `classes`
Manages information about classes, schedules, and assignments.
```sql
CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  class_type TEXT,
  teacher_id INTEGER,
  schedule TEXT, -- JSON array of objects, e.g., [{"day": "Monday", "time": "After Asr"}]
  start_date DATE,
  end_date DATE,
  status TEXT DEFAULT 'pending', -- pending, active, completed
  capacity INTEGER,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  gender TEXT CHECK(gender IN ('women', 'men', 'kids', 'all')) DEFAULT 'all',
  FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE SET NULL
);
```

#### `class_students` (Junction Table)
Links students to the classes they are enrolled in, creating a many-to-many relationship.
```sql
CREATE TABLE IF NOT EXISTS class_students (
  class_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  enrollment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (class_id, student_id),
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);
```

#### `attendance`
Records student attendance for each class session.
```sql
CREATE TABLE IF NOT EXISTS attendance (
  student_id INTEGER NOT NULL,
  class_id INTEGER NOT NULL,
  date TEXT NOT NULL, -- Storing date as YYYY-MM-DD text
  status TEXT NOT NULL CHECK(status IN ('present', 'absent', 'late')),
  PRIMARY KEY (class_id, student_id, date),
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
);
```

#### `branches`
Manages the different physical or logical branches of the association.
```sql
CREATE TABLE IF NOT EXISTS branches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  location TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### Financial Tables
These tables support the financial management module.

##### `payments`
Tracks student tuition fees and other payments.
```sql
CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    payment_method TEXT,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);
```

##### `salaries`
Tracks salary payments made to teachers and staff.
```sql
CREATE TABLE IF NOT EXISTS salaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    teacher_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    payment_date DATETIME NOT NULL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE
);
```

##### `donations`
Records all donations received, both cash and in-kind.
```sql
CREATE TABLE IF NOT EXISTS donations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    donor_name TEXT NOT NULL,
    amount REAL, -- Null for in-kind donations
    donation_date DATETIME NOT NULL,
    donation_type TEXT NOT NULL DEFAULT 'Cash' CHECK(donation_type IN ('Cash', 'In-kind')),
    description TEXT, -- For in-kind donations
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

##### `expenses`
Tracks all organizational expenses.
```sql
CREATE TABLE IF NOT EXISTS expenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category TEXT NOT NULL,
    amount REAL NOT NULL,
    expense_date DATETIME NOT NULL,
    responsible_person TEXT,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### System Tables
These tables are used for internal application management.

##### `settings`
Stores key-value pairs for application settings.
```sql
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT
);
```

##### `migrations`
Tracks which database schema migrations have been applied.
```sql
CREATE TABLE IF NOT EXISTS migrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 4.3. Schema Migration Strategy

As the application evolves, the database schema will change. A robust migration strategy is essential to manage these changes without data loss. This project uses a simple, manual migration system located in `src/db/migrations/`.

- **How it Works:** Each migration is a separate `.sql` file (e.g., `001-update-users-table.sql`) containing the `ALTER TABLE` or other SQL commands needed to update the schema.
- **Applying Migrations:** The application checks the `migrations` table to see which migrations have already been applied and runs any new ones in order during startup.
- **Creating a New Migration:** To make a schema change, create a new SQL file with an incrementing number, add your SQL commands, and place it in the `src/db/migrations/` directory.

## 5. API Reference (IPC)

This section details the secure communication channels between the Electron main process (backend) and the renderer process (frontend).

### 5.1. IPC Philosophy

The application uses Electron's Inter-Process Communication (IPC) to allow the frontend to securely request data and trigger actions on the backend. The API is designed around a feature-based, namespaced model rather than generic database access.

- **Security:** All IPC channels are exposed securely via a `preload.js` script using `contextBridge`. The renderer process has no direct access to Node.js or the database.
- **Namespacing:** Channels are namespaced by feature (e.g., `students:get`, `classes:add`) for clarity and organization.
- **Asynchronous:** All calls return a Promise, allowing for modern `async/await` syntax on the frontend.

### 5.2. Core API Namespaces

The following is a high-level overview of the available API namespaces. For the exact function signatures, parameters, and return values, developers should consult the handler files located in `src/main/handlers/` and `src/main/financialHandlers.js`.

| Namespace | File | Description |
| :--- | :--- | :---------- |
| `auth:` | `authHandlers.js` | Handles user login, profile updates, and password changes. |
| `users:` | `userHandlers.js` | Full CRUD (Create, Read, Update, Delete) operations for user management. |
| `students:` | `studentHandlers.js`| Full CRUD operations for student records. |
| `teachers:` | `teacherHandlers.js`| Full CRUD operations for teacher records. |
| `classes:` | `classHandlers.js` | Full CRUD operations for classes and student enrollment. |
| `attendance:` | `attendanceHandlers.js`| Manages getting and saving attendance records. |
| `financials:*` | `financialHandlers.js`| A suite of handlers for all financial entities: `payments`, `salaries`, `donations`, `expenses`, and summary reports. |
| `settings:` | `settingsHandlers.js`| Manages getting and updating application settings, including logo uploads. |
| `system:` | `systemHandlers.js` | Handles system-level operations like data export/import, backups, and dialogs. |
| `(root)` | `index.js` | A few root-level handlers for general app info like `get-is-packaged`. |

### 5.3. Example Usage

Here is an example of how the frontend might fetch a list of students from a React component.

```javascript
// src/renderer/pages/StudentsPage.jsx

import React, { useState, useEffect } from 'react';

function StudentsPage() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchStudents() {
      try {
        // The 'window.electronAPI' object is exposed by the preload script.
        // We call the 'students:get' channel, which is handled in src/main/handlers/studentHandlers.js
        const fetchedStudents = await window.electronAPI.invoke('students:get');
        setStudents(fetchedStudents);
      } catch (err) {
        setError(err.message);
        console.error('Failed to fetch students:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchStudents();
  }, []);

  if (loading) return <div>Loading students...</div>;
  if (error) return <div style={{ color: 'red' }}>Error: {error}</div>;

  return (
    <div>
      <h1>Students</h1>
      <ul>
        {students.map(student => (
          <li key={student.id}>{student.name}</li>
        ))}
      </ul>
    </div>
  );
}

export default StudentsPage;
```

This example demonstrates:
1.  Calling the IPC channel via `window.electronAPI.invoke()`.
2.  Using a specific, namespaced channel: `'students:get'`.
3.  Handling the asynchronous response with `async/await` inside a `try...catch` block.

Developers should follow this pattern for all interactions with the main process.

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
