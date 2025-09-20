# Deployment Guide

This document provides comprehensive instructions for deploying the Quran Branch Manager application across different environments and platforms.

## Table of Contents

- [Deployment Overview](#deployment-overview)
- [Environment Setup](#environment-setup)
- [Build Process](#build-process)
- [Platform-Specific Deployment](#platform-specific-deployment)
- [Code Signing](#code-signing)
- [Auto-Update Configuration](#auto-update-configuration)
- [Distribution Channels](#distribution-channels)
- [Monitoring & Maintenance](#monitoring--maintenance)
- [Rollback Procedures](#rollback-procedures)
- [Troubleshooting](#troubleshooting)

## Deployment Overview

The Quran Branch Manager uses a multi-stage deployment process that ensures quality, security, and reliability across all target platforms.

### Deployment Stages
1. **Development** → Local development and testing
2. **Staging** → Pre-production testing and validation
3. **Production** → End-user distribution

### Supported Platforms
- **Windows**: Windows 10/11 (x64)
- **macOS**: macOS 10.15+ (Intel and Apple Silicon)
- **Linux**: Ubuntu 18.04+ and compatible distributions

## Environment Setup

### Prerequisites
- Node.js 22.x or later
- npm 10.x or later
- Git for version control
- Platform-specific build tools

### Development Environment
```bash
# Clone the repository
git clone https://github.com/your-org/quran-branch-manager.git
cd quran-branch-manager

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with appropriate values

# Run in development mode
npm run dev
```

### Environment Variables
```bash
# .env file configuration
NODE_ENV=production
JWT_SECRET=your-secure-jwt-secret-here
DB_ENCRYPTION_KEY=your-database-encryption-key
GITHUB_TOKEN=your-github-token-for-releases
APPLE_ID=your-apple-id-for-notarization
APPLE_ID_PASSWORD=your-app-specific-password
```

## Build Process

### Pre-Build Checklist
- [ ] All tests passing (`npm test`)
- [ ] Code linting clean (`npm run lint`)
- [ ] Dependencies updated and audited (`npm audit`)
- [ ] Version number updated in `package.json`
- [ ] Changelog updated with release notes
- [ ] Environment variables configured

### Build Commands
```bash
# Clean previous builds
npm run clean

# Run full test suite
npm test

# Build the React frontend
npm run build

# Create distributable packages
npm run dist

# Build for specific platforms
npm run dist:win    # Windows only
npm run dist:mac    # macOS only
npm run dist:linux  # Linux only
```

### Build Configuration
The build process is configured in `electron-builder.yml`:

```yaml
appId: com.quranassociation.branchmanager
productName: Quran Branch Manager
copyright: Copyright © 2025 ${author}

directories:
  output: release
  buildResources: build

files:
  - dist/**/*
  - src/main/**/*
  - package.json
  - node_modules/**/*
  - "!node_modules/**/*.{md,txt}"
  - "!node_modules/**/test/**"

win:
  target:
    - target: nsis
      arch: [x64]
  icon: build/icon.ico
  publisherName: "Quran Association"
  verifyUpdateCodeSignature: true

mac:
  target:
    - target: dmg
      arch: [x64, arm64]
  icon: build/icon.icns
  category: public.app-category.education
  hardenedRuntime: true
  gatekeeperAssess: false
  entitlements: build/entitlements.mac.plist

linux:
  target:
    - target: AppImage
      arch: [x64]
  icon: build/icon.png
  category: Education
```

## Platform-Specific Deployment

### Windows Deployment

#### Requirements
- Windows 10/11 SDK
- Code signing certificate (for production)
- NSIS installer (included with electron-builder)

#### Build Process
```bash
# Install Windows-specific dependencies
npm install --platform=win32

# Build Windows installer
npm run dist:win
```

#### Output Files
- `QuranBranchManager Setup X.X.X.exe` - NSIS installer
- `QuranBranchManager-X.X.X-win.zip` - Portable version
- `latest.yml` - Auto-update metadata

### macOS Deployment

#### Requirements
- Xcode Command Line Tools
- Apple Developer Account
- Code signing certificates
- Notarization credentials

#### Build Process
```bash
# Install macOS-specific dependencies
npm install --platform=darwin

# Build macOS application
npm run dist:mac
```

#### Notarization Process
```bash
# Automatic notarization (configured in electron-builder)
export APPLE_ID="your-apple-id"
export APPLE_ID_PASSWORD="app-specific-password"
npm run dist:mac
```

#### Output Files
- `QuranBranchManager-X.X.X.dmg` - Disk image installer
- `QuranBranchManager-X.X.X-mac.zip` - Application bundle
- `latest-mac.yml` - Auto-update metadata

### Linux Deployment

#### Requirements
- Build essentials (`build-essential` on Ubuntu)
- FPM for package creation (optional)

#### Build Process
```bash
# Install Linux-specific dependencies
npm install --platform=linux

# Build Linux packages
npm run dist:linux
```

#### Output Files
- `QuranBranchManager-X.X.X.AppImage` - Portable application
- `quran-branch-manager_X.X.X_amd64.deb` - Debian package
- `quran-branch-manager-X.X.X.x86_64.rpm` - RPM package
- `latest-linux.yml` - Auto-update metadata

## Code Signing

### Windows Code Signing
```bash
# Using certificate file
export CSC_LINK="path/to/certificate.p12"
export CSC_KEY_PASSWORD="certificate-password"

# Using Windows Certificate Store
export CSC_NAME="Certificate Common Name"
```

### macOS Code Signing
```bash
# Developer ID Application certificate
export CSC_NAME="Developer ID Application: Your Name (TEAM_ID)"

# For Mac App Store distribution
export CSC_NAME="3rd Party Mac Developer Application: Your Name (TEAM_ID)"
```

### Certificate Management
- Store certificates securely (Azure Key Vault, AWS KMS, etc.)
- Use environment variables for sensitive data
- Implement certificate rotation procedures
- Monitor certificate expiration dates

## Auto-Update Configuration

### Update Server Setup
The application uses GitHub Releases as the update server:

```javascript
// Auto-updater configuration
const { autoUpdater } = require('electron-updater');

autoUpdater.setFeedURL({
  provider: 'github',
  owner: 'your-org',
  repo: 'quran-branch-manager',
  private: false
});

// Check for updates on startup
autoUpdater.checkForUpdatesAndNotify();
```

### Update Process
1. **Check**: Application checks for updates on startup
2. **Download**: New version downloaded in background
3. **Notify**: User notified when download complete
4. **Install**: User chooses when to install and restart

### Update Metadata
Each release includes metadata files:
- `latest.yml` (Windows)
- `latest-mac.yml` (macOS)
- `latest-linux.yml` (Linux)

## Distribution Channels

### GitHub Releases
Primary distribution channel for all platforms:

```bash
# Create and publish release
git tag v1.0.0
git push origin v1.0.0

# Build and publish (with GH_TOKEN set)
npm run dist -- --publish always
```

### Alternative Channels
- **Direct Download**: From organization website
- **Package Managers**: Chocolatey (Windows), Homebrew (macOS), Snap (Linux)
- **Enterprise Distribution**: Internal deployment systems

## Monitoring & Maintenance

### Release Monitoring
- Monitor download statistics
- Track update adoption rates
- Monitor crash reports and error logs
- User feedback collection

### Performance Metrics
```javascript
// Application telemetry (anonymized)
const telemetry = {
  version: app.getVersion(),
  platform: process.platform,
  arch: process.arch,
  startupTime: Date.now() - startTime,
  memoryUsage: process.memoryUsage()
};
```

### Health Checks
- Database integrity checks
- File system permissions
- Network connectivity (for updates)
- Certificate validity

## Rollback Procedures

### Automatic Rollback
```javascript
// Rollback on critical errors
autoUpdater.on('error', (error) => {
  if (isCriticalError(error)) {
    autoUpdater.rollback();
  }
});
```

### Manual Rollback
1. **Identify Issue**: Determine scope and impact
2. **Stop Distribution**: Remove problematic release
3. **Revert Release**: Restore previous stable version
4. **Notify Users**: Communicate rollback to affected users
5. **Root Cause Analysis**: Investigate and fix underlying issue

### Rollback Checklist
- [ ] Issue severity assessment
- [ ] Affected user count estimation
- [ ] Rollback decision approval
- [ ] Previous version availability verification
- [ ] User communication plan
- [ ] Post-rollback monitoring

## Troubleshooting

### Common Build Issues

#### Node.js Version Mismatch
```bash
# Use Node Version Manager
nvm use 22
npm install
npm run dist
```

#### Native Dependencies
```bash
# Rebuild native modules
npm run rebuild

# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

#### Code Signing Failures
```bash
# Verify certificate
security find-identity -v -p codesigning

# Check certificate validity
codesign -dv --verbose=4 /path/to/app
```

### Runtime Issues

#### Database Corruption
```bash
# Database integrity check
sqlite3 database.db "PRAGMA integrity_check;"

# Backup and restore
cp database.db database.db.backup
# Restore from known good backup
```

#### Permission Issues
```bash
# Fix file permissions (Linux/macOS)
chmod +x QuranBranchManager.AppImage

# Windows: Run as administrator if needed
```

### Update Issues

#### Update Server Connectivity
```javascript
// Test update server connectivity
const { net } = require('electron');
const request = net.request('https://api.github.com/repos/owner/repo/releases/latest');
```

#### Corrupted Updates
```bash
# Clear update cache
rm -rf ~/Library/Caches/quran-branch-manager-updater  # macOS
rm -rf %APPDATA%/quran-branch-manager-updater         # Windows
rm -rf ~/.cache/quran-branch-manager-updater          # Linux
```

## Security Considerations

### Build Security
- Use trusted build environments
- Verify dependency integrity
- Scan for vulnerabilities before release
- Implement reproducible builds

### Distribution Security
- Sign all releases with valid certificates
- Use HTTPS for all distribution channels
- Implement checksum verification
- Monitor for unauthorized distributions

### Update Security
- Verify update signatures
- Use secure update channels
- Implement rollback mechanisms
- Monitor for update tampering

## Deployment Checklist

### Pre-Release
- [ ] All tests passing
- [ ] Security audit completed
- [ ] Performance benchmarks met
- [ ] Documentation updated
- [ ] Version numbers updated
- [ ] Changelog prepared

### Release
- [ ] Build artifacts created
- [ ] Code signing completed
- [ ] Release notes published
- [ ] Distribution channels updated
- [ ] Auto-update metadata published
- [ ] Monitoring systems active

### Post-Release
- [ ] Download metrics monitored
- [ ] Error reports reviewed
- [ ] User feedback collected
- [ ] Performance metrics analyzed
- [ ] Next release planning initiated

---

*This deployment guide is maintained alongside the application codebase. Last updated: 2025-01-15*