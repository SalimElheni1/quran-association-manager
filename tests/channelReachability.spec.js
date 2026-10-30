// Every IPC channel the main process registers can be reached from the window: the preload
// script exposes a method that calls it, and a page uses that method. A channel nobody calls
// is code that keeps its privileges without being looked after.
jest.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: jest.fn() },
  ipcRenderer: {
    invoke: jest.fn(() => Promise.resolve({})),
    send: jest.fn(),
    on: jest.fn(),
    removeListener: jest.fn(),
    removeAllListeners: jest.fn(),
  },
}));

// 'node:fs' is not caught by the '^fs$' mapper in jest.config.js, so this is the real fs.
const fs = require('node:fs');
const path = require('path');
const { contextBridge, ipcRenderer } = require('electron');

const SRC = path.join(__dirname, '..', 'src');

function sourcesIn(dir, extensions) {
  return fs.readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name);
    if (fs.statSync(file).isDirectory()) return sourcesIn(file, extensions);
    return extensions.some((ext) => file.endsWith(ext)) ? [fs.readFileSync(file, 'utf8')] : [];
  });
}

/** Every channel registered with ipcMain.handle / ipcMain.on anywhere in src/main. */
function registeredChannels() {
  const channels = new Set();
  for (const source of sourcesIn(path.join(SRC, 'main'), ['.js'])) {
    for (const match of source.matchAll(/ipcMain\.(?:handle|on)\(\s*['"]([^'"]+)['"]/g)) {
      channels.add(match[1]);
    }
  }
  return channels;
}

/** The channels each preload method calls, found by calling it. */
function channelsByPreloadMethod() {
  jest.isolateModules(() => require('../src/main/preload'));
  const api = contextBridge.exposeInMainWorld.mock.calls[0][1];
  const byMethod = {};
  for (const [name, method] of Object.entries(api)) {
    ipcRenderer.invoke.mockClear();
    ipcRenderer.send.mockClear();
    try {
      Promise.resolve(method({}, {}, {})).catch(() => {});
    } catch {
      // A method that needs real arguments still called its channel first.
    }
    byMethod[name] = [...ipcRenderer.invoke.mock.calls, ...ipcRenderer.send.mock.calls].map(
      ([channel]) => channel,
    );
  }
  return byMethod;
}

/** The preload methods the window's code calls. */
function methodsUsedByTheWindow() {
  const used = new Set();
  for (const source of sourcesIn(path.join(SRC, 'renderer'), ['.js', '.jsx'])) {
    // window.electronAPI.x, ?.x, or the method on the next line.
    for (const match of source.matchAll(/electronAPI\s*\??\.\s*([A-Za-z_]\w*)/g)) {
      used.add(match[1]);
    }
  }
  return used;
}

// Channels with a handler but no screen that calls them. Whether each feature gets its screen or
// goes is the maintainer's decision (docs/dev/review-2026-10.md, «Decisions for the
// maintainer»). Nothing new is added here: a channel that loses its last caller is removed.
const WITHOUT_A_SCREEN = [
  'accounts:add',
  'ageGroups:matchStudent',
  'attendance:getClassesForDay',
  'export:generate-dev-template',
  'fee-charges:runManualCheck',
  'financial:export-excel',
  'financial:export-pdf',
  'groups:add',
  'groups:addStudentToGroup',
  'groups:delete',
  'groups:getAssignmentData',
  'groups:getEligibleStudentsForGroup',
  'groups:getStudentGroups',
  'groups:removeStudentFromGroup',
  'groups:restore',
  'groups:update',
  'groups:updateGroupStudents',
  'import:get-sheet-info',
  'import:get-sheets',
  'inventory:check-uniqueness',
  'logs:clear',
  'logs:get-file-path',
  'logs:get-filtered',
  'logs:get-recent',
  'receipt-books:add',
  'receipt-books:delete',
  'receipt-books:get',
  'receipt-books:get-active',
  'receipt-books:get-next-number',
  'receipt-books:restore',
  'receipt-books:update',
  'student-fees:generateAnnualCharges',
  'student-fees:generateMonthlyCharges',
  'student-fees:getClassesWithSpecialFees',
  'student-fees:getStatus',
  'student-fees:refreshAllStudentCharges',
  'student-fees:refreshStudentCharges',
  'students:getByAgeGroup',
];

describe('IPC channels', () => {
  const registered = registeredChannels();
  const byMethod = channelsByPreloadMethod();
  const used = methodsUsedByTheWindow();
  const reachable = new Set(
    Object.entries(byMethod)
      .filter(([name]) => used.has(name))
      .flatMap(([, channels]) => channels),
  );
  const withoutAScreen = (channels) => channels.every((c) => WITHOUT_A_SCREEN.includes(c));

  test('every registered channel is called from the window, apart from those without a screen', () => {
    expect(registered.size).toBeGreaterThan(100);

    expect(
      [...registered].filter((c) => !reachable.has(c) && !WITHOUT_A_SCREEN.includes(c)).sort(),
    ).toEqual([]);
  });

  test('the channels without a screen are registered, and nothing calls them', () => {
    expect(WITHOUT_A_SCREEN.filter((c) => !registered.has(c))).toEqual([]);
    expect(WITHOUT_A_SCREEN.filter((c) => reachable.has(c))).toEqual([]);
  });

  test('every preload method calls a registered channel, and the window uses it', () => {
    expect(
      Object.entries(byMethod)
        .filter(([, channels]) => channels.some((c) => !registered.has(c)))
        .map(([name]) => name),
    ).toEqual([]);
    expect(
      Object.entries(byMethod)
        .filter(([name, channels]) => !used.has(name) && !withoutAScreen(channels))
        .map(([name]) => name),
    ).toEqual([]);
  });

  test('every method the window calls is one the preload script exposes', () => {
    expect([...used].filter((name) => !(name in byMethod))).toEqual([]);
  });
});
