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
    git clone https://github.com/your-username/quran-association-manager.git
    cd quran-association-manager
    ```
3.  **Create a New Branch:** Create a new branch for your feature or bug fix. Use a descriptive name (e.g., `feature/add-student-search`, `bugfix/login-issue`).
    ```bash
    git checkout -b feature/your-feature-name
    ```
4.  **Set Up Development Environment:** Follow the instructions in the [docs/dev/setup/development.md](docs/dev/setup/development.md) file to set up your local development environment, install dependencies, and run the application.
5.  **Make Your Changes:** Implement your feature or fix the bug. Ensure your code adheres to the project's coding standards and best practices.
6.  **Test Your Changes:** Run the linter and the tests to ensure your changes work as expected and do not introduce regressions. For UI changes, also run the end-to-end tests (see [docs/dev/setup/testing.md](docs/dev/setup/testing.md)).
    ```bash
    npm run lint
    npm test
    npm run test:e2e
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

## License of Contributions

By submitting a contribution you agree that it is licensed under the project's license,
CC BY-NC-SA 4.0 (see [LICENSE](LICENSE) and [NOTICE](NOTICE)).

## Coding Standards and Best Practices

- **Code Style:** Adhere to the ESLint and Prettier configurations defined in the project. Run `npm run lint` and `npm run format` before committing to ensure your code is clean and consistent.
- **Modularity:** Write modular and reusable code. Break down complex functionalities into smaller, manageable functions or components.
- **Documentation:** Document your code clearly, especially complex logic or public APIs.
- **Testing:** Write tests for new features and bug fixes. Aim for good test coverage.
- **Security:** Always consider security implications. Use parameterized queries for database interactions and validate all user inputs.

### Secure Coding

- Use parameterized SQL only (`?` placeholders). Never interpolate values into SQL strings.
- Every new IPC channel must be added to `CHANNEL_ROLES` in `src/main/ipcSecurity.js` and an argument schema in `CHANNEL_ARG_SCHEMAS` (`src/main/ipcValidation.js`), which the guard checks before the handler runs.
- Validate all input in the main process even when the renderer form already validates.
- Never log secrets, passwords, tokens, transfer keys, national IDs, or other personal data. The logger (`src/main/logger.js`) redacts known fields, but do not rely on it — avoid passing sensitive data to log calls.
- Never expose Node.js APIs (`fs`, `require`, `process`, etc.) or a generic `invoke` through the preload script (`src/main/preload.js`). Expose only named, typed methods on `window.electronAPI`.
- All password-setting flows (first-run setup, user creation, user update, profile change, forced change after legacy login) must go through `src/main/passwordPolicy.js` (bcrypt cost 10, 12+ chars, upper/lower/digit/symbol, not common, not containing username).
- See [SECURITY.md](SECURITY.md) for the vulnerability disclosure process and [docs/dev/specs/security.md](docs/dev/specs/security.md) for the full security model.

## Release Process

Releases are built by the **Release (Windows)** GitHub Actions workflow
(`.github/workflows/release.yml`):

1.  **Version:** Set the new version in `package.json` (e.g. `1.4.0` or `1.5.0-beta.1`) and move
    the `[Unreleased]` entries of `CHANGELOG.md` under that version.
2.  **Tag:** Push a tag `v` + that version (e.g. `v1.4.0`). The workflow refuses a tag that does
    not match `package.json`.
3.  **Checks:** Lint and the Jest tests run first; the installer is only built if they pass.
4.  **Build and publish:** The Windows installer is built and published as a GitHub release.
    Versions with a suffix (`-beta.1`, `-rc.1`) are published as pre-releases.

To try an installer before publishing, run the workflow by hand from the Actions tab and
download it from the run's artifacts. The installer is not code-signed yet, so Windows
SmartScreen warns on first install.
