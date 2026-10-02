// SEC-011: the argument schemas the IPC guard checks, with the real Joi.
jest.mock('joi', () => jest.requireActual('../node_modules/joi/lib/index.js'));

// 'node:fs' is not caught by the '^fs$' mapper in jest.config.js, so this is the real fs.
const fs = require('node:fs');
const path = require('path');
const { CHANNEL_ARG_SCHEMAS, validateChannelArgs } = require('../src/main/ipcValidation');

/** Every channel registered with ipcMain.handle / ipcMain.on anywhere in src/main. */
function registeredChannels() {
  const channels = new Set();
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const file = path.join(dir, name);
      if (fs.statSync(file).isDirectory()) walk(file);
      else if (file.endsWith('.js')) {
        const source = fs.readFileSync(file, 'utf8');
        for (const match of source.matchAll(/ipcMain\.(?:handle|on)\(\s*['"]([^'"]+)['"]/g)) {
          channels.add(match[1]);
        }
      }
    }
  };
  walk(path.join(__dirname, '..', 'src', 'main'));
  return channels;
}

describe('CHANNEL_ARG_SCHEMAS', () => {
  it('has a schema for every registered channel, and none for unknown channels', () => {
    const registered = registeredChannels();
    expect(registered.size).toBeGreaterThan(100);
    const missing = [...registered].filter((c) => !(c in CHANNEL_ARG_SCHEMAS));
    const stale = Object.keys(CHANNEL_ARG_SCHEMAS).filter((c) => !registered.has(c));
    expect(missing).toEqual([]);
    expect(stale).toEqual([]);
  });

  it('covers every channel the preload script exposes', () => {
    const preload = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'main', 'preload.js'),
      'utf8',
    );
    const exposed = [...preload.matchAll(/ipcRenderer\.(?:invoke|send)\(\s*['"]([^'"]+)/g)].map(
      (m) => m[1],
    );
    expect(exposed.filter((c) => !(c in CHANNEL_ARG_SCHEMAS))).toEqual([]);
  });
});

describe('validateChannelArgs: the calls the renderer really makes are accepted', () => {
  it.each([
    ['students:get', [undefined]],
    ['students:get', [{ searchTerm: 'سلمى', genderFilter: 'all', page: 1, limit: 25 }]],
    ['students:getById', [12]],
    ['students:update', [12, { name: 'سلمى' }]],
    ['classes:getEnrollmentData', [{ classId: 3, classAgeGroupId: null }]],
    ['classes:updateEnrollments', [{ classId: 3, studentIds: [1, 2] }]],
    ['ageGroups:validateStudentForClass', [9, 'Male', 2]],
    ['attendance:getStudentsForClass', ['3']], // select values arrive as strings
    ['attendance:getForDate', [{ classId: '3', date: '2026-10-01' }]],
    [
      'attendance:save',
      [{ classId: '3', date: '2026-10-01', records: { 5: 'present', 6: 'late' } }],
    ],
    ['db:get-attendance-summary-for-class', ['']],
    ['users:update', [{ id: 4, userData: { first_name: 'سامي' } }]],
    ['users:updateGuide', [{ id: 4, guideData: { current_step: 2 } }]],
    ['student-fees:getAll', ['2026-2027']],
    ['student-fees:generateAllCharges', ['2026-2027', true]],
    ['student-fees:setFeeGroup', [{ studentId: 7, ageGroupId: 2 }]],
    ['student-fees:deletePayment', [{ paymentId: 9 }]],
    ['student-fees:getPaymentHistory', [{ studentId: 7, academicYear: '2026-2027' }]],
    ['financial:get-summary', [{ startDate: '2026-10-01', endDate: '2026-10-31' }]],
    ['financial:get-summary', [2026]],
    [
      'financial-export:cash-ledger',
      [{ period: { startDate: '2026-10-01', endDate: '2026-10-31' } }],
    ],
    ['in-kind-categories:update', [3, 'أثاث']],
    ['categories:get', ['EXPENSE']],
    ['import:excel', ['/home/user/الطلاب.xlsx', ['الطلاب']]],
    ['settings:get', []],
    ['fee-charges:runManualCheck', [undefined]],
    ['logs:get-recent', [{ lines: 100 }]],
    ['logs:get-filtered', [{ keyword: 'backup', lines: 200 }]],
    ['ui:show-error-toast', ['حدث خطأ']],
    ['backup:reveal-transfer-key', [{ password: 'secret' }]],
    [
      'backup:set-transfer-key',
      [{ password: 'secret', key: 'branch-key', confirmKey: 'branch-key' }],
    ],
    ['logout', []],
  ])('%s %j', (channel, args) => {
    expect(validateChannelArgs(channel, args)).toBeNull();
  });
});

describe('validateChannelArgs: bad input is rejected', () => {
  it.each([
    ['an extra argument', 'students:getById', [12, 'extra']],
    ['a missing id', 'students:getById', []],
    ['a negative id', 'students:delete', [-1]],
    ['a fractional id', 'students:delete', [1.5]],
    ['an id that is not a number', 'students:delete', ['1 OR 1=1']],
    ['a null payload', 'students:add', [null]],
    ['an array instead of a payload', 'transactions:add', [[{ amount: 5 }]]],
    ['a string instead of filters', 'students:get', ['all']],
    ['ids that are not numbers', 'classes:updateEnrollments', [{ classId: 3, studentIds: ['x'] }]],
    ['a missing payment id', 'student-fees:refundPayment', [{}]],
    ['an unexpected key', 'groups:addStudentToGroup', [{ studentId: 1, groupId: 2, admin: true }]],
    ['a non-boolean flag', 'fee-charges:runManualCheck', ['yes']],
    ['an oversized log request', 'logs:get-recent', [{ lines: 1e9 }]],
    ['an argument to a channel that takes none', 'logs:clear', ['now']],
    [
      'an object as an attendance status',
      'attendance:save',
      [{ classId: 1, date: 'd', records: { 1: {} } }],
    ],
  ])('%s (%s)', (_label, channel, args) => {
    expect(validateChannelArgs(channel, args)).toEqual(expect.any(String));
  });

  it('says which argument failed and why, without echoing the value', () => {
    const message = validateChannelArgs('students:delete', ['CIN 08123456']);
    expect(message).toMatch(/^argument 1: /);
    expect(message).not.toContain('08123456');
  });

  it('leaves channels without a schema to the guard', () => {
    expect(validateChannelArgs('not-a-channel', [1, 2, 3])).toBeNull();
  });
});
