// electron-builder afterPack hook: sets the Electron fuses of the packaged executable, so the
// installed app cannot be started as plain Node or with a Node debugger (ELECTRON_RUN_AS_NODE,
// NODE_OPTIONS, --inspect), and only loads its code from app.asar. Without them, anyone using
// the shared office computer could run code in the main process and skip every role check.
// See src/main/startupGuard.js for the Chromium remote-debugging switches.
const path = require('path');
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses');

const FUSES = {
  version: FuseVersion.V1,
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
  [FuseV1Options.EnableCookieEncryption]: true,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
};

/** The packaged Electron executable for this platform. */
function executablePath(context) {
  const { appOutDir, electronPlatformName, packager } = context;
  const name = packager.appInfo.productFilename;
  if (electronPlatformName === 'darwin' || electronPlatformName === 'mas') {
    return path.join(appOutDir, `${name}.app`);
  }
  if (electronPlatformName === 'win32') return path.join(appOutDir, `${name}.exe`);
  return path.join(appOutDir, packager.executableName || name);
}

async function afterPack(context) {
  await flipFuses(executablePath(context), FUSES);
}

module.exports = afterPack;
module.exports.default = afterPack;
module.exports.FUSES = FUSES;
module.exports.executablePath = executablePath;
