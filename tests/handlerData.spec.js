// The helpers the record handlers share (src/main/utils/handlerData.js).
const db = require('../src/db/db');
const {
  toSqliteValues,
  invalidDataError,
  getUserRoleNames,
} = require('../src/main/utils/handlerData');
const sessionManager = require('../src/main/sessionManager');

describe('toSqliteValues', () => {
  const date = new Date(Date.UTC(2026, 9, 5, 14, 30));

  it('stores booleans as 0/1 and dates as the day, leaving the rest as they are', () => {
    const data = { active: true, archived: false, joined: date, name: 'سلمى', age: 9, notes: null };

    expect(toSqliteValues(data)).toEqual({
      active: 1,
      archived: 0,
      joined: '2026-10-05',
      name: 'سلمى',
      age: 9,
      notes: null,
    });
  });

  it('keeps the full ISO time when asked (the users table)', () => {
    expect(toSqliteValues({ joined: date }, { dates: 'iso' })).toEqual({
      joined: '2026-10-05T14:30:00.000Z',
    });
  });
});

describe('invalidDataError', () => {
  it('lists every Joi message after «بيانات غير صالحة»', () => {
    const error = invalidDataError({
      details: [{ message: 'الاسم مطلوب' }, { message: 'الهاتف غير صالح' }],
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('بيانات غير صالحة: الاسم مطلوب; الهاتف غير صالح');
  });
});

describe('getUserRoleNames', () => {
  it('returns the role names of the user', async () => {
    db.allQuery.mockResolvedValueOnce([{ name: 'Superadmin' }, { name: 'FinanceManager' }]);

    expect(await getUserRoleNames(7)).toEqual(['Superadmin', 'FinanceManager']);
    expect(db.allQuery).toHaveBeenCalledWith(expect.stringContaining('FROM roles r'), [7]);
  });
});

describe('sessionManager.getSessionForEvent', () => {
  afterEach(() => sessionManager.revokeAllSessions());

  it("finds the session of the call's window, and nothing without one", () => {
    sessionManager.createSession({ id: 3 }, { id: 10, username: 'a', roles: ['Superadmin'] }, null);

    expect(sessionManager.getSessionForEvent({ sender: { id: 3 } })).toEqual(
      expect.objectContaining({ userId: 10 }),
    );
    expect(sessionManager.getSessionForEvent({ sender: { id: 4 } })).toBeNull();
    expect(sessionManager.getSessionForEvent(null)).toBeNull();
    expect(sessionManager.getSessionForEvent({ sender: {} })).toBeNull();
  });
});
