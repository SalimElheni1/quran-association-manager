# Quran Branch Manager

**Quran Branch Manager** is a modern, cross-platform desktop application designed to streamline the administrative operations of Quranic associations. Built with Electron and React, it provides an offline-first, secure, and user-friendly system to manage students, teachers, classes, finances, and more.

This application was developed to replace manual, paper-based workflows, offering a digital solution tailored to the needs of organizations like the National Quran Association in Tunisia.

![Screenshot of the application dashboard](public/assets/logos/icon.png)
_(Note: This is a placeholder image. A real screenshot should be added here.)_

## ✨ Features

- **Student Management:** Enroll students, track memorization progress, and manage personal and contact information.
- **Teacher & Class Management:** Manage teacher profiles, create class schedules, and assign students and teachers to classes.
- **Attendance Tracking:** Record and monitor student attendance with ease, and generate detailed reports.
- **Financial Management:** A complete module to track student payments, teacher salaries, donations (cash and in-kind), and general expenses.
- **Comprehensive Reporting:** Generate and export detailed reports for students, attendance, and financials in both PDF and Excel formats.
- **Role-Based Access Control:** Secure login system with distinct roles (Superadmin, Branch Admin, Teacher) to ensure data privacy and security.
- **Offline-First:** The application is designed to work seamlessly without an internet connection, storing all data locally and securely on your computer.
- **Arabic Language Support:** A full Right-to-Left (RTL) interface designed for Arabic-speaking users.
- **Data Backup & Export:** Tools to back up the database and export data for external use.

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v22.x.x or later)
- [npm](https://www.npmjs.com/) (v10.x.x or later)

### Development

To run the application in development mode with live reloading:

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/quran-branch-manager.git
    cd quran-branch-manager
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Run the development server:**
    ```bash
    npm run dev
    ```

### Building for Production

To build the application and create a distributable installer for your platform:

```bash
npm run dist
```

The installer will be located in the `release/` directory. For more details, see the [Build and Packaging documentation](docs/BUILD_AND_PACKAGING.md).

## 📚 Documentation

We provide comprehensive documentation to help you understand, use, and contribute to the project.

| File                                                         | Description                                         |
| :----------------------------------------------------------- | :-------------------------------------------------- |
| **User & Contributor Docs**                                  |                                                     |
| [`docs/USAGE.md`](docs/USAGE.md)                             | A detailed user guide for all application features. |
| [`CONTRIBUTING.md`](CONTRIBUTING.md)                         | Guidelines for contributing to the project.         |
| [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md)                   | Our community standards and code of conduct.        |
| [`CHANGELOG.md`](CHANGELOG.md)                               | A log of all notable changes to the project.        |
| **Developer Docs**                                           |                                                     |
| [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md)                 | In-depth technical documentation for developers.    |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)               | Application architecture and design patterns.       |
| [`docs/API_REFERENCE.md`](docs/API_REFERENCE.md)             | Complete IPC API reference documentation.           |
| [`docs/TESTING.md`](docs/TESTING.md)                         | Comprehensive testing guide and best practices.     |
| [`docs/SECURITY.md`](docs/SECURITY.md)                       | Security architecture and best practices.           |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)                   | Complete deployment and distribution guide.         |
| [`docs/TROUBLESHOOTING.md`](docs/TROUBLESHOOTING.md)         | Common issues and solutions guide.                  |
| [`docs/BUILD_AND_PACKAGING.md`](docs/BUILD_AND_PACKAGING.md) | Instructions for building the app from source.      |

## 🤝 Contributing

Contributions are welcome! We value our community and appreciate any help, from reporting bugs to submitting new features. Please read our [**Contributing Guidelines**](CONTRIBUTING.md) to get started.

To ensure a welcoming and inclusive environment, all contributors are expected to adhere to our [**Code of Conduct**](CODE_OF_CONDUCT.md).

## 🐞 Reporting Bugs

If you encounter a bug or an issue with the application, we encourage you to report it so we can improve the software for everyone.

The easiest way to report a bug is through the application itself:

1.  Navigate to the **"حول التطبيق"** (About) page from the main menu.
2.  In the **"الإبلاغ عن خطأ"** (Report a Bug) section, you will find instructions and buttons to contact us.
3.  Choose your preferred method (Email or WhatsApp) to send a pre-filled bug report template.
4.  Please provide as much detail as possible, including:
    - Steps to reproduce the error.
    - What you expected to happen.
    - What actually happened.
    - A screenshot of the error, if possible.

Your feedback is crucial for the stability and improvement of the application.

## 📄 License

This project is licensed under the **Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License**. See the [**LICENSE**](LICENSE) file for the full license text.

---

_This project was developed with assistance from AI tools like Manus, Google Gemini Code Assist, and Jules._
