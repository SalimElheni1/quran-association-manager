// The three places that decide what a role may do agree with each other:
// - the main-process guard, ipcSecurity.CHANNEL_ROLES;
// - the role list some handlers repeat, requireRoles([...]);
// - the window's gates (src/renderer/utils/permissions.js), which decide which pages and buttons
//   a role is shown.
// A page or button the main process refuses is an error message waiting to happen; an action the
// main process allows but the window hides is a feature the role cannot reach.

// 'node:fs' is not caught by the '^fs$' mapper in jest.config.js, so this is the real fs.
const fs = require('node:fs');
const path = require('path');
const { CHANNEL_ROLES } = require('../src/main/ipcSecurity');
const { PERMISSIONS, ROLE_PERMISSIONS } = require('../src/renderer/utils/permissions');

const ROLES = Object.keys(ROLE_PERMISSIONS);

// For each window permission, the channels the pages and buttons it gates call.
const GATES = {
  STUDENTS_VIEW: ['students:get', 'students:getById'],
  STUDENTS_CREATE: ['students:add'],
  STUDENTS_EDIT: ['students:update'],
  STUDENTS_DELETE: ['students:delete', 'students:restore'],
  TEACHERS_VIEW: ['teachers:get', 'teachers:getById'],
  TEACHERS_CREATE: ['teachers:add'],
  TEACHERS_EDIT: ['teachers:update'],
  TEACHERS_DELETE: ['teachers:delete', 'teachers:restore'],
  CLASSES_VIEW: ['classes:get', 'classes:getById'],
  CLASSES_CREATE: ['classes:add'],
  CLASSES_EDIT: ['classes:update', 'classes:updateEnrollments'],
  CLASSES_DELETE: ['classes:delete', 'classes:restore'],
  ATTENDANCE_VIEW: ['attendance:getForDate', 'attendance:getStudentsForClass'],
  ATTENDANCE_MANAGE: ['attendance:save'],
  FINANCIALS_VIEW: ['transactions:get', 'financial:get-summary', 'inventory:get'],
  FINANCIALS_MANAGE: [
    'transactions:add',
    'transactions:update',
    'transactions:delete',
    'student-fees:recordPayment',
  ],
  FINANCIALS_REPORTS: [
    'financial-export:cash-ledger',
    'financial-export:inventory-ledger',
    'financial-export:financial-summary',
    'financial-export:word-report',
  ],
  INVENTORY_MANAGE: ['inventory:add', 'inventory:update', 'inventory:delete', 'inventory:restore'],
  USERS_VIEW: ['users:get'],
  USERS_CREATE: ['users:add'],
  USERS_EDIT: ['users:update'],
  USERS_DELETE: ['users:delete', 'users:restore'],
  SETTINGS_VIEW: ['settings:get'],
  SETTINGS_EDIT: ['settings:update'],
  DATA_EXPORT: ['export:generate'],
  DATA_IMPORT: ['import:excel'],
};

const rolesWith = (permission) =>
  ROLES.filter((role) => ROLE_PERMISSIONS[role].includes(PERMISSIONS[permission]));
const sorted = (list) => [...list].sort();

describe('the window gates and the main-process roles', () => {
  test('every window permission says which channels it stands for', () => {
    expect(sorted(Object.keys(GATES))).toEqual(sorted(Object.keys(PERMISSIONS)));
    const unknown = Object.values(GATES)
      .flat()
      .filter((channel) => !CHANNEL_ROLES[channel]);
    expect(unknown).toEqual([]);
  });

  test.each(Object.keys(GATES))(
    '%s is only given to roles the main process allows on its channels',
    (permission) => {
      for (const channel of GATES[permission]) {
        expect({
          channel,
          refused: rolesWith(permission).filter((role) => !CHANNEL_ROLES[channel].includes(role)),
        }).toEqual({ channel, refused: [] });
      }
    },
  );

  // A list can feed other screens too (users:get fills the finance screens' pickers), so only
  // the permissions that change something must match their channels exactly.
  test.each(Object.keys(GATES).filter((permission) => !permission.endsWith('_VIEW')))(
    '%s is given to every role the main process allows on its channels',
    (permission) => {
      for (const channel of GATES[permission]) {
        expect({ channel, roles: sorted(rolesWith(permission)) }).toEqual({
          channel,
          roles: sorted(CHANNEL_ROLES[channel]),
        });
      }
    },
  );
});

describe('the role lists handlers repeat', () => {
  function handlersWithRoles() {
    const found = [];
    const walk = (dir) => {
      for (const name of fs.readdirSync(dir)) {
        const file = path.join(dir, name);
        if (fs.statSync(file).isDirectory()) walk(file);
        else if (file.endsWith('.js')) {
          const source = fs.readFileSync(file, 'utf8');
          const pattern =
            /ipcMain\.handle\(\s*['"]([^'"]+)['"]\s*,\s*requireRoles\(\[([^\]]*)\]\)/g;
          for (const [, channel, list] of source.matchAll(pattern)) {
            found.push({ channel, roles: [...list.matchAll(/['"](\w+)['"]/g)].map((m) => m[1]) });
          }
        }
      }
    };
    walk(path.join(__dirname, '..', 'src', 'main'));
    return found;
  }

  test('match the guard: a handler never refuses a role the guard let through', () => {
    const handlers = handlersWithRoles();
    expect(handlers.length).toBeGreaterThan(40);

    const drift = handlers
      .filter(
        ({ channel, roles }) =>
          sorted(roles).join() !== sorted(CHANNEL_ROLES[channel] || []).join(),
      )
      .map(({ channel, roles }) => ({ channel, handler: roles, guard: CHANNEL_ROLES[channel] }));
    expect(drift).toEqual([]);
  });
});
