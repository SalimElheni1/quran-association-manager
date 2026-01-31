# Quran Branch Manager

**Quran Branch Manager** is a modern, cross-platform desktop application designed to streamline the administrative operations of Quranic associations. Built with Electron and React, it provides an offline-first, secure, and user-friendly system to manage students, teachers, classes, finances, and more.

This application was developed to replace manual, paper-based workflows, offering a digital solution tailored to the needs of organizations like the National Quran Association in Tunisia.

![Application Dashboard](public/assets/screenshots/Screenshot%20from%202026-01-23%2022-52-24.png)

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

## 📸 Gallery

<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 10px;">
  <img src="public/assets/screenshots/Screenshot%20from%202026-01-23%2022-44-17.png" alt="Screenshot 1" />
  <img src="public/assets/screenshots/Screenshot%20from%202026-01-23%2022-44-49.png" alt="Screenshot 2" />
  <img src="public/assets/screenshots/Screenshot%20from%202026-01-23%2022-44-54.png" alt="Screenshot 3" />
  <img src="public/assets/screenshots/Screenshot%20from%202026-01-23%2022-45-27.png" alt="Screenshot 4" />
  <img src="public/assets/screenshots/Screenshot%20from%202026-01-23%2022-47-56.png" alt="Screenshot 5" />
  <img src="public/assets/screenshots/Screenshot%20from%202026-01-23%2022-49-50.png" alt="Screenshot 6" />
  <img src="public/assets/screenshots/Screenshot%20from%202026-01-23%2022-50-39.png" alt="Screenshot 7" />
  <img src="public/assets/screenshots/Screenshot%20from%202026-01-23%2022-51-50.png" alt="Screenshot 8" />
  <img src="public/assets/screenshots/Screenshot%20from%202026-01-23%2022-52-11.png" alt="Screenshot 9" />
</div>

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

The installer will be located in the `release/` directory. For more details, see the [Build and Packaging documentation](docs/dev/setup/building.md).

## 🏁 من هنا نبدأ (Start Here)
 
 **مرحباً بكم في تطبيق مدير الفروع القرآنية!**
 
 هذا التطبيق مصمم لتسهيل إدارة الجمعيات القرآنية. إليكم الروابط الأساسية:
 
 - **📖 [دليل المستخدم (عربي)](docs/user/manual.md):** شرح شامل لكيفية استخدام البرنامج (إضافة طلاب، تسجيل حضور، مالية).
 - **💰 [الدليل المالي (عربي)](docs/user/financial.md):** شرح خاص للنظام المالي الموحد.
 - **🔧 [حل المشاكل (عربي)](docs/user/troubleshooting.md):** ماذا تفعل إذا واجهت مشكلة؟
 
 ---
 
 ## 📚 Documentation (For Developers)
 
 Comprehensive documentation for developers and contributors.
 
 | File | Description |
 | :--- | :--- |
 | **Setup & Guides** | |
 | [`docs/dev/setup/development.md`](docs/dev/setup/development.md) | Setup Guide & Workflow. |
 | [`docs/dev/setup/building.md`](docs/dev/setup/building.md) | Build & Release Instructions. |
 | [`docs/dev/setup/testing.md`](docs/dev/setup/testing.md) | Testing Guide (Jest/Playwright). |
 | [`CONTRIBUTING.md`](CONTRIBUTING.md) | Contribution Guidelines. |
 | **Technical Specs** | |
 | [`docs/dev/specs/architecture.md`](docs/dev/specs/architecture.md) | System Architecture. |
 | [`docs/dev/specs/api.md`](docs/dev/specs/api.md) | IPC API Reference. |
 | [`docs/dev/specs/security.md`](docs/dev/specs/security.md) | Security Protocol. |
 | [`docs/dev/specs/financial-spec.md`](docs/dev/specs/financial-spec.md) | Financial Module Specification. |
 | **References** | |
 | [`docs/dev/reference/project-structure.md`](docs/dev/reference/project-structure.md) | Codebase Directory Map. |
 | [`docs/dev/troubleshooting.md`](docs/dev/troubleshooting.md) | Developer Troubleshooting. |
 
 ## 🤝 Contributing
 
 Contributions are welcome! Please read our [**Contributing Guidelines**](CONTRIBUTING.md) to get started.

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
[![zread](https://img.shields.io/badge/Ask_Zread-_.svg?style=flat&color=00b0aa&labelColor=000000&logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTQuOTYxNTYgMS42MDAxSDIuMjQxNTZDMS44ODgxIDEuNjAwMSAxLjYwMTU2IDEuODg2NjQgMS42MDE1NiAyLjI0MDFWNC45NjAxQzEuNjAxNTYgNS4zMTM1NiAxLjg4ODEgNS42MDAxIDIuMjQxNTYgNS42MDAxSDQuOTYxNTZDNS4zMTUwMiA1LjYwMDEgNS42MDE1NiA1LjMxMzU2IDUuNjAxNTYgNC45NjAxVjIuMjQwMUM1LjYwMTU2IDEuODg2NjQgNS4zMTUwMiAxLjYwMDEgNC45NjE1NiAxLjYwMDFaIiBmaWxsPSIjZmZmIi8%2BCjxwYXRoIGQ9Ik00Ljk2MTU2IDEwLjM5OTlIMi4yNDE1NkMxLjg4ODEgMTAuMzk5OSAxLjYwMTU2IDEwLjY4NjQgMS42MDE1NiAxMS4wMzk5VjEzLjc1OTlDMS42MDE1NiAxNC4xMTM0IDEuODg4MSAxNC4zOTk5IDIuMjQxNTYgMTQuMzk5OUg0Ljk2MTU2QzUuMzE1MDIgMTQuMzk5OSA1LjYwMTU2IDE0LjExMzQgNS42MDE1NiAxMy43NTk5VjExLjAzOTlDNS42MDE1NiAxMC42ODY0IDUuMzE1MDIgMTAuMzk5OSA0Ljk2MTU2IDEwLjM5OTlaIiBmaWxsPSIjZmZmIi8%2BCjxwYXRoIGQ9Ik0xMy43NTg0IDEuNjAwMUgxMS4wMzg0QzEwLjY4NSAxLjYwMDEgMTAuMzk4NCAxLjg4NjY0IDEwLjM5ODQgMi4yNDAxVjQuOTYwMUMxMC4zOTg0IDUuMzEzNTYgMTAuNjg1IDUuNjAwMSAxMS4wMzg0IDUuNjAwMUgxMy43NTg0QzE0LjExMTkgNS42MDAxIDE0LjM5ODQgNS4zMTM1NiAxNC4zOTg0IDQuOTYwMVYyLjI0MDFDMTQuMzk4NCAxLjg4NjY0IDE0LjExMTkgMS42MDAxIDEzLjc1ODQgMS42MDAxWiIgZmlsbD0iI2ZmZiIvPgo8cGF0aCBkPSJNNCAxMkwxMiA0TDQgMTJaIiBmaWxsPSIjZmZmIi8%2BCjxwYXRoIGQ9Ik00IDEyTDEyIDQiIHN0cm9rZT0iI2ZmZiIgc3Ryb2tlLXdpZHRoPSIxLjUiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgo8L3N2Zz4K&logoColor=ffffff)](https://zread.ai/SalimElheni1/quran-association-manager)
