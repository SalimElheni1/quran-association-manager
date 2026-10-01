# Documentation Map

This project keeps the active documentation close to the work it describes. The goal is to keep the docs useful for onboarding, feature work, support, and release management without carrying stale design plans or duplicate references.

## Start here

- [README.md](../README.md) — project overview, setup, and product summary
- [PRODUCT.md](../PRODUCT.md) — product purpose and product-level decisions
- [CONTRIBUTING.md](../CONTRIBUTING.md) — contribution flow and release expectations
- [SECURITY.md](../SECURITY.md) — vulnerability disclosure and supported versions
- [SECURITY_REMEDIATION_PLAN.md](../SECURITY_REMEDIATION_PLAN.md) — security work status and tracked risks
- [CHANGELOG.md](../CHANGELOG.md) — release history and important changes

## User docs

- [user/manual.md](user/manual.md) — daily usage guide for the application
- [user/financial.md](user/financial.md) — financial workflow walkthrough
- [user/troubleshooting.md](user/troubleshooting.md) — user-facing issue resolution

## Developer docs

### Setup and operations

- [dev/setup/development.md](dev/setup/development.md) — local environment and development workflow
- [dev/setup/building.md](dev/setup/building.md) — build and packaging steps
- [dev/setup/testing.md](dev/setup/testing.md) — unit, integration, and e2e testing
- [dev/setup/deployment.md](dev/setup/deployment.md) — release and deployment notes

### Technical specifications

- [dev/specs/architecture.md](dev/specs/architecture.md) — system architecture overview
- [dev/specs/api.md](dev/specs/api.md) — IPC and renderer/main-process contract
- [dev/specs/security.md](dev/specs/security.md) — security model and constraints
- [dev/specs/financial-spec.md](dev/specs/financial-spec.md) — implemented financial module specification

### Security operations

- [dev/security-runbook.md](dev/security-runbook.md) — operational runbook for branch staff and maintainers (setup, backup/recovery, key rotation, incident response)

### Reference and troubleshooting

- [dev/reference/project-structure.md](dev/reference/project-structure.md) — codebase map
- [dev/reference/import-export-map.md](dev/reference/import-export-map.md) — import/export field reference
- [dev/reference/agents.md](dev/reference/agents.md) — quick AI-agent guide
- [dev/troubleshooting.md](dev/troubleshooting.md) — common developer issues and fixes
- [dev/reports/financial-db-schema-audit.md](dev/reports/financial-db-schema-audit.md) — audit of the financial schema
- [dev/reports/financial-runtime-audit.md](dev/reports/financial-runtime-audit.md) — runtime audit notes for finance flows

## Archive

The archive is intentionally minimal. Historical material is kept only when it adds context, and the current product guidance always takes priority over all archived notes.

## Maintenance rule

Only the current operational docs should be treated as the source of truth. Archive and historical notes stay available for reference, but they should not drive new work or product decisions.
