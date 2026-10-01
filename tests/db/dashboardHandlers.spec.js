const { useRealDb } = require('./helpers/realDb');
const { addStudent, addTeacher, addAgeGroup, addClass } = require('./helpers/fixtures');
const { registerDashboardHandlers } = require('../../src/main/handlers/dashboardHandlers');
const { registerStudentHandlers } = require('../../src/main/handlers/studentHandlers');
const { registerClassHandlers } = require('../../src/main/handlers/classHandlers');
const { registerTeacherHandlers } = require('../../src/main/handlers/teacherHandlers');
const { registerSettingsHandlers } = require('../../src/main/handlers/settingsHandlers');

const ctx = useRealDb({
  register: [
    registerDashboardHandlers,
    registerStudentHandlers,
    registerClassHandlers,
    registerTeacherHandlers,
    () => registerSettingsHandlers(async () => {}),
  ],
});

beforeEach(() => ctx.resetDatabase());

describe('dashboard: counts', () => {
  test('an empty branch shows zero students, teachers and classes', async () => {
    expect(await ctx.invoke('get-dashboard-stats')).toEqual({
      studentCount: 0,
      teacherCount: 0,
      classCount: 0,
    });
  });

  test('counts include active records only and leave deleted ones out', async () => {
    const ageGroupId = await addAgeGroup(ctx);
    await addStudent(ctx);
    await addStudent(ctx, { status: 'inactive' });
    const deletedStudent = await addStudent(ctx);
    await ctx.invoke('students:delete', deletedStudent);
    await addTeacher(ctx);
    const deletedTeacher = await addTeacher(ctx);
    await ctx.invoke('teachers:delete', deletedTeacher);
    await addClass(ctx, { age_group_id: ageGroupId });
    await addClass(ctx, { age_group_id: ageGroupId, status: 'pending' });
    const deletedClass = await addClass(ctx, { age_group_id: ageGroupId });
    await ctx.invoke('classes:delete', deletedClass);

    expect(await ctx.invoke('get-dashboard-stats')).toEqual({
      studentCount: 1,
      teacherCount: 1,
      classCount: 1,
    });
  });

  test('a restored teacher counts again', async () => {
    const id = await addTeacher(ctx);
    await ctx.invoke('teachers:delete', id);
    expect((await ctx.invoke('get-dashboard-stats')).teacherCount).toBe(0);

    await ctx.invoke('teachers:restore', id);

    expect((await ctx.invoke('get-dashboard-stats')).teacherCount).toBe(1);
  });
});

describe('dashboard: today’s classes', () => {
  afterEach(() => jest.useRealTimers());

  test('lists the active classes scheduled on today’s weekday, with their teacher', async () => {
    // Monday 5 October 2026.
    jest.useFakeTimers({
      now: new Date(2026, 9, 5, 9, 0, 0),
      doNotFake: ['nextTick', 'setImmediate'],
    });
    const ageGroupId = await addAgeGroup(ctx);
    const teacherId = await addTeacher(ctx, { name: 'معلم الاثنين' });
    const monday = JSON.stringify([{ day: 'Monday', time: 'بعد العصر' }]);
    const tuesday = JSON.stringify([{ day: 'Tuesday', time: 'بعد العصر' }]);
    const mondayClass = await addClass(ctx, {
      age_group_id: ageGroupId,
      teacher_id: teacherId,
      schedule: monday,
    });
    await addClass(ctx, { age_group_id: ageGroupId, schedule: tuesday });
    await addClass(ctx, { age_group_id: ageGroupId, schedule: monday, status: 'pending' });
    const deletedMonday = await addClass(ctx, { age_group_id: ageGroupId, schedule: monday });
    await ctx.invoke('classes:delete', deletedMonday);

    const today = await ctx.invoke('get-todays-classes');

    expect(today).toHaveLength(1);
    expect(today[0]).toMatchObject({ id: mondayClass, teacher_name: 'معلم الاثنين' });
  });
});
