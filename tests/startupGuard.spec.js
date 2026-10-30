// The installed app refuses to start with a debugger switch (src/main/startupGuard.js), and the
// packaging hook turns off the Electron fuses that would let it run as Node (build/afterPack.js).
const path = require('path');
const { debugSwitchesIn } = require('../src/main/startupGuard');

// The library's own fs-extra doesn't load under this project's mocked 'fs'; its enums are
// plain numbers (FuseV1Options in @electron/fuses).
jest.mock('@electron/fuses', () => ({
  FuseVersion: { V1: '1' },
  FuseV1Options: {
    RunAsNode: 0,
    EnableCookieEncryption: 1,
    EnableNodeOptionsEnvironmentVariable: 2,
    EnableNodeCliInspectArguments: 3,
    EnableEmbeddedAsarIntegrityValidation: 4,
    OnlyLoadAppFromAsar: 5,
  },
  flipFuses: jest.fn().mockResolvedValue(undefined),
}));

const commandLine = (...switches) => ({ hasSwitch: (name) => switches.includes(name) });

describe('debugSwitchesIn', () => {
  it('finds nothing in a normal start', () => {
    expect(debugSwitchesIn(commandLine(), ['QuranBranchManager.exe'])).toEqual([]);
  });

  it.each([
    [commandLine('remote-debugging-port'), [], ['remote-debugging-port']],
    [commandLine('remote-debugging-pipe'), [], ['remote-debugging-pipe']],
    [commandLine(), ['app.exe', '--inspect=9229'], ['inspect']],
    [commandLine(), ['app.exe', '--inspect-brk'], ['inspect-brk']],
    [commandLine('inspect'), ['app.exe', '--inspect'], ['inspect']],
  ])('finds a debugger switch (%#)', (cl, argv, expected) => {
    expect(debugSwitchesIn(cl, argv)).toEqual(expected);
  });

  it('does not mistake other arguments for debugger switches', () => {
    expect(debugSwitchesIn(commandLine(), ['app.exe', '--inspection-report', 'inspect'])).toEqual(
      [],
    );
  });
});

describe('afterPack (Electron fuses)', () => {
  const { flipFuses, FuseV1Options } = require('@electron/fuses');
  const afterPack = require('../build/afterPack');

  it('turns off Node mode and Node debugging, and loads the app only from app.asar', async () => {
    await afterPack({
      appOutDir: path.join('release', 'win-unpacked'),
      electronPlatformName: 'win32',
      packager: { appInfo: { productFilename: 'QuranBranchManager' } },
    });

    expect(flipFuses).toHaveBeenCalledWith(
      path.join('release', 'win-unpacked', 'QuranBranchManager.exe'),
      expect.objectContaining({
        [FuseV1Options.RunAsNode]: false,
        [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
        [FuseV1Options.EnableNodeCliInspectArguments]: false,
        [FuseV1Options.OnlyLoadAppFromAsar]: true,
      }),
    );
  });

  it('finds the Linux executable', () => {
    expect(
      afterPack.executablePath({
        appOutDir: 'out',
        electronPlatformName: 'linux',
        packager: { appInfo: { productFilename: 'QuranBranchManager' }, executableName: 'qbm' },
      }),
    ).toBe(path.join('out', 'qbm'));
  });
});
