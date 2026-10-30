// Student handlers against a real database.
const { useRealDb } = require('./helpers/realDb');
const { addStudent } = require('./helpers/fixtures');
const { registerStudentHandlers } = require('../../src/main/handlers/studentHandlers');

const ctx = useRealDb({ register: [registerStudentHandlers] });

beforeEach(() => ctx.resetDatabase());

describe('students:getById: what each role sees', () => {
  let studentId;

  beforeEach(async () => {
    studentId = await addStudent(ctx, {
      name: 'سلمى بنت علي',
      national_id: '08123456',
      health_conditions: 'حساسية',
      emergency_contact_name: 'خالها',
      emergency_contact_phone: '22111222',
      sponsor_name: 'كافل',
      sponsor_cin: '09876543',
    });
  });

  test.each([['Superadmin'], ['Administrator']])(
    '%s (edits students) gets every field',
    async (role) => {
      const student = await ctx.invokeAs([role], 'students:getById', studentId);

      expect(student).toEqual(
        expect.objectContaining({
          name: 'سلمى بنت علي',
          health_conditions: 'حساسية',
          emergency_contact_phone: '22111222',
          sponsor_cin: '09876543',
          classes: [],
          surahs: [],
          hizbs: [],
        }),
      );
    },
  );

  test.each([['FinanceManager'], ['SessionSupervisor']])(
    '%s (reads students) gets what the details view shows, not health or sponsor data',
    async (role) => {
      const student = await ctx.invokeAs([role], 'students:getById', studentId);

      expect(student).toEqual(
        expect.objectContaining({ id: studentId, name: 'سلمى بنت علي', national_id: '08123456' }),
      );
      expect(student).not.toHaveProperty('health_conditions');
      expect(student).not.toHaveProperty('emergency_contact_name');
      expect(student).not.toHaveProperty('emergency_contact_phone');
      expect(student).not.toHaveProperty('sponsor_name');
      expect(student).not.toHaveProperty('sponsor_cin');
      expect(student.classes).toEqual([]);
    },
  );
});

describe('students:get: filters', () => {
  let surahs;
  let hizbs;
  let ids;

  const names = async (filters) =>
    (await ctx.invoke('students:get', filters)).students.map((st) => st.name).sort();

  const memorise = (studentId, { surahIds = [], hizbIds = [] }) => {
    surahIds.forEach((id) =>
      ctx.run('INSERT INTO student_surahs (student_id, surah_id) VALUES (?, ?)', [studentId, id]),
    );
    hizbIds.forEach((id) =>
      ctx.run('INSERT INTO student_hizbs (student_id, hizb_id) VALUES (?, ?)', [studentId, id]),
    );
  };

  beforeEach(async () => {
    surahs = ctx.all('SELECT id FROM surahs ORDER BY id LIMIT 3').map((r) => r.id);
    hizbs = ctx.all('SELECT id FROM hizbs ORDER BY id LIMIT 2').map((r) => r.id);
    ids = {
      ahmed: await addStudent(ctx, { name: 'أحمد', gender: 'Male' }),
      amina: await addStudent(ctx, { name: 'آمنة', gender: 'Female' }),
      ali: await addStudent(ctx, { name: 'علي', gender: 'Male' }),
    };
    memorise(ids.ahmed, { surahIds: [surahs[0], surahs[1]], hizbIds: [hizbs[0], hizbs[1]] });
    memorise(ids.amina, { surahIds: [surahs[0], surahs[1]], hizbIds: [hizbs[0]] });
    memorise(ids.ali, { surahIds: [surahs[0]] });
  });

  test('students who memorised every selected surah', async () => {
    expect(await names({ surahIds: [surahs[0], surahs[1]] })).toEqual(['آمنة', 'أحمد']);
  });

  test('a surah filter together with a search or a gender filter', async () => {
    expect(await names({ surahIds: [surahs[0]], searchTerm: 'علي' })).toEqual(['علي']);
    expect(await names({ surahIds: [surahs[0], surahs[1]], genderFilter: 'Male' })).toEqual([
      'أحمد',
    ]);
  });

  test('surah and hizb filters together', async () => {
    expect(await names({ surahIds: [surahs[0], surahs[1]], hizbIds: [hizbs[0]] })).toEqual([
      'آمنة',
      'أحمد',
    ]);
    expect(await names({ surahIds: [surahs[0]], hizbIds: [hizbs[0], hizbs[1]] })).toEqual(['أحمد']);
  });

  test('the total counts the matching students, the page holds at most the limit', async () => {
    const result = await ctx.invoke('students:get', {
      surahIds: [surahs[0]],
      page: 2,
      limit: 2,
    });

    expect(result.total).toBe(3);
    expect(result.totalPages).toBe(2);
    expect(result.students).toHaveLength(1);
  });

  test('an age filter gives the exact total', async () => {
    await addStudent(ctx, { name: 'صغير', date_of_birth: '2018-01-01' });

    const result = await ctx.invoke('students:get', { minAgeFilter: 18, limit: 2 });

    expect(result.total).toBe(3);
    expect(result.students).toHaveLength(2);
  });
});
