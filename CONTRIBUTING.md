# Contributing

Bug reports and suggestions go in a GitHub issue: what you did, what you expected, what
happened, and a screenshot if you can. For a security problem, follow [SECURITY.md](SECURITY.md)
instead of opening an issue.

For code, fork the repository, work on a branch, and open a pull request to `main`. Setup is in
[docs/dev/setup/development.md](docs/dev/setup/development.md). Before opening the PR:

```bash
npm run lint
npm test
npm run test:e2e   # for UI changes, see docs/dev/setup/testing.md
```

Commit messages follow Conventional Commits (`feat: …`, `fix: …`, `docs: …`).

By submitting a contribution you agree that it is licensed under the project's license,
CC BY-NC-SA 4.0 (see [LICENSE](LICENSE) and [NOTICE](NOTICE)).

## Secure coding

- Use parameterized SQL only (`?` placeholders). Never interpolate values into SQL strings.
- Every new IPC channel must be added to `CHANNEL_ROLES` in `src/main/ipcSecurity.js` and an argument schema in `CHANNEL_ARG_SCHEMAS` (`src/main/ipcValidation.js`), which the guard checks before the handler runs.
- Validate all input in the main process even when the renderer form already validates.
- Never log secrets, passwords, tokens, transfer keys, national IDs, or other personal data. The logger (`src/main/logger.js`) redacts known fields, but do not rely on it — avoid passing sensitive data to log calls.
- Never expose Node.js APIs (`fs`, `require`, `process`, etc.) or a generic `invoke` through the preload script (`src/main/preload.js`). Expose only named, typed methods on `window.electronAPI`.
- All password-setting flows (first-run setup, user creation, user update, profile change, forced change after legacy login) must go through `src/main/passwordPolicy.js` (bcrypt cost 10, at least 6 characters, not a common password).
- The full security model is in [docs/dev/specs/security.md](docs/dev/specs/security.md).

## Release process

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
