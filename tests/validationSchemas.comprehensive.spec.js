const Joi = require('joi');
const {
  studentValidationSchema,
  teacherValidationSchema,
  classValidationSchema,
  userValidationSchema,
  userUpdateValidationSchema,
  passwordUpdateValidationSchema,
} = require('../src/main/validationSchemas');

describe('validationSchemas - Comprehensive Tests', () => {
  describe('studentValidationSchema - Advanced Cases', () => {
    it('should validate student with all optional fields', () => {
      const completeStudent = {
        name: 'أحمد محمد',
        date_of_birth: '2005-01-15',
        gender: 'Male',
        address: '123 Main St',
        contact_info: '12345678',
        email: 'ahmed@example.com',
        enrollment_date: new Date().toISOString(),
        status: 'active',
        branch_id: 1,
        memorization_level: '5 أجزاء',
        notes: 'Some notes',
        parent_name: 'محمد',
        guardian_relation: 'الأب',
        parent_contact: '87654321',
        guardian_email: 'parent@example.com',
        emergency_contact_name: 'Jane Doe',
        emergency_contact_phone: '11223344',
        health_conditions: 'None',
        national_id: '12345678',
        school_name: 'High School',
        grade_level: '10',
        educational_level: 'Secondary',
        occupation: 'Student',
        civil_status: 'Single',
        related_family_members: 'None',
        financial_assistance_notes: 'None',
      };
      const { error } = studentValidationSchema.validate(completeStudent);
      expect(error).toBeUndefined();
    });

    it('should reject student with invalid matricule format', () => {
        const invalidMatriculeFormats = ['S-12345', 'S-1234567', 'T-123456', '123456'];
        invalidMatriculeFormats.forEach(matricule => {
            const student = { name: 'Test Student', matricule };
            const { error } = studentValidationSchema.validate(student);
            expect(error).toBeDefined();
            expect(error.details[0].path).toContain('matricule');
        });
    });
  });

  describe('userValidationSchema - Advanced Cases', () => {
    it('should validate user with all fields', () => {
        const completeUser = {
            username: 'testuser',
            password: 'password123',
            first_name: 'Test',
            last_name: 'User',
            date_of_birth: '1990-01-01',
            national_id: '12345678',
            email: 'test@example.com',
            phone_number: '12345678',
            occupation: 'Tester',
            civil_status: 'Married',
            employment_type: 'contract',
            start_date: '2023-01-01',
            end_date: '2024-01-01',
            roles: ['Administrator'],
            status: 'active',
            notes: 'Test notes',
            need_guide: false,
            current_step: 1,
          };
          const { error } = userValidationSchema.validate(completeUser);
          expect(error).toBeUndefined();
    });

    it('should validate user with minimal required fields', () => {
        const minimalUser = {
            username: 'miniuser',
            password: 'password123',
            first_name: 'Minimal',
            last_name: 'User',
            roles: ['FinanceManager'],
          };
          const { error } = userValidationSchema.validate(minimalUser);
          expect(error).toBeUndefined();
    });

    it('should validate all role options', () => {
        const roles = ['Superadmin', 'Administrator', 'FinanceManager', 'SessionSupervisor'];
        roles.forEach(role => {
            const user = {
                username: `user${role}`,
                password: 'password123',
                first_name: 'Test',
                last_name: 'User',
                roles: [role],
            };
            const { error } = userValidationSchema.validate(user);
            expect(error).toBeUndefined();
        });
    });

    it('should reject invalid role values', () => {
        const invalidRoles = ['Admin', 'Manager', 'Guest', 123];
        invalidRoles.forEach(role => {
            const user = {
                username: 'invalidroleuser',
                password: 'password123',
                first_name: 'Test',
                last_name: 'User',
                roles: [role],
            };
            const { error } = userValidationSchema.validate(user);
            expect(error).toBeDefined();
            expect(error.details[0].path).toContain('roles');
        });
    });
  });
});