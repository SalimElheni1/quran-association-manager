# Contributing to Quran Branch Manager

We welcome contributions to the Quran Branch Manager project! Whether you're a developer, designer, or tester, your input is valuable. This guide outlines the process for contributing to the codebase, reporting issues, and suggesting enhancements.

First and foremost, please review our [Code of Conduct](CODE_OF_CONDUCT.md) to ensure we maintain a welcoming and inclusive environment for all contributors.

## How to Contribute

### Reporting Bugs

If you find a bug, please open an issue on our GitHub repository. Provide a clear and concise description of the bug, steps to reproduce it, and the expected behavior. Include screenshots if possible.

### Suggesting Enhancements

Have an idea for a new feature or an improvement? Open an issue to discuss your suggestion. Clearly describe the enhancement and its potential benefits. This allows the community to discuss the proposal before any code is written.

### Contributing Code

1.  **Fork the Repository:** Start by forking the main project repository on GitHub.
2.  **Clone Your Fork:** Clone your forked repository to your local machine.
    ```bash
    git clone https://github.com/your-username/quran-branch-manager.git
    ```
3.  **Create a New Branch:** Create a new branch for your feature or bug fix. Use a descriptive name (e.g., `feature/add-student-search`, `bugfix/login-issue`).
    ```bash
    git checkout -b feature/your-feature-name
    ```
4.  **Set Up Development Environment:** Follow the instructions in the [DEVELOPMENT.md](docs/DEVELOPMENT.md) file to set up your local development environment, install dependencies, and run the application.
5.  **Make Your Changes:** Implement your feature or fix the bug. Ensure your code adheres to the project's coding standards and best practices.
6.  **Test Your Changes:** Run all relevant tests to ensure your changes work as expected and do not introduce regressions.
    ```bash
    npm test
    ```
7.  **Commit Your Changes:** Write clear and concise commit messages following conventional commit standards.
    ```bash
    git commit -m "feat: Add student search functionality"
    ```
8.  **Push to Your Fork:** Push your new branch to your forked repository.
    ```bash
    git push origin feature/your-feature-name
    ```
9.  **Create a Pull Request (PR):** Open a pull request from your branch to the `main` branch of the original repository. Provide a detailed description of your changes and reference any related issues.

## Coding Standards and Best Practices

- **Code Style:** Adhere to the ESLint and Prettier configurations defined in the project. Run `npm run lint` and `npm run format` before committing to ensure your code is clean and consistent.
- **Modularity:** Write modular and reusable code. Break down complex functionalities into smaller, manageable functions or components.
- **Documentation:** Document your code clearly, especially complex logic or public APIs.
- **Testing:** Write tests for new features and bug fixes. Aim for good test coverage.
- **Security:** Always consider security implications. Use parameterized queries for database interactions and validate all user inputs.

## Release Process

New versions of the application are released periodically. The release process involves:

1.  **Feature Freeze:** All new features are halted.
2.  **Testing Phase:** Extensive testing is conducted to identify and fix any remaining bugs.
3.  **Documentation Update:** User and technical documentation are updated to reflect new features and changes.
4.  **Build and Package:** The application is built and packaged for all supported platforms using Electron Builder.
5.  **Code Signing:** The builds are digitally signed for security and authenticity.
6.  **Release Notes:** Comprehensive release notes are prepared, detailing new features, bug fixes, and known issues. This is often managed in a `CHANGELOG.md` file.
7.  **Deployment:** The new version is deployed to the distribution channels (e.g., GitHub Releases).
