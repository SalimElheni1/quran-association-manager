# Security Implementation Specification

## Abstract
This specification details the technical security controls implemented across the Quran Branch Manager application following the Security Remediation Plan.

---

## 1. Cryptographic Specifications

| Component | Primitive / Algorithm | Details |
|-----------|----------------------|---------|
| Database Encryption | AES-256 (SQLCipher/MC) | Key length 256 bits, strict hex validation |
| Key Storage | OS Keychain (Keytar) | Windows Credential Manager, macOS Keychain, Linux secret-service |
| JWT Secret Derivation | HKDF-SHA256 | Derived from master DB key with salt `quran-jwt-salt-v1` |
| Backup Encryption | AES-256-GCM | PBKDF2 key derivation (100,000 iterations), GCM auth tag |
| Backup Integrity | HMAC-SHA256 | Verified via `crypto.timingSafeEqual` |
| Password Hashing | bcrypt | Cost factor 12 |

---

## 2. Access Control & IPC Hardening

- All protected IPC channels require explicit authorization via `requireRoles`.
- Renderer processes send authentication tokens explicitly as argument payloads rather than relying on `executeJavaScript` window execution.
- Rate limiting module enforces sliding window lockout on `auth:login` (5 attempts / 15 minutes).

---

## 3. Defense in Depth

- `safe-image:` protocol strips `..` sequences and validates root directory bounds.
- Production logs sanitize sensitive keys (`password`, `token`, `national_id`, `secret`).
- Headers enforced:
  - `Content-Security-Policy: default-src 'self' ...`
  - `Strict-Transport-Security: max-age=31536000`
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
