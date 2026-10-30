// Class handlers against a real database.
const { useRealDb } = require('./helpers/realDb');
const { addStudent, addTeacher, addAgeGroup, addClass } = require('./helpers/fixtures');
const { registerStudentHandlers } = require('../../src/main/handlers/studentHandlers');
const { registerTeacherHandlers } = require('../../src/main/handlers/teacherHandlers');
const { registerClassHandlers } = require('../../src/main/handlers/classHandlers');
const { registerSettingsHandlers } = require('../../src/main/handlers/settingsHandlers');
const studentFeeHandlers = require('../../src/main/handlers/studentFeeHandlers');

const ctx = useRealDb({
  register: [
    registerStudentHandlers,
    registerTeacherHandlers,
    registerClassHandlers,
    () => registerSettingsHandlers(async () => {}),
  ],
});

beforeEach(() => ctx.resetDatabase());

describe('classes:updateEnrollments', () => {
  let classId;
  let active;
  let inactive;
  let newcomer;

  const enrolled = () =>
    ctx
      .all('SELECT student_id FROM class_students WHERE class_id = ? ORDER BY student_id', [
        classId,
      ])
      .map((r) => r.student_id);

  beforeEach(async () => {
    const ageGroupId = await addAgeGroup(ctx);
    classId = await addClass(ctx, { age_group_id: ageGroupId, teacher_id: await addTeacher(ctx) });
    active = await addStudent(ctx);
    inactive = await addStudent(ctx);
    newcomer = await addStudent(ctx);
    ctx.run('INSERT INTO class_students (class_id, student_id) VALUES (?, ?), (?, ?)', [
      classId,
      active,
      classId,
      inactive,
    ]);
    ctx.run("UPDATE students SET status = 'inactive' WHERE id = ?", [inactive]);
  });

  test('keeps inactive students, whom the dialog does not show, enrolled', async () => {
    // What the dialog sends: the active students it lists as enrolled, plus a newcomer.
    const result = await ctx.invoke('classes:updateEnrollments', {
      classId,
      studentIds: [active, newcomer],
    });

    expect(result.affectedStudents).toEqual([newcomer]);
    expect(enrolled()).toEqual([active, inactive, newcomer].sort((a, b) => a - b));
  });

  test('removes the students taken out in the dialog, and only them', async () => {
    const result = await ctx.invoke('classes:updateEnrollments', { classId, studentIds: [] });

    expect(result.affectedStudents).toEqual([active]);
    expect(enrolled()).toEqual([inactive]);
  });

  test('regenerates charges as the logged-in user, not a user id from the window', async () => {
    const regenerate = jest
      .spyOn(studentFeeHandlers, 'triggerChargeRegenerationForStudent')
      .mockResolvedValue({ success: true });
    try {
      await ctx.invoke('classes:updateEnrollments', {
        classId,
        studentIds: [active, newcomer],
        userId: 999,
      });

      expect(regenerate).toHaveBeenCalledWith(newcomer, { userId: ctx.user.id });
    } finally {
      regenerate.mockRestore();
    }
  });
});
