# Troubleshooting Guide

This document provides solutions to common issues encountered when developing, building, or using the Quran Branch Manager application.

## Table of Contents

- [General Issues](#general-issues)
- [Development Issues](#development-issues)
- [Build Issues](#build-issues)
- [Runtime Issues](#runtime-issues)
- [Database Issues](#database-issues)
- [Authentication Issues](#authentication-issues)
- [Performance Issues](#performance-issues)
- [Platform-Specific Issues](#platform-specific-issues)
- [Network Issues](#network-issues)
- [Logging and Debugging](#logging-and-debugging)

## General Issues

### Application Won't Start

#### Symptoms
- Application window doesn't appear
- Process starts but no UI
- Immediate crash on startup

#### Solutions
1. **Check Node.js Version**
   ```bash
   node --version  # Should be 22.x or later
   npm --version   # Should be 10.x or later
   ```

2. **Clear Application Data**
   ```bash
   # Windows
   rmdir /s "%APPDATA%\quran-branch-manager"
   
   # macOS
   rm -rf ~/Library/Application\ Support/quran-branch-manager
   
   # Linux
   rm -rf ~/.config/quran-branch-manager
   ```

3. **Check Permissions**
   - Ensure the application has read/write permissions
   - Run as administrator if necessary (Windows)
   - Check file ownership (Linux/macOS)

### White Screen on Startup

#### Symptoms
- Application window appears but shows blank/white screen
- No content loads

#### Solutions
1. **Check Developer Console**
   ```javascript
   // In development, open DevTools
   Ctrl+Shift+I (Windows/Linux)
   Cmd+Option+I (macOS)
   ```

2. **Clear Browser Cache**
   ```bash
   # Clear Electron cache
   rm -rf ~/Library/Caches/quran-branch-manager  # macOS
   rm -rf %LOCALAPPDATA%\quran-branch-manager    # Windows
   rm -rf ~/.cache/quran-branch-manager          # Linux
   ```

3. **Check Network Connectivity**
   - Ensure localhost:3000 is accessible (development)
   - Check firewall settings

## Development Issues

### npm install Fails

#### Symptoms
- Dependency installation errors
- Native module compilation failures
- Permission denied errors

#### Solutions
1. **Clear npm Cache**
   ```bash
   npm cache clean --force
   rm -rf node_modules package-lock.json
   npm install
   ```

2. **Fix Native Dependencies**
   ```bash
   # Install build tools (Windows)
   npm install --global windows-build-tools
   
   # Install Xcode Command Line Tools (macOS)
   xcode-select --install
   
   # Install build essentials (Linux)
   sudo apt-get install build-essential
   ```

3. **Use Correct Node Version**
   ```bash
   # Using nvm
   nvm install 22
   nvm use 22
   npm install
   ```

### Development Server Won't Start

#### Symptoms
- `npm run dev` fails
- Port already in use errors
- Vite server errors

#### Solutions
1. **Check Port Availability**
   ```bash
   # Check if port 3000 is in use
   netstat -an | grep 3000
   lsof -i :3000  # macOS/Linux
   ```

2. **Kill Existing Processes**
   ```bash
   # Kill process on port 3000
   kill -9 $(lsof -ti:3000)  # macOS/Linux
   
   # Windows
   netstat -ano | findstr :3000
   taskkill /PID <PID> /F
   ```

3. **Use Different Port**
   ```bash
   # Start on different port
   npm run react-dev -- --port 3001
   ```

### Hot Reload Not Working

#### Symptoms
- Changes not reflected automatically
- Need to manually refresh

#### Solutions
1. **Check File Watchers**
   ```bash
   # Increase file watcher limit (Linux)
   echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf
   sudo sysctl -p
   ```

2. **Restart Development Server**
   ```bash
   # Stop and restart
   Ctrl+C
   npm run dev
   ```

## Build Issues

### Build Fails with Native Dependencies

#### Symptoms
- `npm run dist` fails
- Native module compilation errors
- Missing dependencies in build

#### Solutions
1. **Rebuild Native Modules**
   ```bash
   npm run rebuild
   # or
   ./node_modules/.bin/electron-rebuild
   ```

2. **Install Platform-Specific Dependencies**
   ```bash
   # For Windows builds on macOS/Linux
   npm install --platform=win32 --arch=x64
   
   # For macOS builds on Windows/Linux
   npm install --platform=darwin --arch=x64
   ```

3. **Check Electron Version Compatibility**
   ```bash
   # Ensure all native modules support current Electron version
   npm ls electron
   ```

### Code Signing Failures

#### Symptoms
- Build completes but signing fails
- Certificate errors
- Notarization failures (macOS)

#### Solutions
1. **Verify Certificates**
   ```bash
   # Windows
   certlm.msc  # Check certificate store
   
   # macOS
   security find-identity -v -p codesigning
   ```

2. **Check Environment Variables**
   ```bash
   # Ensure signing variables are set
   echo $CSC_LINK
   echo $CSC_KEY_PASSWORD
   echo $APPLE_ID
   ```

3. **Test Signing Manually**
   ```bash
   # macOS
   codesign --sign "Developer ID Application" --force --deep app.app
   
   # Windows
   signtool sign /f certificate.p12 /p password app.exe
   ```

## Runtime Issues

### Database Connection Errors

#### Symptoms
- "Database is not open" errors
- Connection timeout errors
- Encryption key errors

#### Solutions
1. **Check Database File**
   ```bash
   # Verify database file exists and is readable
   ls -la ~/.config/quran-branch-manager/quran_assoc_manager.sqlite
   ```

2. **Reset Database**
   ```bash
   # Backup and recreate database
   cp database.sqlite database.sqlite.backup
   rm database.sqlite
   # Restart application to recreate
   ```

3. **Check Encryption Key**
   ```javascript
   // Verify key in development
   console.log('DB Key:', process.env.JWT_SECRET);
   ```

### Memory Leaks

#### Symptoms
- Application becomes slow over time
- High memory usage
- Eventual crashes

#### Solutions
1. **Monitor Memory Usage**
   ```javascript
   // Add memory monitoring
   setInterval(() => {
     const usage = process.memoryUsage();
     console.log('Memory usage:', usage);
   }, 60000);
   ```

2. **Check for Event Listener Leaks**
   ```javascript
   // Ensure proper cleanup
   useEffect(() => {
     const handler = () => {};
     window.addEventListener('event', handler);
     
     return () => {
       window.removeEventListener('event', handler);
     };
   }, []);
   ```

3. **Profile Memory Usage**
   - Use Chrome DevTools Memory tab
   - Take heap snapshots
   - Identify memory leaks

## Database Issues

### Database Corruption

#### Symptoms
- "Database disk image is malformed" errors
- Data inconsistencies
- Query failures

#### Solutions
1. **Check Database Integrity**
   ```sql
   PRAGMA integrity_check;
   PRAGMA foreign_key_check;
   ```

2. **Repair Database**
   ```bash
   # Create backup
   cp database.sqlite database.sqlite.corrupt
   
   # Attempt repair
   sqlite3 database.sqlite ".recover" | sqlite3 database_recovered.sqlite
   ```

3. **Restore from Backup**
   ```bash
   # Use most recent backup
   cp backup/database_YYYY-MM-DD.sqlite database.sqlite
   ```

### Migration Failures

#### Symptoms
- Application won't start after update
- Schema version mismatches
- Migration script errors

#### Solutions
1. **Check Migration Status**
   ```sql
   SELECT * FROM migrations ORDER BY applied_at DESC;
   ```

2. **Manual Migration**
   ```bash
   # Run specific migration
   sqlite3 database.sqlite < src/db/migrations/001-migration.sql
   ```

3. **Reset Migrations**
   ```sql
   -- Only in development
   DELETE FROM migrations;
   -- Restart application
   ```

## Authentication Issues

### Login Failures

#### Symptoms
- "Invalid credentials" errors
- JWT token errors
- Session timeouts

#### Solutions
1. **Reset Admin Password**
   ```javascript
   // In development console
   const bcrypt = require('bcryptjs');
   const newPassword = await bcrypt.hash('newpassword', 10);
   // Update database manually
   ```

2. **Check JWT Secret**
   ```bash
   # Ensure JWT_SECRET is set
   echo $JWT_SECRET
   ```

3. **Clear Session Data**
   ```javascript
   // Clear localStorage
   localStorage.clear();
   ```

### Permission Denied Errors

#### Symptoms
- "Insufficient permissions" errors
- Role-based access failures
- Unauthorized access attempts

#### Solutions
1. **Check User Roles**
   ```sql
   SELECT username, role FROM users WHERE username = 'your-username';
   ```

2. **Update User Role**
   ```sql
   UPDATE users SET role = 'Superadmin' WHERE username = 'your-username';
   ```

3. **Verify Token Claims**
   ```javascript
   // Decode JWT token
   const jwt = require('jsonwebtoken');
   const decoded = jwt.decode(token);
   console.log('Token claims:', decoded);
   ```

## Performance Issues

### Slow Application Startup

#### Symptoms
- Long loading times
- Delayed UI rendering
- Slow database initialization

#### Solutions
1. **Profile Startup Time**
   ```javascript
   const startTime = Date.now();
   // ... initialization code
   console.log('Startup time:', Date.now() - startTime, 'ms');
   ```

2. **Optimize Database Queries**
   ```sql
   -- Add indexes for frequently queried columns
   CREATE INDEX idx_students_name ON students(name);
   CREATE INDEX idx_students_status ON students(status);
   ```

3. **Lazy Load Components**
   ```javascript
   // Use React.lazy for code splitting
   const StudentsPage = React.lazy(() => import('./pages/StudentsPage'));
   ```

### Slow Database Queries

#### Symptoms
- Long response times
- UI freezing during data operations
- Timeout errors

#### Solutions
1. **Analyze Query Performance**
   ```sql
   EXPLAIN QUERY PLAN SELECT * FROM students WHERE name LIKE '%search%';
   ```

2. **Add Database Indexes**
   ```sql
   CREATE INDEX idx_students_search ON students(name, matricule);
   ```

3. **Optimize Queries**
   ```sql
   -- Use LIMIT for large result sets
   SELECT * FROM students ORDER BY name LIMIT 100 OFFSET 0;
   ```

## Platform-Specific Issues

### Windows Issues

#### Antivirus False Positives
- Add application to antivirus whitelist
- Use signed builds to reduce false positives
- Contact antivirus vendor for whitelisting

#### Windows Defender SmartScreen
```bash
# Sign application with trusted certificate
# Or add publisher to trusted list
```

### macOS Issues

#### Gatekeeper Blocking Application
```bash
# Allow unsigned application (development only)
sudo spctl --master-disable

# Or allow specific application
sudo xattr -rd com.apple.quarantine /Applications/QuranBranchManager.app
```

#### Notarization Issues
```bash
# Check notarization status
xcrun altool --notarization-info <RequestUUID> -u <AppleID>

# Staple notarization
xcrun stapler staple QuranBranchManager.app
```

### Linux Issues

#### Missing Dependencies
```bash
# Install required libraries
sudo apt-get install libgtk-3-0 libxss1 libasound2 libgconf-2-4
```

#### AppImage Permissions
```bash
# Make AppImage executable
chmod +x QuranBranchManager.AppImage

# Run AppImage
./QuranBranchManager.AppImage
```

## Network Issues

### Auto-Update Failures

#### Symptoms
- Update check failures
- Download errors
- Installation failures

#### Solutions
1. **Check Network Connectivity**
   ```bash
   # Test GitHub API access
   curl -I https://api.github.com/repos/owner/repo/releases/latest
   ```

2. **Clear Update Cache**
   ```bash
   # Remove cached update files
   rm -rf ~/Library/Caches/quran-branch-manager-updater
   ```

3. **Manual Update**
   - Download latest release manually
   - Install over existing version

### Proxy Configuration

#### Corporate Networks
```javascript
// Configure proxy in main process
const { session } = require('electron');

session.defaultSession.setProxy({
  proxyRules: 'http://proxy.company.com:8080'
});
```

## Logging and Debugging

### Enable Debug Logging

#### Development
```bash
# Set debug environment variable
DEBUG=* npm run dev

# Or specific modules
DEBUG=quran:* npm run dev
```

#### Production
```javascript
// Enable verbose logging
const log = require('electron-log');
log.transports.file.level = 'debug';
log.transports.console.level = 'debug';
```

### Log Locations

#### Application Logs
```bash
# Windows
%USERPROFILE%\AppData\Roaming\quran-branch-manager\logs\

# macOS
~/Library/Logs/quran-branch-manager/

# Linux
~/.config/quran-branch-manager/logs/
```

#### System Logs
```bash
# Windows Event Viewer
eventvwr.msc

# macOS Console
/Applications/Utilities/Console.app

# Linux System Logs
journalctl -u quran-branch-manager
```

### Debug Tools

#### Electron DevTools
```javascript
// Open DevTools in production
mainWindow.webContents.openDevTools();
```

#### Database Browser
```bash
# Use SQLite browser
sqlite3 database.sqlite
.tables
.schema students
```

#### Network Monitoring
```javascript
// Monitor network requests
const { net } = require('electron');
net.request('https://api.github.com/').on('response', (response) => {
  console.log('Response:', response.statusCode);
});
```

## Getting Help

### Before Reporting Issues
1. Check this troubleshooting guide
2. Search existing GitHub issues
3. Enable debug logging
4. Collect relevant log files
5. Note system specifications

### Reporting Issues
Include the following information:
- Operating system and version
- Application version
- Steps to reproduce
- Expected vs actual behavior
- Error messages and logs
- Screenshots if applicable

### Support Channels
- **GitHub Issues**: Bug reports and feature requests
- **Documentation**: Comprehensive guides and references
- **Community**: User forums and discussions

---

*This troubleshooting guide is regularly updated based on user feedback and common issues. Last updated: 2025-01-15*