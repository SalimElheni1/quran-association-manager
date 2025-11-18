#!/usr/bin/env node

/**
 * Real-time Log Watcher for Manual Testing
 * 
 * Usage:
 *   node watch-logs.js          # Watch logs in real-time
 *   node watch-logs.js --clear  # Clear logs before starting
 *   node watch-logs.js --filter [KEYWORD]  # Filter logs by keyword (e.g., ChargeRegen, Enrollment)
 * 
 * Example filters:
 *   node watch-logs.js --filter ChargeRegen
 *   node watch-logs.js --filter Enrollment
 *   node watch-logs.js --filter ERROR
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const os = require('os');

// Determine log file location
const logFilePath = path.join(os.homedir(), `AppData/Local/quran-association-manager/app-logs.txt`);

console.log('╔═══════════════════════════════════════════════════════════════════════════╗');
console.log('║                          LOG WATCHER STARTED                              ║');
console.log('╚═══════════════════════════════════════════════════════════════════════════╝');
console.log(`\nLog file location:\n${logFilePath}\n`);

// Parse command line arguments
const args = process.argv.slice(2);
const shouldClear = args.includes('--clear');
const filterIndex = args.indexOf('--filter');
const filterKeyword = filterIndex !== -1 ? args[filterIndex + 1] : null;

// Clear logs if requested
if (shouldClear) {
  if (fs.existsSync(logFilePath)) {
    fs.writeFileSync(logFilePath, '');
    console.log('✅ Log file cleared\n');
  }
}

// Helper function to format log output
const formatLog = (line) => {
  if (!line.trim()) return null;

  // Extract timestamp and content
  const match = line.match(/\[(.*?)\]\s+\[(.*?)\]\s+(.*)/);
  if (match) {
    const [, timestamp, level, content] = match;
    const levelColor = {
      LOG: '\x1b[36m',   // Cyan
      WARN: '\x1b[33m',  // Yellow
      ERROR: '\x1b[31m', // Red
    }[level] || '\x1b[0m';
    
    const reset = '\x1b[0m';
    return `${levelColor}[${level}]${reset} ${content}`;
  }
  return line;
};

// Helper function to check if line matches filter
const matchesFilter = (line) => {
  if (!filterKeyword) return true;
  return line.includes(filterKeyword);
};

// Initial display of existing logs
console.log('📋 Recent logs (last 30 lines):');
console.log('───────────────────────────────────────────────────────────────────────────\n');

if (fs.existsSync(logFilePath)) {
  const content = fs.readFileSync(logFilePath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim());
  const lastLines = lines.slice(-30);
  
  lastLines.forEach(line => {
    if (matchesFilter(line)) {
      const formatted = formatLog(line);
      if (formatted) console.log(formatted);
    }
  });
} else {
  console.log('(Log file does not exist yet - will be created when app starts)\n');
}

console.log('\n───────────────────────────────────────────────────────────────────────────');
console.log(`\n📡 Watching for new logs${filterKeyword ? ` (filter: ${filterKeyword})` : ''}...`);
console.log('(Press Ctrl+C to stop)\n');

// Watch for new logs
let lastPosition = 0;

if (fs.existsSync(logFilePath)) {
  lastPosition = fs.statSync(logFilePath).size;
}

// Poll for new content
const interval = setInterval(() => {
  if (fs.existsSync(logFilePath)) {
    const stat = fs.statSync(logFilePath);
    if (stat.size > lastPosition) {
      const content = fs.readFileSync(logFilePath, 'utf-8');
      const allLines = content.split('\n');
      
      // Calculate which lines are new
      let newContent = content.substring(lastPosition);
      let newLines = newContent.split('\n').filter(l => l.trim());
      
      // Display new lines
      newLines.forEach(line => {
        if (line.trim() && matchesFilter(line)) {
          const formatted = formatLog(line);
          if (formatted) console.log(formatted);
        }
      });
      
      lastPosition = stat.size;
    }
  }
}, 500); // Check every 500ms

// Graceful shutdown
process.on('SIGINT', () => {
  clearInterval(interval);
  console.log('\n\n✅ Log watcher stopped');
  process.exit(0);
});
