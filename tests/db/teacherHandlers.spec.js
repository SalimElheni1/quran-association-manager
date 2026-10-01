const { useRealDb } = require('./helpers/realDb');
const { addTeacher, addAgeGroup, addClass } = require('./helpers/fixtures');
const { registerTeacherHandlers } = require('../../src/main/handlers/teacherHandlers');
const { registerClassHandlers } = require('../../src/main/handlers/classHandlers');
const { registerSettingsHandlers } = require('../../src/main/handlers/settingsHandlers');

const ctx = useRealDb({
  register: [
    registerTeacherHandlers,
    registerClassHandlers,
    () => registerSettingsHandlers(async () => {}),
  ],
});

const listedIds = async (filters) =>
  (await ctx.invoke('teachers:get', { limit: 100, ...filters })).teachers.map((t) => t.id);

describe('teachers: create, list and edit', () => {
  test('a new teacher is stored with the next T- matricule', async () => {
    const first = await ctx.invoke('teachers:add', {
      name: 'أحمد المعلم',
      contact_info: '22111222',
      gender: 'Male',
      specialization: 'تجويد',
    });
    const second = await ctx.invoke('teachers:add', { name: 'سارة', contact_info: '22333444' });

    const rows = ctx.all(
      'SELECT id, matricule, name, specialization FROM teachers WHERE id IN (?, ?)',
      [first.id, second.id],
    );
    const matricules = rows.map((r) => r.matricule);
    expect(matricules.every((m) => /^T-\d{4}$/.test(m))).toBe(true);
    expect(Number(matricules[1].slice(2))).toBe(Number(matricules[0].slice(2)) + 1);
    expect(rows[0]).toMatchObject({ name: 'أحمد المعلم', specialization: 'تجويد' });
  });

  test('a teacher without a valid 8-digit phone number is refused and nothing is stored', async () => {
    const before = ctx.get('SELECT COUNT(*) AS n FROM teachers').n;

    await expect(
      ctx.invoke('teachers:add', { name: 'بدون هاتف', contact_info: '123' }),
    ).rejects.toThrow('بيانات غير صالحة');

    expect(ctx.get('SELECT COUNT(*) AS n FROM teachers').n).toBe(before);
  });

  test('the list is searchable by name and matricule, filterable by gender, and paginated', async () => {
    const woman = await addTeacher(ctx, { name: 'فاطمة البحث', gender: 'Female' });
    const man = await addTeacher(ctx, { name: 'عمر البحث', gender: 'Male' });
    const { matricule } = ctx.get('SELECT matricule FROM teachers WHERE id = ?', [man]);

    expect(await listedIds({ searchTerm: 'البحث' })).toEqual(expect.arrayContaining([woman, man]));
    expect(await listedIds({ searchTerm: matricule })).toEqual([man]);
    expect(await listedIds({ searchTerm: 'البحث', genderFilter: 'Female' })).toEqual([woman]);

    const page = await ctx.invoke('teachers:get', { searchTerm: 'البحث', page: 2, limit: 1 });
    expect(page).toMatchObject({ total: 2, page: 2, limit: 1, totalPages: 2 });
    expect(page.teachers).toHaveLength(1);
  });

  test('editing a teacher changes their details but never their matricule', async () => {
    const id = await addTeacher(ctx, { name: 'قبل التعديل' });
    const { matricule } = ctx.get('SELECT matricule FROM teachers WHERE id = ?', [id]);

    await ctx.invoke('teachers:update', id, {
      name: 'بعد التعديل',
      contact_info: '99887766',
      matricule: 'T-9999',
    });

    expect(await ctx.invoke('teachers:getById', id)).toMatchObject({
      name: 'بعد التعديل',
      contact_info: '99887766',
      matricule,
    });
  });
});

describe('teachers: soft delete and restore', () => {
  test('a deleted teacher is kept with its deletion time and who deleted it, and leaves the list', async () => {
    const id = await addTeacher(ctx, { name: 'معلم محذوف' });

    expect(await ctx.invoke('teachers:delete', id)).toEqual({ changes: 1 });

    const row = ctx.get('SELECT name, deleted_at, deleted_by FROM teachers WHERE id = ?', [id]);
    expect(row.name).toBe('معلم محذوف');
    expect(row.deleted_at).toMatch(/^\d{4}-\d{2}-\d{2}/);
    expect(row.deleted_by).toBe(ctx.user.id);
    expect(await listedIds()).not.toContain(id);
    expect(await listedIds({ showDeleted: true })).toContain(id);
  });

  test('a deleted teacher stays on the classes they taught', async () => {
    const teacherId = await addTeacher(ctx);
    const ageGroupId = await addAgeGroup(ctx);
    const classId = await addClass(ctx, { age_group_id: ageGroupId, teacher_id: teacherId });

    await ctx.invoke('teachers:delete', teacherId);

    expect(ctx.get('SELECT teacher_id FROM classes WHERE id = ?', [classId]).teacher_id).toBe(
      teacherId,
    );
  });

  test('a restored teacher is back in the list and no longer in the deleted list', async () => {
    const id = await addTeacher(ctx);
    await ctx.invoke('teachers:delete', id);

    expect(await ctx.invoke('teachers:restore', id)).toEqual({ changes: 1 });

    expect(ctx.get('SELECT deleted_at, deleted_by FROM teachers WHERE id = ?', [id])).toEqual({
      deleted_at: null,
      deleted_by: null,
    });
    expect(await listedIds()).toContain(id);
    expect(await listedIds({ showDeleted: true })).not.toContain(id);
  });

  test('deleting an already deleted teacher, or restoring a live one, changes nothing', async () => {
    const id = await addTeacher(ctx);

    expect(await ctx.invoke('teachers:restore', id)).toEqual({ changes: 0 });
    await ctx.invoke('teachers:delete', id);
    const { deleted_at: firstDeletion } = ctx.get('SELECT deleted_at FROM teachers WHERE id = ?', [
      id,
    ]);
    expect(await ctx.invoke('teachers:delete', id)).toEqual({ changes: 0 });
    expect(ctx.get('SELECT deleted_at FROM teachers WHERE id = ?', [id]).deleted_at).toBe(
      firstDeletion,
    );
  });

  test('delete and restore refuse an id that is not a number', async () => {
    ctx.expectErrorLogs();

    await expect(ctx.invoke('teachers:delete', '1')).rejects.toThrow('فشل حذف المعلم.');
    await expect(ctx.invoke('teachers:restore', null)).rejects.toThrow('فشل استعادة المعلم.');
  });
});
