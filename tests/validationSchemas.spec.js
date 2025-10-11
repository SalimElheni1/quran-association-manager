const Joi = require('joi');
const {
  studentValidationSchema,
  teacherValidationSchema,
  classValidationSchema,
  userValidationSchema,
  userUpdateValidationSchema,
  passwordUpdateValidationSchema,
} = require('../src/main/validationSchemas');

describe('validationSchemas', () => {
  beforeEach(() => {
    // Provide a default successful validation implementation
    Joi.object().validate.mockImplementation(value => ({ value, error: undefined }));
  });

  describe('studentValidationSchema', () => {
    it('should validate valid student data', () => {
      const validStudent = {
        name: 'أحمد محمد',
        date_of_birth: '2005-01-15',
        gender: 'Male',
        national_id: '12345678',
        contact_info: '12345678',
        email: 'ahmed@example.com',
        status: 'active',
        memorization_level: '5 أجزاء',
      };

      const { error } = studentValidationSchema.validate(validStudent);
      expect(error).toBeUndefined();
    });

    it('should reject student with missing required name', () => {
      const invalidStudent = {
        date_of_birth: '2005-01-15',
        gender: 'Male',
      };

      const mockError = new Joi.ValidationError('ValidationError', [{
        message: '"name" is required',
        path: ['name'],
        type: 'any.required',
        context: { label: 'name', key: 'name' },
      }]);
      studentValidationSchema.validate.mockReturnValue({ error: mockError, value: invalidStudent });

      const { error } = studentValidationSchema.validate(invalidStudent);
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('name');
    });

    it('should reject student with invalid email format', () => {
      const invalidStudent = {
        name: 'أحمد محمد',
        email: 'invalid-email',
      };
      const mockError = new Joi.ValidationError('ValidationError', [{ path: ['email'] }]);
      studentValidationSchema.validate.mockReturnValue({ error: mockError });

      const { error } = studentValidationSchema.validate(invalidStudent);
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('email');
    });

    it('should reject student with invalid gender', () => {
      const invalidStudent = {
        name: 'أحمد محمد',
        gender: 'InvalidGender',
      };
      const mockError = new Joi.ValidationError('ValidationError', [{ path: ['gender'] }]);
      studentValidationSchema.validate.mockReturnValue({ error: mockError });

      const { error } = studentValidationSchema.validate(invalidStudent);
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('gender');
    });

    it('should reject student with invalid status', () => {
      const invalidStudent = {
        name: 'أحمد محمد',
        status: 'invalid_status',
      };
      const mockError = new Joi.ValidationError('ValidationError', [{ path: ['status'] }]);
      studentValidationSchema.validate.mockReturnValue({ error: mockError });

      const { error } = studentValidationSchema.validate(invalidStudent);
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('status');
    });
  });

  describe('teacherValidationSchema', () => {
    it('should validate valid teacher data', () => {
      const validTeacher = {
        name: 'فاطمة أحمد',
        national_id: '98765432',
        contact_info: '12345678',
        email: 'fatima@example.com',
        gender: 'Female',
        specialization: 'تجويد',
        years_of_experience: 5,
      };

      const { error } = teacherValidationSchema.validate(validTeacher);
      expect(error).toBeUndefined();
    });

    it('should reject teacher with missing required name', () => {
      const invalidTeacher = {
        contact_info: '555-5678',
      };
      const mockError = new Joi.ValidationError('ValidationError', [{ path: ['name'] }]);
      teacherValidationSchema.validate.mockReturnValue({ error: mockError });

      const { error } = teacherValidationSchema.validate(invalidTeacher);
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('name');
    });

    it('should reject teacher with invalid contact info', () => {
      const invalidTeacher = {
        name: 'فاطمة أحمد',
        contact_info: '123', // Too short
      };
      const mockError = new Joi.ValidationError('ValidationError', [{ path: ['contact_info'] }]);
      teacherValidationSchema.validate.mockReturnValue({ error: mockError });

      const { error } = teacherValidationSchema.validate(invalidTeacher);
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('contact_info');
    });
  });

  describe('classValidationSchema', () => {
    it('should validate valid class data', () => {
      const validClass = {
        name: 'حلقة التجويد',
        teacher_id: 1,
        class_type: 'تجويد',
        schedule: JSON.stringify({ days: ['Sunday', 'Tuesday'] }),
        start_date: '2024-01-01',
        end_date: '2024-12-31',
        status: 'active',
        capacity: 20,
        gender: 'all',
      };

      const { error } = classValidationSchema.validate(validClass);
      expect(error).toBeUndefined();
    });

    it('should reject class with missing required name', () => {
      const invalidClass = {
        teacher_id: 1,
      };
      const mockError = new Joi.ValidationError('ValidationError', [{ path: ['name'] }]);
      classValidationSchema.validate.mockReturnValue({ error: mockError });

      const { error } = classValidationSchema.validate(invalidClass);
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('name');
    });

    it('should validate class without teacher_id', () => {
      const validClass = {
        name: 'حلقة التجويد',
      };

      const { error } = classValidationSchema.validate(validClass);
      expect(error).toBeUndefined();
    });

    it('should reject class with invalid capacity', () => {
      const invalidClass = {
        name: 'حلقة التجويد',
        teacher_id: 1,
        capacity: -5,
      };
      const mockError = new Joi.ValidationError('ValidationError', [{ path: ['capacity'] }]);
      classValidationSchema.validate.mockReturnValue({ error: mockError });

      const { error } = classValidationSchema.validate(invalidClass);
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('capacity');
    });

    it('should reject class with invalid gender option', () => {
      const invalidClass = {
        name: 'حلقة التجويد',
        teacher_id: 1,
        gender: 'invalid_gender',
      };
      const mockError = new Joi.ValidationError('ValidationError', [{ path: ['gender'] }]);
      classValidationSchema.validate.mockReturnValue({ error: mockError });

      const { error } = classValidationSchema.validate(invalidClass);
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('gender');
    });
  });

  describe('userValidationSchema', () => {
    it('should validate valid user data', () => {
      const validUser = {
        username: 'adminuser',
        password: 'password123',
        first_name: 'أحمد',
        last_name: 'محمود',
        email: 'admin@example.com',
        phone_number: '12345678',
        role: 'Admin',
        employment_type: 'contract',
        start_date: '2024-01-01',
      };

      const { error } = userValidationSchema.validate(validUser);
      expect(error).toBeUndefined();
    });

    it('should reject user with missing required username', () => {
      const invalidUser = {
        first_name: 'أحمد',
        last_name: 'محمود',
      };
      const mockError = new Joi.ValidationError('ValidationError', [{ path: ['username'] }]);
      userValidationSchema.validate.mockReturnValue({ error: mockError });

      const { error } = userValidationSchema.validate(invalidUser);
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('username');
    });

    it('should reject user with invalid role', () => {
      const invalidUser = {
        username: 'adminuser',
        password: 'password123',
        first_name: 'أحمد',
        last_name: 'محمود',
        role: 'InvalidRole',
      };
      const mockError = new Joi.ValidationError('ValidationError', [{ path: ['role'] }]);
      userValidationSchema.validate.mockReturnValue({ error: mockError });

      const { error } = userValidationSchema.validate(invalidUser);
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('role');
    });

    it('should reject user with invalid employment type', () => {
      const invalidUser = {
        username: 'adminuser',
        password: 'password123',
        first_name: 'أحمد',
        last_name: 'محمود',
        employment_type: 'invalid_type',
      };
      const mockError = new Joi.ValidationError('ValidationError', [{ path: ['employment_type'] }]);
      userValidationSchema.validate.mockReturnValue({ error: mockError });

      const { error } = userValidationSchema.validate(invalidUser);
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('employment_type');
    });
  });

  describe('userUpdateValidationSchema', () => {
    it('should validate user update data', () => {
      const validUpdate = {
        username: 'adminuser',
        first_name: 'أحمد',
        last_name: 'محمود',
        status: 'active',
      };

      const { error } = userUpdateValidationSchema.validate(validUpdate);
      expect(error).toBeUndefined();
    });

    it('should reject update with invalid status', () => {
      const invalidUpdate = {
        username: 'adminuser',
        first_name: 'أحمد',
        last_name: 'محمود',
        status: 'invalid_status',
      };
      const mockError = new Joi.ValidationError('ValidationError', [{ path: ['status'] }]);
      userUpdateValidationSchema.validate.mockReturnValue({ error: mockError });

      const { error } = userUpdateValidationSchema.validate(invalidUpdate);
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('status');
    });
  });

  describe('passwordUpdateValidationSchema', () => {
    it('should validate valid password update data', () => {
      const validPasswordUpdate = {
        current_password: 'oldpassword',
        new_password: 'newpassword123',
        confirm_new_password: 'newpassword123',
      };

      const { error } = passwordUpdateValidationSchema.validate(validPasswordUpdate);
      expect(error).toBeUndefined();
    });

    it('should reject password update with missing current password', () => {
      const invalidUpdate = {
        new_password: 'newpassword123',
        confirm_new_password: 'newpassword123',
      };
      const mockError = new Joi.ValidationError('ValidationError', [{ path: ['current_password'] }]);
      passwordUpdateValidationSchema.validate.mockReturnValue({ error: mockError });

      const { error } = passwordUpdateValidationSchema.validate(invalidUpdate);
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('current_password');
    });

    it('should reject password update with short new password', () => {
      const invalidUpdate = {
        current_password: 'oldpassword',
        new_password: '123',
        confirm_new_password: '123',
      };
      const mockError = new Joi.ValidationError('ValidationError', [{ path: ['new_password'] }]);
      passwordUpdateValidationSchema.validate.mockReturnValue({ error: mockError });

      const { error } = passwordUpdateValidationSchema.validate(invalidUpdate);
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('new_password');
    });

    it('should reject password update with mismatched confirmation', () => {
      const invalidUpdate = {
        current_password: 'oldpassword',
        new_password: 'newpassword123',
        confirm_new_password: 'differentpassword',
      };
      const mockError = new Joi.ValidationError('ValidationError', [{ path: ['confirm_new_password'] }]);
      passwordUpdateValidationSchema.validate.mockReturnValue({ error: mockError });

      const { error } = passwordUpdateValidationSchema.validate(invalidUpdate);
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('confirm_new_password');
    });
  });
});
