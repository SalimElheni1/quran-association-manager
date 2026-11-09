// src/main/startupGuard.js
// The installed app never runs with a debugger attached. With one, anyone at the computer could
// drive the window or the main process as the logged-in user (or read the database key), whatever
// their role. The Electron fuses set at packaging (build/afterPack.js) already turn off Node's
// --inspect; Chromium's remote debugging has no fuse, so its switches are refused here.

// Switches that open a debugger, as Chromium/Node spell them.
const DEBUG_SWITCHES = [
  'remote-debugging-port',
  'remote-debugging-pipe',
  'inspect',
  'inspect-brk',
  'inspect-port',
];

/**
 * The debugger switches the app was started with.
 * @param {{ hasSwitch: (name: string) => boolean }} commandLine app.commandLine
 * @param {string[]} argv process.argv
 * @returns {string[]} The switch names found (empty when none).
 */
function debugSwitchesIn(commandLine, argv = []) {
  const found = DEBUG_SWITCHES.filter((name) => commandLine && commandLine.hasSwitch(name));
  for (const arg of argv) {
    const match = /^--(inspect(?:-brk|-port)?|remote-debugging-(?:port|pipe))(?:=|$)/.exec(arg);
    if (match) found.push(match[1]);
  }
  return [...new Set(found)];
}

module.exports = { DEBUG_SWITCHES, debugSwitchesIn };
