const { useRealDb } = require('./helpers/realDb');
const { addStudent, addAgeGroup, addClass } = require('./helpers/fixtures');
const { registerGroupHandlers } = require('../../src/main/handlers/groupHandlers');
const { registerStudentHandlers } = require('../../src/main/handlers/studentHandlers');
const { registerClassHandlers } = require('../../src/main/handlers/classHandlers');
const { registerSettingsHandlers } = require('../../src/main/handlers/settingsHandlers');

const ctx = useRealDb({
  register: [
    registerGroupHandlers,
    registerStudentHandlers,
    registerClassHandlers,
    () => registerSettingsHandlers(async () => {}),
  ],
});

const memberIds = (groupId) =>
  ctx
    .all('SELECT student_id FROM student_groups WHERE group_id = ? ORDER BY student_id', [groupId])
    .map((row) => row.student_id);

const listedNames = async (filters) =>
  (await ctx.invoke('groups:get', filters)).data.map((group) => group.name);

describe('groups: create and edit', () => {
  test('a new group is stored with the students chosen for it', async () => {
    const a = await addStudent(ctx);
    const b = await addStudent(ctx);

    const result = await ctx.invoke('groups:add', {
      name: 'حلقة الفجر',
      description: 'حفظ',
      category: 'Men',
      studentIds: [a, b],
    });

    expect(result.success).toBe(true);
    expect(
      ctx.get('SELECT name, description, category FROM groups WHERE id = ?', [result.data.id]),
    ).toEqual({ name: 'حلقة الفجر', description: 'حفظ', category: 'Men' });
    expect(memberIds(result.data.id)).toEqual([a, b]);

    const listed = (await ctx.invoke('groups:get', { name: 'الفجر' })).data;
    expect(listed).toHaveLength(1);
    expect(listed[0].studentCount).toBe(2);
  });

  test('two groups cannot share a name', async () => {
    ctx.expectErrorLogs();
    await ctx.invoke('groups:add', { name: 'حلقة مكررة', category: 'Kids' });

    const second = await ctx.invoke('groups:add', { name: 'حلقة مكررة', category: 'Women' });

    expect(second).toEqual({ success: false, message: 'يوجد مجموعة بهذا الاسم بالفعل.' });
    expect(ctx.get("SELECT COUNT(*) AS n FROM groups WHERE name = 'حلقة مكررة'").n).toBe(1);
  });

  test('editing a group replaces its details and its member list', async () => {
    const a = await addStudent(ctx);
    const b = await addStudent(ctx);
    const { data } = await ctx.invoke('groups:add', {
      name: 'حلقة للتعديل',
      category: 'Kids',
      studentIds: [a],
    });

    const result = await ctx.invoke('groups:update', data.id, {
      name: 'حلقة معدلة',
      description: 'جديد',
      category: 'Women',
      studentIds: [b],
    });

    expect(result.success).toBe(true);
    expect(
      ctx.get('SELECT name, description, category FROM groups WHERE id = ?', [data.id]),
    ).toEqual({ name: 'حلقة معدلة', description: 'جديد', category: 'Women' });
    expect(memberIds(data.id)).toEqual([b]);
  });

  test('editing a group without a student list leaves its members as they are', async () => {
    const a = await addStudent(ctx);
    const { data } = await ctx.invoke('groups:add', {
      name: 'حلقة ثابتة',
      category: 'Kids',
      studentIds: [a],
    });

    await ctx.invoke('groups:update', data.id, { name: 'حلقة ثابتة 2', category: 'Kids' });

    expect(memberIds(data.id)).toEqual([a]);
  });

  test('adding a student who is already a member changes nothing, and removing takes them out', async () => {
    const a = await addStudent(ctx);
    const { data } = await ctx.invoke('groups:add', { name: 'حلقة العضوية', category: 'Men' });

    expect(
      await ctx.invoke('groups:addStudentToGroup', { studentId: a, groupId: data.id }),
    ).toEqual({ success: true });
    expect(
      await ctx.invoke('groups:addStudentToGroup', { studentId: a, groupId: data.id }),
    ).toEqual({ success: true });
    expect(memberIds(data.id)).toEqual([a]);

    await ctx.invoke('groups:removeStudentFromGroup', { studentId: a, groupId: data.id });
    expect(memberIds(data.id)).toEqual([]);
  });

  test('replacing the member list keeps the memberships of deleted students for a restore', async () => {
    const kept = await addStudent(ctx);
    const deleted = await addStudent(ctx);
    const added = await addStudent(ctx);
    const { data } = await ctx.invoke('groups:add', {
      name: 'حلقة المحذوفين',
      category: 'Men',
      studentIds: [kept, deleted],
    });
    await ctx.invoke('students:delete', deleted);

    await ctx.invoke('groups:updateGroupStudents', { groupId: data.id, studentIds: [added] });

    expect(memberIds(data.id)).toEqual([deleted, added].sort((x, y) => x - y));
    const listed = (await ctx.invoke('groups:getGroupStudents', data.id)).data.map((s) => s.id);
    expect(listed).toEqual([added]);
  });

  test('a failed member list replacement leaves the old list in place', async () => {
    ctx.expectErrorLogs();
    const a = await addStudent(ctx);
    const { data } = await ctx.invoke('groups:add', {
      name: 'حلقة ذرية',
      category: 'Men',
      studentIds: [a],
    });

    // Student 999999 does not exist: the foreign key rejects it, so the whole change is undone.
    const result = await ctx.invoke('groups:updateGroupStudents', {
      groupId: data.id,
      studentIds: [999999],
    });

    expect(result.success).toBe(false);
    expect(memberIds(data.id)).toEqual([a]);
  });
});

describe('groups: soft delete and restore', () => {
  test('a deleted group is kept with its deletion time and who deleted it, and leaves the list', async () => {
    const a = await addStudent(ctx);
    const { data } = await ctx.invoke('groups:add', {
      name: 'حلقة للحذف',
      category: 'Men',
      studentIds: [a],
    });

    expect(await ctx.invoke('groups:delete', data.id)).toEqual({ success: true });

    const row = ctx.get('SELECT deleted_at, deleted_by FROM groups WHERE id = ?', [data.id]);
    expect(row.deleted_at).toMatch(/^\d{4}-\d{2}-\d{2}/);
    expect(row.deleted_by).toBe(ctx.user.id);
    expect(memberIds(data.id)).toEqual([a]);

    expect(await listedNames()).not.toContain('حلقة للحذف');
    expect(await listedNames({ showDeleted: true })).toEqual(['حلقة للحذف']);
    const studentGroups = (await ctx.invoke('groups:getStudentGroups', a)).data;
    expect(studentGroups.map((g) => g.id)).not.toContain(data.id);
  });

  test('a restored group comes back with its members', async () => {
    const a = await addStudent(ctx);
    const { data } = await ctx.invoke('groups:add', {
      name: 'حلقة للاستعادة',
      category: 'Men',
      studentIds: [a],
    });
    await ctx.invoke('groups:delete', data.id);

    expect(await ctx.invoke('groups:restore', data.id)).toEqual({ success: true });

    expect(ctx.get('SELECT deleted_at, deleted_by FROM groups WHERE id = ?', [data.id])).toEqual({
      deleted_at: null,
      deleted_by: null,
    });
    expect(await listedNames()).toContain('حلقة للاستعادة');
    expect(await listedNames({ showDeleted: true })).not.toContain('حلقة للاستعادة');
    expect((await ctx.invoke('groups:getStudentGroups', a)).data.map((g) => g.id)).toContain(
      data.id,
    );
  });

  test('a group’s student count leaves out deleted students', async () => {
    const kept = await addStudent(ctx);
    const deleted = await addStudent(ctx);
    await ctx.invoke('groups:add', {
      name: 'حلقة العدد',
      category: 'Men',
      studentIds: [kept, deleted],
    });
    await ctx.invoke('students:delete', deleted);

    const listed = (await ctx.invoke('groups:get', { name: 'حلقة العدد' })).data;

    expect(listed[0].studentCount).toBe(1);
  });

  test('deleting a group twice keeps the first deletion time', async () => {
    const { data } = await ctx.invoke('groups:add', { name: 'حلقة مرتين', category: 'Men' });
    ctx.run("UPDATE groups SET deleted_at = '2020-01-01T00:00:00' WHERE id = ?", [data.id]);

    await ctx.invoke('groups:delete', data.id);

    expect(ctx.get('SELECT deleted_at FROM groups WHERE id = ?', [data.id]).deleted_at).toBe(
      '2020-01-01T00:00:00',
    );
  });

  test('a deleted group is not offered when enrolling a class', async () => {
    const ageGroupId = await addAgeGroup(ctx);
    const classId = await addClass(ctx, { age_group_id: ageGroupId });
    const live = await ctx.invoke('groups:add', { name: 'حلقة متاحة', category: 'Men' });
    const gone = await ctx.invoke('groups:add', { name: 'حلقة محذوفة', category: 'Men' });
    await ctx.invoke('groups:delete', gone.data.id);

    const offered = (await ctx.invoke('groups:getEligibleGroupsForClass', classId)).data.map(
      (g) => g.id,
    );

    expect(offered).toContain(live.data.id);
    expect(offered).not.toContain(gone.data.id);
  });
});

describe('groups: who can join', () => {
  test('a kids group offers active students of 17 or younger, and marks current members', async () => {
    const child = await addStudent(ctx, { date_of_birth: '2016-05-01', name: 'طفل صغير' });
    const member = await addStudent(ctx, { date_of_birth: '2015-05-01', name: 'طفل عضو' });
    const adult = await addStudent(ctx, { date_of_birth: '1990-05-01' });
    const inactiveChild = await addStudent(ctx, {
      date_of_birth: '2016-05-01',
      status: 'inactive',
    });
    const deletedChild = await addStudent(ctx, { date_of_birth: '2016-05-01' });
    await ctx.invoke('students:delete', deletedChild);
    const { data } = await ctx.invoke('groups:add', {
      name: 'حلقة الأطفال',
      category: 'Kids',
      studentIds: [member],
    });

    const offered = (await ctx.invoke('groups:getAssignmentData', data.id)).data;
    const byId = Object.fromEntries(offered.map((s) => [s.id, s.isMember]));

    expect(byId[child]).toBe(0);
    expect(byId[member]).toBe(1);
    expect(byId).not.toHaveProperty(String(adult));
    expect(byId).not.toHaveProperty(String(inactiveChild));
    expect(byId).not.toHaveProperty(String(deletedChild));
  });

  test('a women group offers adult women only', async () => {
    const woman = await addStudent(ctx, { gender: 'Female', date_of_birth: '1985-01-01' });
    const man = await addStudent(ctx, { gender: 'Male', date_of_birth: '1985-01-01' });
    const girl = await addStudent(ctx, { gender: 'Female', date_of_birth: '2015-01-01' });

    const offered = (await ctx.invoke('groups:getEligibleStudentsForGroup', 'Women')).data.map(
      (s) => s.id,
    );

    expect(offered).toContain(woman);
    expect(offered).not.toContain(man);
    expect(offered).not.toContain(girl);
  });

  test('an unknown group category is refused', async () => {
    const result = await ctx.invoke('groups:getEligibleStudentsForGroup', 'Elders');

    expect(result).toEqual({ success: false, message: 'فئة المجموعة غير معروفة.' });
  });
});
