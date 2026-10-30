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
