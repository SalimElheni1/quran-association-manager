# User-Facing Documentation: Quran Branch Manager

This document provides essential information for users, stakeholders, and contributors of the Quran Branch Manager application. It covers the application's requirements, a user guide, and guidelines for contributing to the project.

## 1. Requirements

This section outlines the functional and non-functional requirements for the Quran Branch Manager application. It details what the system is expected to do and the quality attributes it must possess.

### 1.1. Functional Requirements

Functional requirements describe the specific actions or functions the system must perform. Features marked with (MVP) are part of the Minimum Viable Product.

- **Student Management:** (MVP Priority)
  - Enroll new students. (MVP)
  - Track student progress and memorization levels. (MVP)
  - Manage student contact information and parent details. (MVP)
  - Search and filter student records. (MVP)
- **Teacher Management:** (MVP Priority)
  - Add and manage teacher profiles. (MVP)
  - Assign teachers to classes. (MVP)
  - Track teacher availability and specialization. (MVP)
- **Class Management:** (MVP Priority)
  - Create and schedule classes. (MVP)
  - Assign students and teachers to classes. (MVP)
  - Manage class schedules and locations. (MVP)
- **Attendance Monitoring:** (MVP Priority)
  - Record student attendance (present, absent, late). (MVP)
  - Generate attendance reports for individual students and classes. (MVP)
- **Financial Tracking (Implied from JSON, not detailed in MD):**
  - _This feature is deferred to Phase 2 to focus the MVP on core educational management._
- **Reporting:** (MVP Priority)
  - Generate student progress reports. (MVP)
  - Generate class attendance reports. (MVP)
  - Export reports to PDF (using PDFKit) and Excel (using ExcelJS). (MVP)
- **User Authentication & Authorization:** (MVP Priority)
  - Secure user login with role-based access control (RBAC). (MVP)
  - Support for Superadmin, Branch Admin, and Teacher roles. (MVP)
- **Data Import (Noted in MD as future consideration, but mentioned in JSON):**
  - Ability to import existing data from previous systems (e.g., Excel). (Phase 2)

### 1.2. Non-Functional Requirements

Non-functional requirements specify criteria that can be used to judge the operation of a system, rather than specific behaviors. They define the system's quality attributes.

- **Performance:**
  - Dashboard loading times: Target specific benchmarks for quick loading.
  - Record handling capacity: Efficiently manage a large number of student, teacher, and class records.
  - Report generation speed: Generate reports within acceptable timeframes.
- **Security:**
  - Password hashing for all user credentials.
  - Role-based access control (RBAC) to restrict access based on user roles.
  - Rigorous input validation to prevent common vulnerabilities like SQL injection.
  - Secure local storage and robust validation mechanisms for JWT.
- **Usability & Accessibility:**
  - Intuitive and user-friendly interface.
  - Comprehensive Arabic language support.
  - Native Right-to-Left (RTL) interface design.
  - Respectful, Islamic-aligned UI elements.
  - Dark Mode support for user comfort.
  - Accessibility for users with varied technical literacy.
  - Adherence to WCAG (Web Content Accessibility Guidelines) principles for inclusive design.
- **Reliability & Data Integrity:**
  - Offline-first functionality: Ensure data availability and performance without internet connectivity.
  - Persistent local data storage (SQLite).
  - Data backup and recovery mechanisms.
  - Idempotent database initialization.
- **Maintainability:**
  - Modular code structure.
  - Comprehensive documentation.
  - Robust version control.
- **Scalability:**
  - Designed for future web-based expansion (desktop-to-web model).
  - Support for multiple branches (if implemented in the database schema).
- **Compatibility:**
  - Cross-platform desktop application (Windows 10/11, optionally macOS).

## 2. User Guide

This guide provides a comprehensive overview of how to use the Quran Branch Manager application, designed for branch administrators, teachers, and regional managers. It covers key functionalities, from initial login to managing students, classes, and generating reports.

### 2.1. Getting Started: Installation and First Login

#### 2.1.1. Installation

To install the Quran Branch Manager application, follow these steps:

1.  **Download the Installer:** Obtain the latest installer for your operating system (Windows, macOS, or Linux) from the official release page or your system administrator.
2.  **Run the Installer:**
    - **Windows:** Double-click the `.exe` file and follow the on-screen prompts.
    - **macOS:** Open the `.dmg` file and drag the application icon to your Applications folder.
    - **Linux:** For `.AppImage` files, make it executable (`chmod +x YourApp.AppImage`) and then run it. For `.deb` or `.rpm` packages, use your system's package manager.
3.  **Launch the Application:** Once installed, launch the application from your desktop, Start Menu (Windows), Applications folder (macOS), or application launcher (Linux).

#### 2.1.2. First-Time Setup and Login

Upon launching the application for the first time, you will be presented with a login screen. If this is the very first launch after installation, the application might prompt you to create an initial administrator account. Follow the instructions provided on screen.

1.  **Enter Credentials:** Input your `username` and `password` in the respective fields.
2.  **Select Role (if applicable):** If your account has multiple roles, you might be prompted to select your desired role for the session.
3.  **Click Login:** Press the

Login\*\* button.

### 2.2. Dashboard Overview

After successful login, you will be directed to the main dashboard. The dashboard provides a quick overview of key metrics and quick access to frequently used features.

- **Navigation Sidebar:** On the left (or right for RTL layout), you will find a navigation sidebar with links to different sections of the application (e.g., Students, Teachers, Classes, Reports, Settings).
- **KPI Cards:** Key Performance Indicator (KPI) cards display important statistics such as the number of active students, teachers, and classes. These cards provide a snapshot of the association's operational health.
- **Quick Actions:** A section for quick access buttons to common tasks like

Add New Student**, **Add New Teacher\*\*, etc.

- **Recent Activity Feed:** Displays a chronological list of recent actions and events within the application.

### 2.3. Managing Students

This section details how to manage student records within the application.

#### 2.3.1. Adding a New Student

1.  Navigate to the **Students** section from the sidebar.
2.  Click the **Add New Student** button.
3.  Fill in the student's details in the form provided, including name, age, gender, enrollment date, and contact information. Ensure all required fields are completed.
4.  Select the appropriate branch the student will be associated with.
5.  Enter the parent's name and contact information.
6.  Click **Save** to add the student record.

#### 2.3.2. Viewing and Editing Student Details

1.  From the **Students** section, you will see a list of all enrolled students.
2.  Use the search bar and filters to find a specific student.
3.  Click on a student's name or the **Edit** icon next to their record to view and modify their details.
4.  Make the necessary changes and click **Save** to update the record.

#### 2.3.3. Tracking Memorization Levels

1.  Within a student's detail view, locate the **Memorization Level** field.
2.  Update this field as the student progresses through their Quran memorization journey.

### 2.4. Managing Teachers

This section outlines the process for managing teacher profiles.

#### 2.4.1. Adding a New Teacher

1.  Navigate to the **Teachers** section from the sidebar.
2.  Click the **Add New Teacher** button.
3.  Fill in the teacher's name, contact information, and specialization.
4.  Click **Save** to add the teacher record.

#### 2.4.2. Viewing and Editing Teacher Details

1.  From the **Teachers** section, you will see a list of all registered teachers.
2.  Use the search bar to find a specific teacher.
3.  Click on a teacher's name or the **Edit** icon to view and modify their profile.
4.  Make the necessary changes and click **Save** to update the record.

### 2.5. Managing Classes

This section describes how to create and manage classes.

#### 2.5.1. Creating a New Class

1.  Navigate to the **Classes** section from the sidebar.
2.  Click the **Create New Class** button.
3.  Enter the class name, select the assigned teacher, and specify the class schedule.
4.  Click **Save** to create the class.

#### 2.5.2. Assigning Students to Classes

1.  From the **Classes** section, select the class you wish to manage.
2.  Click the **Manage Students** button.
3.  From the list of available students, select those you wish to enroll in this class.
4.  Click **Assign** to confirm the student assignments.

### 2.6. Monitoring Attendance

This section explains how to record and view student attendance.

#### 2.6.1. Recording Attendance

1.  Navigate to the **Attendance** section or directly access attendance recording from a specific class view.
2.  Select the class and the date for which you want to record attendance.
3.  For each student in the class, mark their status as **Present**, **Absent**, or **Late**.
4.  Click **Save Attendance** to record the entries.

#### 2.6.2. Viewing Attendance Reports

1.  From the **Reports** section, select **Attendance Reports**.
2.  Choose the desired class, student, and date range.
3.  Generate the report to view attendance summaries and details.

### 2.7. Generating Reports

The application allows you to generate various reports for analysis and record-keeping.

1.  Navigate to the **Reports** section from the sidebar.
2.  Select the type of report you wish to generate (e.g., Student Progress Report, Class Attendance Report).
3.  Specify the required parameters (e.g., student name, class, date range).
4.  Choose the output format: **PDF** or **Excel**.
5.  Click **Generate Report**.

### 2.8. User Role Management (Superadmin Functionality)

For Superadmin users, the application provides functionalities to manage user accounts and assign roles.

1.  Navigate to the **User Management** section.
2.  View existing users, add new users, or edit user roles (Superadmin, Branch Admin, Teacher).
3.  Ensure that roles are assigned appropriately to maintain security and access control.

### 2.9. Managing Your Profile

All users can manage their own personal information and change their password through the Profile page.

1.  **Accessing Your Profile:** Click on the **الملف الشخصي** (Profile) link in the navigation sidebar to open your profile page.
2.  **Updating Your Information:**
    - The form is pre-filled with your current information across several sections: Personal, Contact, and Employment.
    - You can edit any of the fields that are not marked as read-only.
    - After making your changes, click the **حفظ التغييرات** (Save Changes) button at the bottom of the page.
3.  **Changing Your Password:**
    - To change your password, you must fill out the three fields in the "Change Password" section.
    - **Current Password:** Enter the password you used to log in. This is required for security.
    - **New Password:** Enter your new desired password. It must be at least 8 characters long.
    - **Confirm New Password:** Re-enter your new password to ensure it is correct.
    - When you click **Save Changes**, your password will be updated along with any other profile information you changed. If you do not wish to change your password, simply leave these fields blank.

## 3. Contributing to the Project

We welcome contributions to the Quran Branch Manager project! Whether you're a developer, designer, or tester, your input is valuable. This guide outlines the process for contributing to the codebase, reporting issues, and suggesting enhancements.

### 3.1. Code of Conduct

To ensure a welcoming and inclusive environment for all contributors, we adhere to a Code of Conduct. Please review it before contributing.

### 3.2. How to Contribute

#### 3.2.1. Reporting Bugs

If you find a bug, please open an issue on our GitHub repository. Provide a clear and concise description of the bug, steps to reproduce it, and expected behavior.

#### 3.2.2. Suggesting Enhancements

Have an idea for a new feature or an improvement? Open an issue to discuss your suggestion. Clearly describe the enhancement and its potential benefits.

#### 3.2.3. Contributing Code

1.  **Fork the Repository:** Start by forking the main project repository on GitHub.
2.  **Clone Your Fork:** Clone your forked repository to your local machine.
    ```bash
    git clone https://github.com/your-username/quran-branch-manager.git
    ```
3.  **Create a New Branch:** Create a new branch for your feature or bug fix. Use a descriptive name (e.g., `feature/add-student-search`, `bugfix/login-issue`).
    ```bash
    git checkout -b feature/your-feature-name
    ```
4.  **Set Up Development Environment:** Follow the instructions in the `Technical_Documentation.md` file to set up your local development environment.
5.  **Make Your Changes:** Implement your feature or fix the bug. Ensure your code adheres to the project's coding standards and best practices.
6.  **Test Your Changes:** Run all relevant tests (unit, integration, E2E) to ensure your changes work as expected and do not introduce regressions.
7.  **Commit Your Changes:** Write clear and concise commit messages.
    ```bash
    git commit -m "feat: Add student search functionality"
    ```
8.  **Push to Your Fork:** Push your new branch to your forked repository.
    ```bash
    git push origin feature/your-feature-name
    ```
9.  **Create a Pull Request (PR):** Open a pull request from your branch to the `main` branch of the original repository. Provide a detailed description of your changes and reference any related issues.

### 3.3. Coding Standards and Best Practices

- **Code Style:** Adhere to the ESLint and Prettier configurations defined in the project. Run `npm run lint` and `npm run format` before committing.
- **Modularity:** Write modular and reusable code. Break down complex functionalities into smaller, manageable functions or components.
- **Documentation:** Document your code clearly, especially complex logic or public APIs.
- **Testing:** Write tests for new features and bug fixes. Aim for good test coverage.
- **Security:** Always consider security implications. Use parameterized queries for database interactions and validate all user inputs.

### 3.4. Release Process

New versions of the application are released periodically. The release process involves:

1.  **Feature Freeze:** All new features are halted.
2.  **Testing Phase:** Extensive testing is conducted to identify and fix any remaining bugs.
3.  **Documentation Update:** User and technical documentation are updated to reflect new features and changes.
4.  **Build and Package:** The application is built and packaged for all supported platforms using Electron Builder.
5.  **Code Signing:** The builds are digitally signed for security and authenticity.
6.  **Release Notes:** Comprehensive release notes are prepared, detailing new features, bug fixes, and known issues.
7.  **Deployment:** The new version is deployed to the distribution channels.

---

_Authored by Manus AI_
