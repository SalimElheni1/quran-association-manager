// users:add / users:update against a real database, with the real validation: the roles a
// Superadmin gives an account are checked like every other field.
const { useRealDb } = require('./helpers/realDb');
const { registerUserHandlers } = require('../../src/main/handlers/userHandlers');

const ctx = useRealDb({ register: [registerUserHandlers] });

const rolesOf = (userId) =>
  ctx
    .all(
      `SELECT r.name FROM roles r JOIN user_roles ur ON ur.role_id = r.id
       WHERE ur.user_id = ? ORDER BY r.name`,
      [userId],
    )
    .map((r) => r.name);

let userId;

beforeEach(async () => {
  await ctx.resetDatabase();
  const created = await ctx.invoke('users:add', {
    username: 'samira',
    password: 'Zitouna#2026',
    first_name: 'Samira',
    last_name: 'Bouzid',
    national_id: '08123456',
    phone_number: '22123456',
    employment_type: 'volunteer',
    status: 'active',
    roles: ['SessionSupervisor'],
  });
  userId = created.id;
});

const update = (userData) =>
  ctx.invoke('users:update', {
    id: userId,
    userData: {
      username: 'samira',
      national_id: '08123456',
      first_name: 'Samira',
      last_name: 'Bouzid',
      phone_number: '22123456',
      status: 'active',
      ...userData,
    },
  });

describe('users:update: roles', () => {
  test('changes the roles to the ones given', async () => {
    await update({ roles: ['FinanceManager', 'SessionSupervisor'] });

    expect(rolesOf(userId)).toEqual(['FinanceManager', 'SessionSupervisor']);
  });

  test('refuses an empty role list: an account always keeps a role', async () => {
    const message = await ctx.rejectionMessage(update({ roles: [] }));

    expect(message).toContain('بيانات غير صالحة');
    expect(rolesOf(userId)).toEqual(['SessionSupervisor']);
  });

  test('refuses a role that does not exist instead of ignoring it', async () => {
    const message = await ctx.rejectionMessage(update({ roles: ['Owner'] }));

    expect(message).toContain('بيانات غير صالحة');
    expect(rolesOf(userId)).toEqual(['SessionSupervisor']);
  });

  test('leaves the roles alone when none are sent', async () => {
    await update({ first_name: 'Samira' });

    expect(rolesOf(userId)).toEqual(['SessionSupervisor']);
  });
});
