# Security Policy - Quran Branch Manager

## Overview
Quran Branch Manager is committed to protecting sensitive data, user credentials, and financial records. This document outlines security policies, key management guidelines, backup encryption, and vulnerability disclosure procedures.

---

## Security Architecture

### 1. Key Management & Database Encryption
- Master database encryption keys are stored securely using OS Keychains (Windows Credential Manager, macOS Keychain, Linux Secret Service / Keytar).
- In fallback environments, keys are securely generated per-installation.
- SQLite database files are encrypted using 256-bit AES via `better-sqlite3-multiple-ciphers`.
- Key format validation requires a strict 64-character hexadecimal format (`validateHexKey`).

### 2. Authentication & JWT Tokens
- JWT secrets are dynamically derived from the installation's master database encryption key using **HKDF-SHA256**.
- Plaintext JWT secrets are never stored on disk or in local storage.
- Rate limiting is enforced on login endpoints to prevent brute-force attacks (5 failed attempts / 15-minute lockout).
- Password validation requires a minimum of 12 characters including uppercase, lowercase, numbers, and special characters.
- Initial superadmin credentials are generated using cryptographically random strings on first startup.

### 3. Encrypted Backups & HMAC Signatures
- Automated and manual backup files (`.qdb`) are encrypted using **AES-256-GCM** with PBKDF2 key derivation (100,000 iterations).
- Backup packages include an **HMAC-SHA256** signature verified with timing-safe comparison before database restoration.

### 4. Application Hardening & Defense in Depth
- **Content Security Policy (CSP)** and security response headers (`Strict-Transport-Security`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`) are enforced.
- **Log Sanitization**: Passwords, tokens, PII, and credentials are automatically redacted before logs are written (`[REDACTED]`).
- Custom protocol `safe-image:` enforces strict path normalization and boundary validation to prevent path traversal attacks.

---

## Key Rotation Procedure

To rotate the database encryption key:
1. Ensure a full backup is created automatically before rotation.
2. Invoke `PRAGMA rekey` using a newly generated 256-bit hex key.
3. Update key material in OS Keychain / Key Manager.

---

## Reporting Vulnerabilities

If you discover a security vulnerability in Quran Branch Manager, please do NOT open a public issue. Email security reports directly to the maintainers or report via private security advisories.
