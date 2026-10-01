const { useRealDb } = require('./helpers/realDb');
const { addStudent, addTeacher, addAgeGroup, addClass } = require('./helpers/fixtures');
const { registerAttendanceHandlers } = require('../../src/main/handlers/attendanceHandlers');
const { registerStudentHandlers } = require('../../src/main/handlers/studentHandlers');
const { registerClassHandlers } = require('../../src/main/handlers/classHandlers');
const { registerTeacherHandlers } = require('../../src/main/handlers/teacherHandlers');
const { registerSettingsHandlers } = require('../../src/main/handlers/settingsHandlers');

const ctx = useRealDb({
  register: [
    registerAttendanceHandlers,
    registerStudentHandlers,
    registerClassHandlers,
    registerTeacherHandlers,
    () => registerSettingsHandlers(async () => {}),
  ],
});

let ageGroupId;
beforeAll(async () => {
  ageGroupId = await addAgeGroup(ctx);
});

// A class with the given students enrolled.
async function classWith(studentCount, overrides = {}) {
  const classId = await addClass(ctx, { age_group_id: ageGroupId, ...overrides });
  const studentIds = [];
  for (let i = 0; i < studentCount; i++) {
    studentIds.push(await addStudent(ctx, { classIds: [classId] }));
  }
  return { classId, studentIds };
}

const storedAttendance = (classId, date) =>
  ctx.all(
    'SELECT student_id, status FROM attendance WHERE class_id = ? AND date = ? ORDER BY student_id',
    [classId, date],
  );

describe('attendance: save and load per class and date', () => {
  test('a saved register is stored per student and loads back for the same class and date', async () => {
    const { classId, studentIds } = await classWith(3);
    const [a, b, c] = studentIds;

    expect(
      await ctx.invoke('attendance:save', {
        classId,
        date: '2026-10-05',
        records: { [a]: 'present', [b]: 'absent', [c]: 'late' },
      }),
    ).toEqual({ success: true });

    expect(storedAttendance(classId, '2026-10-05')).toEqual([
      { student_id: a, status: 'present' },
      { student_id: b, status: 'absent' },
      { student_id: c, status: 'late' },
    ]);
    expect(await ctx.invoke('attendance:getForDate', { classId, date: '2026-10-05' })).toEqual({
      [a]: 'present',
      [b]: 'absent',
      [c]: 'late',
    });
  });

  test('saving the same class and date again replaces the register instead of adding to it', async () => {
    const { classId, studentIds } = await classWith(2);
    const [a, b] = studentIds;
    await ctx.invoke('attendance:save', {
      classId,
      date: '2026-10-06',
      records: { [a]: 'present', [b]: 'present' },
    });

    await ctx.invoke('attendance:save', {
      classId,
      date: '2026-10-06',
      records: { [a]: 'absent' },
    });

    expect(storedAttendance(classId, '2026-10-06')).toEqual([{ student_id: a, status: 'absent' }]);
  });

  test('saving an empty register clears that date only', async () => {
    const { classId, studentIds } = await classWith(1);
    const [a] = studentIds;
    await ctx.invoke('attendance:save', {
      classId,
      date: '2026-10-07',
      records: { [a]: 'present' },
    });
    await ctx.invoke('attendance:save', { classId, date: '2026-10-08', records: { [a]: 'late' } });

    await ctx.invoke('attendance:save', { classId, date: '2026-10-07', records: {} });

    expect(await ctx.invoke('attendance:getForDate', { classId, date: '2026-10-07' })).toEqual({});
    expect(await ctx.invoke('attendance:getForDate', { classId, date: '2026-10-08' })).toEqual({
      [a]: 'late',
    });
  });

  test('registers of two classes on the same date are kept apart', async () => {
    const first = await classWith(1);
    const second = await classWith(1);

    await ctx.invoke('attendance:save', {
      classId: first.classId,
      date: '2026-10-09',
      records: { [first.studentIds[0]]: 'present' },
    });
    await ctx.invoke('attendance:save', {
      classId: second.classId,
      date: '2026-10-09',
      records: { [second.studentIds[0]]: 'absent' },
    });

    expect(
      await ctx.invoke('attendance:getForDate', { classId: first.classId, date: '2026-10-09' }),
    ).toEqual({ [first.studentIds[0]]: 'present' });
    expect(
      await ctx.invoke('attendance:getForDate', { classId: second.classId, date: '2026-10-09' }),
    ).toEqual({ [second.studentIds[0]]: 'absent' });
  });

  test('a register with an invalid status is refused and the previous one is kept', async () => {
    ctx.expectErrorLogs();
    const { classId, studentIds } = await classWith(1);
    const [a] = studentIds;
    await ctx.invoke('attendance:save', {
      classId,
      date: '2026-10-10',
      records: { [a]: 'present' },
    });

    expect(
      await ctx.rejectionMessage(
        ctx.invoke('attendance:save', {
          classId,
          date: '2026-10-10',
          records: { [a]: 'sleeping' },
        }),
      ),
    ).toMatch(/CHECK constraint failed/);

    expect(storedAttendance(classId, '2026-10-10')).toEqual([{ student_id: a, status: 'present' }]);
  });
});

describe('attendance: summary per class', () => {
  test('the summary lists each recorded date of the class with its record count, newest first', async () => {
    const { classId, studentIds } = await classWith(3);
    const other = await classWith(1);
    const [a, b, c] = studentIds;
    await ctx.invoke('attendance:save', {
      classId,
      date: '2026-09-01',
      records: { [a]: 'present', [b]: 'absent', [c]: 'present' },
    });
    await ctx.invoke('attendance:save', { classId, date: '2026-09-08', records: { [a]: 'late' } });
    await ctx.invoke('attendance:save', {
      classId: other.classId,
      date: '2026-09-15',
      records: { [other.studentIds[0]]: 'present' },
    });

    expect(await ctx.invoke('db:get-attendance-summary-for-class', classId)).toEqual([
      { date: '2026-09-08', record_count: 1 },
      { date: '2026-09-01', record_count: 3 },
    ]);
  });

  test('the summary of a class with no register, or with no class chosen, is empty', async () => {
    const { classId } = await classWith(1);

    expect(await ctx.invoke('db:get-attendance-summary-for-class', classId)).toEqual([]);
    expect(await ctx.invoke('db:get-attendance-summary-for-class', null)).toEqual([]);
  });
});

describe('attendance: who and what is on the register', () => {
  test('the register lists the class’s active students, without deleted or inactive ones', async () => {
    const { classId, studentIds } = await classWith(2);
    const [active, deleted] = studentIds;
    const inactive = await addStudent(ctx, { classIds: [classId], status: 'inactive' });
    await ctx.invoke('students:delete', deleted);

    const listed = (await ctx.invoke('attendance:getStudentsForClass', classId)).map((s) => s.id);

    expect(listed).toEqual([active]);
    expect(listed).not.toContain(inactive);
  });

  test('a deleted student’s past attendance is kept', async () => {
    const { classId, studentIds } = await classWith(1);
    const [a] = studentIds;
    await ctx.invoke('attendance:save', {
      classId,
      date: '2026-09-20',
      records: { [a]: 'present' },
    });

    await ctx.invoke('students:delete', a);

    expect(storedAttendance(classId, '2026-09-20')).toEqual([{ student_id: a, status: 'present' }]);
  });

  test('classes of a day are the active ones running on that date, with their teacher', async () => {
    const teacherId = await addTeacher(ctx, { name: 'معلم الحصة' });
    const running = await addClass(ctx, {
      age_group_id: ageGroupId,
      teacher_id: teacherId,
      start_date: '2026-09-01',
      end_date: '2027-06-30',
    });
    const open = await addClass(ctx, { age_group_id: ageGroupId });
    const notStarted = await addClass(ctx, { age_group_id: ageGroupId, start_date: '2026-11-01' });
    const ended = await addClass(ctx, { age_group_id: ageGroupId, end_date: '2026-09-30' });
    const pending = await addClass(ctx, { age_group_id: ageGroupId, status: 'pending' });
    const deleted = await addClass(ctx, { age_group_id: ageGroupId });
    await ctx.invoke('classes:delete', deleted);

    const classes = await ctx.invoke('attendance:getClassesForDay', '2026-10-15');
    const ids = classes.map((c) => c.id);

    expect(ids).toEqual(expect.arrayContaining([running, open]));
    [notStarted, ended, pending, deleted].forEach((id) => expect(ids).not.toContain(id));
    expect(classes.find((c) => c.id === running).teacher_name).toBe('معلم الحصة');
  });
});
