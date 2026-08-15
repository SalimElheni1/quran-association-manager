# Security Remediation Plan - Quran Branch Manager

**Document Version**: 1.0  
**Created**: 2026-08-15  
**Status**: Planning  
**Risk Level**: HIGH (Critical vulnerabilities require immediate attention)

---

## Executive Summary

This plan addresses 20 security vulnerabilities identified in the Quran Branch Manager Electron application. Issues are organized into **4 sprints** over **4 weeks**, prioritized by severity and dependency order.

| Sprint | Focus | Duration | Critical Issues |
|--------|-------|----------|-----------------|
| **Sprint 1** | Cryptographic Foundations | Week 1 | 6 (P0) |
| **Sprint 2** | Authentication & Access Control | Week 2 | 7 (P1) |
| **Sprint 3** | Defense in Depth | Week 3 | 6 (P2) |
| **Sprint 4** | Polish & Technical Debt | Week 4 | 2 (P3) |

---

## Sprint 1: Cryptographic Foundations (P0 - Critical)
**Goal**: Fix fundamental key management, encryption, and backup security  
**Duration**: 5 working days  
**Dependencies**: None - can start immediately

### Stories

#### SEC-001: Replace Hardcoded Encryption Key with OS Keychain
**Priority**: P0 | **Effort**: L (8 pts) | **Risk**: CRITICAL

**Description**: The `electron-store` encryption key is hardcoded (`'your-base64-encoded-master-key'`) in `keyManager.js:10`, making all installations share the same master key.

**Acceptance Criteria**:
- [ ] Add `keytar` dependency
- [ ] Implement `getDbKey()`, `getDbSalt()`, `getJwtSecret()` using OS keychain (Windows Credential Manager, macOS Keychain, Linux libsecret)
- [ ] Generate unique per-installation keys on first run
- [ ] Derive JWT secret from DB key using HKDF-SHA256
- [ ] All callers updated to async/await pattern
- [ ] Fallback to file-based storage only if keytar unavailable (with warning)

**Files to Modify**:
- `src/main/keyManager.js` (complete rewrite)
- `src/db/db.js` (async callers)
- `src/main/index.js` (JWT secret initialization)
- `src/main/authMiddleware.js` (token verification)
- `package.json` (add keytar)

**Testing**:
- Verify keys differ across machines
- Verify persistence across app restarts
- Test fallback on headless Linux

---

#### SEC-002: Fix SQL Injection in PRAGMA Statements
**Priority**: P0 | **Effort**: S (2 pts) | **Risk**: HIGH

**Description**: Encryption key interpolated directly into PRAGMA statements in `db.js` lines 257, 287, 300.

**Acceptance Criteria**:
- [ ] Add `validateHexKey(key)` function (64 hex chars)
- [ ] Apply validation before all `db.pragma(\`key = '\${key}'\`)` calls
- [ ] Add unit test for invalid key formats

**Files to Modify**:
- `src/db/db.js` (lines 257, 287, 300)

---

#### SEC-003: Secure JWT Secret Storage
**Priority**: P0 | **Effort**: M (5 pts) | **Risk**: CRITICAL

**Description**: JWT secret stored in electron-store with weak encryption (depends on SEC-001).

**Acceptance Criteria**:
- [ ] JWT secret derived from DB key via HKDF (separate key purpose)
- [ ] Or stored separately in OS keychain
- [ ] No JWT secret in electron-store
- [ ] `authMiddleware.js` uses cached async secret

**Files to Modify**:
- `src/main/keyManager.js` (add `getJwtSecret()`)
- `src/main/index.js` (initialization)
- `src/main/authMiddleware.js` (verification)

---

#### SEC-004: Generate Random Default Superadmin Password
**Priority**: P0 | **Effort**: S (3 pts) | **Risk**: HIGH

**Description**: Default password is hardcoded `'123456'` in `db.js:55`.

**Acceptance Criteria**:
- [ ] Generate 16-char cryptographically random password on first run
- [ ] Use bcrypt cost factor 12 (not 10)
- [ ] Display password ONCE in secure modal (renderer)
- [ ] Force password change on first login (`mustChange: true` flag)
- [ ] Log only hash, never plaintext

**Files to Modify**:
- `src/db/db.js` (`seedSuperadmin()`)
- Renderer: Login page / first-run modal

---

#### SEC-005: Encrypt Backup Files with AES-256-GCM
**Priority**: P0 | **Effort**: L (8 pts) | **Risk**: CRITICAL

**Description**: Backups are plaintext ZIP files containing SQL dump + salt in `salt.json`.

**Acceptance Criteria**:
- [ ] Add `encryptBackup(buffer, password)` and `decryptBackup(buffer, password)` using AES-256-GCM
- [ ] PBKDF2 (100k iterations) for key derivation from user password
- [ ] Format: `salt(16) || iv(12) || authTag(16) || ciphertext`
- [ ] Prompt for password on backup export and import
- [ ] Salt no longer stored in plaintext inside backup

**Files to Modify**:
- `src/main/backupManager.js` (`runBackup`, add crypto helpers)
- `src/main/importManager.js` (`replaceDatabase`, add decryption)
- Renderer: Backup/Restore UI (password prompts)

---

#### SEC-006: Add HMAC Signature Verification for Imports
**Priority**: P0 | **Effort**: M (5 pts) | **Risk**: HIGH

**Description**: No integrity verification on backup imports - malicious SQL could be executed.

**Acceptance Criteria**:
- [ ] Sign backup ZIP with HMAC-SHA256 using DB encryption key
- [ ] Include `signature.txt` in backup package
- [ ] Verify signature before processing import
- [ ] Reject import if signature mismatch (timing-safe comparison)
- [ ] Log verification result

**Files to Modify**:
- `src/main/backupManager.js` (`runBackup` - add signing)
- `src/main/importManager.js` (`validateDatabaseFile`, `replaceDatabase` - verify)

---

### Sprint 1 Definition of Done
- [ ] All 6 stories complete with tests
- [ ] No hardcoded secrets in codebase
- [ ] Backups encrypted and signed
- [ ] JWT secret derived from DB key
- [ ] Default admin password randomized
- [ ] Security regression tests passing

---

## Sprint 2: Authentication & Access Control (P1 - High)
**Goal**: Harden authentication flow, add rate limiting, fix authorization gaps  
**Duration**: 5 working days  
**Dependencies**: Sprint 1 (async key management)

### Stories

#### SEC-007: Remove `executeJavaScript` Token Retrieval
**Priority**: P1 | **Effort**: M (5 pts) | **Risk**: HIGH

**Description**: `authMiddleware.js:33` uses `event.sender.executeJavaScript()` to read token from localStorage - requires dangerous permissions and exposes token to XSS.

**Acceptance Criteria**:
- [ ] Modify `requireRoles` wrapper to accept token as explicit IPC argument
- [ ] Update all protected IPC handlers to pass token from renderer
- [ ] Store token in memory (React context/state) NOT localStorage
- [ ] Remove `executeJavaScript` call entirely
- [ ] Update preload.js API to pass token explicitly

**Files to Modify**:
- `src/main/authMiddleware.js` (core change)
- `src/main/handlers/*.js` (all handlers using `requireRoles`)
- `src/preload.js` (API signatures)
- `src/renderer/contexts/AuthContext.jsx` (token storage)

---

#### SEC-008: Add Rate Limiting to Login Endpoint
**Priority**: P1 | **Effort**: M (3 pts) | **Risk**: HIGH

**Description**: No brute-force protection on `auth:login`.

**Acceptance Criteria**:
- [ ] In-memory rate limiter (sliding window, 5 attempts / 15 min)
- [ ] Lockout for 15 minutes after 5 failures
- [ ] Track by IP (from `event.senderFrame` or heuristic)
- [ ] Log failed attempts with IP (sanitized)
- [ ] Return `retryAfter` seconds in error response
- [ ] Clear on successful login

**Files to Modify**:
- `src/main/handlers/authHandlers.js` (add rate limiter module)

---

#### SEC-009: Fix Path Traversal in `safe-image` Protocol
**Priority**: P1 | **Effort**: S (2 pts) | **Risk**: HIGH

**Description**: `index.js:296-341` doesn't normalize/validate paths before joining.

**Acceptance Criteria**:
- [ ] Normalize path with `path.normalize()`
- [ ] Reject paths containing `..` or absolute paths
- [ ] Verify resolved path stays within allowed base directories
- [ ] Unit tests for traversal attempts

**Files to Modify**:
- `src/main/index.js` (protocol handler)

---

#### SEC-010: Strengthen Password Requirements
**Priority**: P1 | **Effort**: S (2 pts) | **Risk**: MEDIUM

**Description**: Password change allows 6 chars (`validationSchemas.js:211`), below modern standards.

**Acceptance Criteria**:
- [ ] Minimum 12 characters for all passwords
- [ ] Require: uppercase, lowercase, number, special char
- [ ] Check against common passwords (top 10k list)
- [ ] Apply to: user creation, password change, superadmin seed
- [ ] Clear error messages in Arabic

**Files to Modify**:
- `src/main/validationSchemas.js` (password schemas)
- `src/db/db.js` (seedSuperadmin bcrypt cost)

---

#### SEC-011: Add Input Validation to All IPC Handlers
**Priority**: P1 | **Effort**: L (8 pts) | **Risk**: HIGH

**Description**: Many IPC handlers accept raw objects without validation (e.g., `backup:run`, `import:excel`).

**Acceptance Criteria**:
- [ ] Create Joi schemas for every IPC handler input
- [ ] Validate at handler entry point
- [ ] Return structured validation errors
- [ ] Priority: financial, import/export, user management handlers

**Files to Modify**:
- `src/main/validationSchemas.js` (add new schemas)
- `src/main/handlers/systemHandlers.js`
- `src/main/handlers/importHandlers.js`
- `src/main/handlers/financialHandlers.js`
- `src/main/handlers/userHandlers.js`

---

#### SEC-012: Configure electron-updater with Public Key Verification
**Priority**: P1 | **Effort**: M (3 pts) | **Risk**: HIGH

**Description**: Auto-updater trusts update server without signature verification.

**Acceptance Criteria**:
- [ ] Generate Ed25519 key pair for updates
- [ ] Embed public key in application
- [ ] Configure `electron-builder` with `publish.publicKey`
- [ ] Verify `electron-updater` validates signatures
- [ ] Document key rotation procedure

**Files to Modify**:
- `package.json` (build config)
- `src/main/index.js` (auto-updater setup)
- Documentation

---

#### SEC-013: Fix Missing Role Checks on IPC Handlers
**Priority**: P1 | **Effort**: S (3 pts) | **Risk**: MEDIUM

**Description**: `categories:get` in `financialHandlers.js:783` has no `requireRoles` wrapper.

**Acceptance Criteria**:
- [ ] Audit all `ipcMain.handle` registrations for missing auth
- [ ] Apply least-privilege roles:
  - Financial data: `Superadmin`, `Administrator`, `FinanceManager`
  - User management: `Superadmin` only
  - Settings: `Superadmin`, `Administrator`
  - Read-only: add `SessionSupervisor` where appropriate
- [ ] Document role matrix

**Files to Modify**:
- `src/main/handlers/financialHandlers.js`
- `src/main/handlers/*.js` (all handlers)

---

### Sprint 2 Definition of Done
- [ ] Token never in localStorage, never via executeJavaScript
- [ ] Login rate limited and logged
- [ ] All IPC inputs validated
- [ ] Auto-updater cryptographically verified
- [ ] Complete role matrix enforced
- [ ] Path traversal blocked

---

## Sprint 3: Defense in Depth (P2 - Medium)
**Goal**: Add security headers, logging hygiene, token hygiene, key rotation  
**Duration**: 5 working days  
**Dependencies**: Sprint 1-2

### Stories

#### SEC-014: Add Content Security Policy Headers
**Priority**: P2 | **Effort**: M (3 pts) | **Risk**: MEDIUM

**Description**: No CSP - XSS would have full access.

**Acceptance Criteria**:
- [ ] CSP in `createWindow()` via `session.webRequest.onHeadersReceived`
- [ ] Policy: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: safe-image:; font-src 'self'; connect-src 'self'`
- [ ] Test all functionality works (fonts, images, IPC)
- [ ] Report-only mode first, then enforce

**Files to Modify**:
- `src/main/index.js` (window creation)

---

#### SEC-015: Sanitize Sensitive Data from Logs
**Priority**: P2 | **Effort**: M (3 pts) | **Risk**: MEDIUM

**Description**: Logs may contain PII, passwords, tokens, financial data.

**Acceptance Criteria**:
- [ ] Create `sanitizeForLog(obj)` utility
- [ ] Redact: passwords, tokens, national_id, credit cards, full names (keep initials)
- [ ] Apply to all `log()`, `logError()`, `logWarn()` calls with objects
- [ ] Structured logging with redaction

**Files to Modify**:
- `src/main/logger.js` (add sanitizer)
- All handlers using logger

---

#### SEC-016: Implement JWT Token Rotation / In-Memory Storage
**Priority**: P2 | **Effort**: M (5 pts) | **Risk**: MEDIUM

**Description**: Token in localStorage vulnerable to XSS; 8h expiry without refresh.

**Acceptance Criteria**:
- [ ] Access token: 15 min expiry, stored in memory only
- [ ] Refresh token: 7 days, httpOnly cookie equivalent (Electron: encrypted file with restricted perms)
- [ ] Silent refresh before expiry
- [ ] Revoke refresh token on logout/password change
- [ ] Token rotation on each refresh

**Files to Modify**:
- `src/main/authHandlers.js` (login returns access + refresh)
- `src/main/authMiddleware.js` (verify access, handle refresh)
- `src/renderer/contexts/AuthContext.jsx` (token management)
- `src/preload.js` (refresh API)

---

#### SEC-017: Add Database Encryption Key Rotation Support
**Priority**: P2 | **Effort**: L (5 pts) | **Risk**: LOW

**Description**: No way to re-encrypt DB if key compromised.

**Acceptance Criteria**:
- [ ] Add `rotateDbKey(newKey)` function using SQLCipher `PRAGMA rekey`
- [ ] UI in Settings for superadmin to rotate key
- [ ] Requires current password + new password (derived)
- [ ] Backup automatically created before rotation
- [ ] Log rotation event

**Files to Modify**:
- `src/main/keyManager.js` (add rotation)
- `src/db/db.js` (rekey logic)
- `src/main/handlers/settingsHandlers.js` (UI endpoint)
- Renderer: Security settings page

---

#### SEC-018: Validate Backup Path Configuration on Startup
**Priority**: P2 | **Effort**: S (2 pts) | **Risk**: LOW

**Description**: Automated backups fail silently if path not configured.

**Acceptance Criteria**:
- [ ] Check `backup_path` setting on scheduler start
- [ ] Verify directory exists and writable
- [ ] Show persistent UI warning if not configured
- [ ] Log warning with clear remediation steps

**Files to Modify**:
- `src/main/backupManager.js` (`startScheduler`)
- `src/main/settingsManager.js`
- Renderer: Settings page

---

#### SEC-019: Security Headers for External Resources
**Priority**: P2 | **Effort**: S (2 pts) | **Risk**: LOW

**Description**: No HSTS, X-Frame-Options, etc. for any external loads.

**Acceptance Criteria**:
- [ ] Add `session.webRequest.onHeadersReceived` for security headers
- [ ] `Strict-Transport-Security: max-age=31536000`
- [ ] `X-Frame-Options: DENY`
- [ ] `X-Content-Type-Options: nosniff`
- [ ] `Referrer-Policy: strict-origin-when-cross-origin`

**Files to Modify**:
- `src/main/index.js` (session setup)

---

### Sprint 3 Definition of Done
- [ ] CSP enforced without breaking app
- [ ] Logs contain no sensitive data
- [ ] Short-lived access tokens with refresh rotation
- [ ] DB key rotation functional
- [ ] Backup config validated
- [ ] Security headers present

---

## Sprint 4: Polish & Technical Debt (P3 - Low)
**Goal**: Verify build hygiene, cleanup, documentation  
**Duration**: 3 working days  
**Dependencies**: Sprint 1-3

### Stories

#### SEC-020: Verify electron-reloader Excluded from Production
**Priority**: P3 | **Effort**: S (1 pt) | **Risk**: LOW

**Description**: `electron-reloader` in devDependencies could leak into build.

**Acceptance Criteria**:
- [ ] Verify `electron-builder` config excludes devDependencies
- [ ] Test packaged app has no WebSocket listener on random port
- [ ] Document in build guide

**Files to Check**:
- `package.json`
- `electron-builder.json` (or `package.json` build section)

---

#### SEC-021: Security Documentation & Runbook
**Priority**: P3 | **Effort**: M (3 pts) | **Risk**: LOW

**Description**: No security operations documentation.

**Acceptance Criteria**:
- [ ] `SECURITY.md` with:
  - Vulnerability disclosure process
  - Key rotation procedures
  - Backup encryption key recovery
  - Incident response checklist
- [ ] Update `CONTRIBUTING.md` with secure coding guidelines
- [ ] Architecture decision records for crypto choices

**Files to Create**:
- `SECURITY.md`
- `docs/dev/specs/security-implementation.md`

---

### Sprint 4 Definition of Done
- [ ] Production build verified clean
- [ ] Security documentation complete
- [ ] All TODO/FIXME security comments resolved

---

## Cross-Cutting Concerns

### Testing Strategy
| Sprint | Unit Tests | Integration Tests | E2E Tests |
|--------|------------|-------------------|-----------|
| 1 | Key management, crypto | Backup encrypt/decrypt, sign/verify | Full backup/restore cycle |
| 2 | Rate limiter, validators | Auth flow, RBAC | Login, brute-force, role access |
| 3 | Sanitizer, token rotation | CSP, headers | XSS attempts, token refresh |
| 4 | Build verification | - | Smoke test |

### Monitoring & Alerting (Post-Launch)
- Failed login rate alerts
- Backup success/failure metrics
- Token refresh failure rate
- CSP violation reports (via `report-uri`)

### Rollback Plan
Each sprint feature behind feature flag:
```javascript
// In settings
security: {
  useKeytar: true,
  encryptedBackups: true,
  tokenRotation: true,
  cspEnforced: true
}
```

---

## Resource Requirements

| Role | Sprint 1 | Sprint 2 | Sprint 3 | Sprint 4 |
|------|----------|----------|----------|----------|
| Backend (Electron/Node) | 1.5 FTE | 1 FTE | 1 FTE | 0.5 FTE |
| Frontend (React) | 0.5 FTE | 1 FTE | 0.5 FTE | 0.5 FTE |
| QA/Security | 0.5 FTE | 0.5 FTE | 1 FTE | 0.5 FTE |

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| keytar fails on Linux headless | Medium | High | File fallback with warning; test CI |
| Backup password loss = data loss | Low | Critical | Document recovery; consider escrow |
| Token rotation breaks existing sessions | Medium | Medium | Gradual rollout; feature flag |
| CSP breaks third-party fonts | Low | Medium | Report-only phase; test thoroughly |
| Database rekey fails on large DB | Low | High | Test with production-size DB; backup first |

---

## Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Security Lead | | | |
| Backend Lead | | | |
| Frontend Lead | | | |
| QA Lead | | | |
| Product Owner | | | |

---

## Appendix: File Change Summary

### Sprint 1 Files
```
src/main/keyManager.js          ★★★ Complete rewrite
src/db/db.js                    ★★★ Async callers, validation
src/main/index.js               ★★  JWT init, key usage
src/main/authMiddleware.js      ★★  Async JWT verify
src/main/backupManager.js       ★★★ Encryption, signing
src/main/importManager.js       ★★  Decryption, verification
src/main/validationSchemas.js   ★   Password strength
package.json                    ★   keytar dependency
```

### Sprint 2 Files
```
src/main/authMiddleware.js      ★★★ requireRoles signature change
src/main/handlers/authHandlers.js ★★ Rate limiting
src/main/index.js               ★   safe-image path validation
src/main/validationSchemas.js   ★★  Password schemas
src/main/handlers/*.js          ★★★ Input validation (all)
package.json                    ★   electron-builder publicKey
```

### Sprint 3 Files
```
src/main/index.js               ★★★ CSP, security headers
src/main/logger.js              ★★  Sanitization
src/main/authHandlers.js        ★★  Refresh tokens
src/main/authMiddleware.js      ★★  Token rotation
src/main/keyManager.js          ★   Key rotation
src/main/backupManager.js       ★   Path validation
src/renderer/contexts/AuthContext.jsx ★★ In-memory tokens
```

### Sprint 4 Files
```
SECURITY.md                     ★★★ New documentation
docs/dev/specs/security-implementation.md ★★ New
```

---

*End of Document*