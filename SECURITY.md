# Security

## Supported Versions

The current release line is **1.4.x**. Security fixes are backported to this line only.

## Reporting a Vulnerability

Do not open a public issue. Email the maintainer privately at **elheni.selim@gmail.com**.

Include in the report:

- A clear description of the vulnerability and its impact.
- Steps to reproduce or a proof of concept (if safe to share).
- The affected version(s) and platform (Windows / macOS / Linux).
- Whether the issue requires local access, a copied database file, or can be triggered remotely.

You will receive an acknowledgment within **7 days**. We follow coordinated disclosure: a fix is prepared and released before any public details are shared.

## Security Model

The developer-facing security model, threat assumptions, and implementation details are in [docs/dev/specs/security.md](docs/dev/specs/security.md). Operational procedures (setup,
backup and recovery, key rotation, incident response) are in
[docs/dev/security-runbook.md](docs/dev/security-runbook.md).
