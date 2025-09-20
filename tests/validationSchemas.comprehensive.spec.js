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
        matricule: 'S-123456',
        name: 'أحمد محمد علي',
        date_of_birth: '2005-03-15',
        gender: 'Male',
        email: 'ahmed.mohamed@example.com',
        contact_info: '12345678',
        parent_contact: '+216 12 345 678',
        national_id: '12345678',
        status: 'active',
        address: '123 شارع الحبيب بورقيبة، تونس',
        memorization_level: '10 أجزاء',
        notes: 'طالب متميز',
        parent_name: 'محمد علي',
        guardian_relation: 'والد',
        guardian_email: 'parent@example.com',
        emergency_contact_name: 'فاطمة محمد',
        emergency_contact_phone: '87654321',
        health_conditions: 'لا يوجد',
        school_name: 'مدرسة الأمل',
        grade_level: 'السنة الثامنة',
        educational_level: 'ثانوي',
        occupation: 'طالب',
        civil_status: 'Single',
        related_family_members: 'أخت واحدة',
        financial_assistance_notes: 'يحتاج مساعدة مالية',
      };

      const { error } = studentValidationSchema.validate(completeStudent);
      expect(error).toBeUndefined();
    });

    it('should validate student with minimal required fields only', () => {
      const minimalStudent = {
        name: 'سارة أحمد',
      };

      const { error } = studentValidationSchema.validate(minimalStudent);
      expect(error).toBeUndefined();
    });

    it('should reject student with invalid matricule format', () => {
      const invalidMatriculeFormats = [
        'S-12345',    // Too short
        'S-1234567',  // Too long
        'T-123456',   // Wrong prefix
        '123456',     // No prefix
        'S123456',    // No dash
        'S-12345A',   // Contains letter
        'S-',         // Empty number
      ];

      invalidMatriculeFormats.forEach(matricule => {
        const student = { name: 'Test Student', matricule };
        const { error } = studentValidationSchema.validate(student);
        expect(error).toBeDefined();
        expect(error.details[0].path).toContain('matricule');
        expect(error.details[0].message).toContain('الرقم التعريفي للطالب غير صالح');
      });
    });

    it('should reject student with invalid name lengths', () => {
      const invalidNames = [
        '',           // Empty
        'أ',          // Too short (1 char)
        'أح',         // Too short (2 chars)
        'أ'.repeat(101), // Too long (101 chars)
      ];

      invalidNames.forEach(name => {
        const student = { name };
        const { error } = studentValidationSchema.validate(student);
        expect(error).toBeDefined();
        expect(error.details[0].path).toContain('name');
      });
    });

    it('should validate all allowed status values', () => {
      const validStatuses = ['active', 'inactive', 'graduated', 'on_leave'];

      validStatuses.forEach(status => {
        const student = { name: 'Test Student', status };
        const { error } = studentValidationSchema.validate(student);
        expect(error).toBeUndefined();
      });
    });

    it('should reject invalid status values', () => {
      const invalidStatuses = ['pending', 'suspended', 'transferred', 'unknown'];

      invalidStatuses.forEach(status => {
        const student = { name: 'Test Student', status };
        const { error } = studentValidationSchema.validate(student);
        expect(error).toBeDefined();
        expect(error.details[0].path).toContain('status');
      });
    });

    it('should validate various date formats for date_of_birth', () => {
      const validDates = [
        '2005-01-01',
        '1990-12-31',
        '2010-06-15',
      ];

      validDates.forEach(date_of_birth => {
        const student = { name: 'Test Student', date_of_birth };
        const { error } = studentValidationSchema.validate(student);
        expect(error).toBeUndefined();
      });
    });

    it('should reject invalid date formats', () => {
      const invalidDates = [
        '01-01-2005',    // Wrong format
        '2005/01/01',    // Wrong separator
        '2005-13-01',    // Invalid month
        '2005-01-32',    // Invalid day
        'not-a-date',    // Not a date
        '2005-1-1',      // Missing leading zeros
      ];

      invalidDates.forEach(date_of_birth => {
        const student = { name: 'Test Student', date_of_birth };
        const { error } = studentValidationSchema.validate(student);
        expect(error).toBeDefined();
        expect(error.details[0].path).toContain('date_of_birth');
      });
    });

    it('should validate both gender options', () => {
      const validGenders = ['Male', 'Female'];

      validGenders.forEach(gender => {
        const student = { name: 'Test Student', gender };
        const { error } = studentValidationSchema.validate(student);
        expect(error).toBeUndefined();
      });
    });

    it('should validate various email formats', () => {
      const validEmails = [
        'user@example.com',
        'test.email@domain.org',
        'user+tag@example.co.uk',
        'arabic.name@تونس.تن',
        '123@numbers.com',
      ];

      validEmails.forEach(email => {
        const student = { name: 'Test Student', email };
        const { error } = studentValidationSchema.validate(student);
        expect(error).toBeUndefined();
      });
    });

    it('should reject invalid email formats', () => {
      const invalidEmails = [
        'invalid-email',
        '@domain.com',
        'user@',
        'user@domain',
        'user space@domain.com',
        'user..double@domain.com',
      ];

      invalidEmails.forEach(email => {
        const student = { name: 'Test Student', email };
        const { error } = studentValidationSchema.validate(student);
        expect(error).toBeDefined();
        expect(error.details[0].path).toContain('email');
      });
    });

    it('should validate Tunisian phone number format (8 digits)', () => {
      const validPhoneNumbers = [
        '12345678',
        '98765432',
        '20123456',
      ];

      validPhoneNumbers.forEach(contact_info => {
        const student = { name: 'Test Student', contact_info };
        const { error } = studentValidationSchema.validate(student);
        expect(error).toBeUndefined();
      });
    });

    it('should reject invalid phone number formats', () => {
      const invalidPhoneNumbers = [
        '1234567',     // Too short
        '123456789',   // Too long
        '1234567a',    // Contains letter
        '+21612345678', // With country code
        '12 34 56 78', // With spaces
        '12-34-56-78', // With dashes
      ];

      invalidPhoneNumbers.forEach(contact_info => {
        const student = { name: 'Test Student', contact_info };
        const { error } = studentValidationSchema.validate(student);
        expect(error).toBeDefined();
        expect(error.details[0].path).toContain('contact_info');
        expect(error.details[0].message).toContain('8 أرقام');
      });
    });

    it('should validate flexible parent contact formats', () => {
      const validParentContacts = [
        '12345678',
        '+216 12 345 678',
        '(+216) 12-345-678',
        '12 34 56 78',
        '+216-12-345-678',
      ];

      validParentContacts.forEach(parent_contact => {
        const student = { name: 'Test Student', parent_contact };
        const { error } = studentValidationSchema.validate(student);
        expect(error).toBeUndefined();
      });
    });

    it('should validate Tunisian national ID format (8 digits)', () => {
      const validNationalIds = [
        '12345678',
        '98765432',
        '00000000',
        '99999999',
      ];

      validNationalIds.forEach(national_id => {
        const student = { name: 'Test Student', national_id };
        const { error } = studentValidationSchema.validate(student);
        expect(error).toBeUndefined();
      });
    });

    it('should reject invalid national ID formats', () => {
      const invalidNationalIds = [
        '1234567',     // Too short
        '123456789',   // Too long
        '1234567a',    // Contains letter
        '12-34-56-78', // With dashes
        '12 34 56 78', // With spaces
      ];

      invalidNationalIds.forEach(national_id => {
        const student = { name: 'Test Student', national_id };
        const { error } = studentValidationSchema.validate(student);
        expect(error).toBeDefined();
        expect(error.details[0].path).toContain('national_id');
        expect(error.details[0].message).toContain('8 أرقام');
      });
    });

    it('should allow null and empty string values for optional fields', () => {
      const studentWithNulls = {
        name: 'Test Student',
        date_of_birth: null,
        gender: '',
        email: null,
        contact_info: '',
        national_id: null,
        status: 'active',
      };

      const { error } = studentValidationSchema.validate(studentWithNulls);
      expect(error).toBeUndefined();
    });

    it('should handle unknown fields gracefully', () => {
      const studentWithUnknownFields = {
        name: 'Test Student',
        unknown_field: 'some value',
        another_unknown: 123,
      };

      const { error } = studentValidationSchema.validate(studentWithUnknownFields);
      expect(error).toBeUndefined(); // Should pass due to .unknown(true)
    });
  });

  describe('teacherValidationSchema - Advanced Cases', () => {
    it('should validate teacher with all fields', () => {
      const completeTeacher = {
        matricule: 'T-123456',
        name: 'الأستاذ محمد أحمد',
        national_id: '12345678',
        contact_info: '12345678',
        email: 'teacher@example.com',
        address: 'شارع الحرية، تونس',
        date_of_birth: '1980-05-20',
        gender: 'Male',
        educational_level: 'جامعي',
        specialization: 'تجويد وقراءات',
        years_of_experience: 10,
        availability: 'صباحي ومسائي',
        notes: 'معلم متميز',
      };

      const { error } = teacherValidationSchema.validate(completeTeacher);
      expect(error).toBeUndefined();
    });

    it('should validate teacher with minimal required fields', () => {
      const minimalTeacher = {
        name: 'الأستاذة فاطمة',
        contact_info: '12345678',
      };

      const { error } = teacherValidationSchema.validate(minimalTeacher);
      expect(error).toBeUndefined();
    });

    it('should reject teacher with invalid matricule format', () => {
      const invalidMatricules = [
        'S-123456',   // Wrong prefix
        'T-12345',    // Too short
        'T-1234567',  // Too long
        'T123456',    // No dash
        'teacher-123456', // Wrong format
      ];

      invalidMatricules.forEach(matricule => {
        const teacher = { name: 'Test Teacher', contact_info: '12345678', matricule };
        const { error } = teacherValidationSchema.validate(teacher);
        expect(error).toBeDefined();
        expect(error.details[0].path).toContain('matricule');
        expect(error.details[0].message).toContain('الرقم التعريفي للمعلم غير صالح');
      });
    });

    it('should require contact_info field', () => {
      const teacherWithoutContact = {
        name: 'Test Teacher',
        // contact_info missing
      };

      const { error } = teacherValidationSchema.validate(teacherWithoutContact);
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('contact_info');
      expect(error.details[0].message).toContain('مطلوب');
    });

    it('should validate contact_info with 8-digit format', () => {
      const validContacts = ['12345678', '98765432', '20123456'];

      validContacts.forEach(contact_info => {
        const teacher = { name: 'Test Teacher', contact_info };
        const { error } = teacherValidationSchema.validate(teacher);
        expect(error).toBeUndefined();
      });
    });

    it('should reject invalid contact_info formats', () => {
      const invalidContacts = [
        '1234567',     // Too short
        '123456789',   // Too long
        '1234567a',    // Contains letter
        '12-34-56-78', // With dashes
      ];

      invalidContacts.forEach(contact_info => {
        const teacher = { name: 'Test Teacher', contact_info };
        const { error } = teacherValidationSchema.validate(teacher);
        expect(error).toBeDefined();
        expect(error.details[0].path).toContain('contact_info');
      });
    });

    it('should allow unknown fields', () => {
      const teacherWithUnknownFields = {
        name: 'Test Teacher',
        contact_info: '12345678',
        custom_field: 'custom value',
        rating: 5,
      };

      const { error } = teacherValidationSchema.validate(teacherWithUnknownFields);
      expect(error).toBeUndefined();
    });
  });

  describe('classValidationSchema - Advanced Cases', () => {
    it('should validate class with all fields', () => {
      const completeClass = {
        name: 'حلقة التجويد المتقدمة',
        teacher_id: 5,
        class_type: 'تجويد',
        schedule: JSON.stringify({
          days: ['Sunday', 'Tuesday', 'Thursday'],
          time: '09:00-11:00',
          room: 'القاعة الكبرى'
        }),
        start_date: '2024-01-01',
        end_date: '2024-12-31',
        status: 'active',
        capacity: 25,
        gender: 'women',
      };

      const { error } = classValidationSchema.validate(completeClass);
      expect(error).toBeUndefined();
    });

    it('should validate class with minimal required fields', () => {
      const minimalClass = {
        name: 'حلقة أساسية',
      };

      const { error } = classValidationSchema.validate(minimalClass);
      expect(error).toBeUndefined();
    });

    it('should validate all status options', () => {
      const validStatuses = ['pending', 'active', 'completed'];

      validStatuses.forEach(status => {
        const classData = { name: 'Test Class', status };
        const { error } = classValidationSchema.validate(classData);
        expect(error).toBeUndefined();
      });
    });

    it('should reject invalid status values', () => {
      const invalidStatuses = ['inactive', 'cancelled', 'suspended'];

      invalidStatuses.forEach(status => {
        const classData = { name: 'Test Class', status };
        const { error } = classValidationSchema.validate(classData);
        expect(error).toBeDefined();
        expect(error.details[0].path).toContain('status');
      });
    });

    it('should validate all gender options', () => {
      const validGenders = ['women', 'men', 'kids', 'all'];

      validGenders.forEach(gender => {
        const classData = { name: 'Test Class', gender };
        const { error } = classValidationSchema.validate(classData);
        expect(error).toBeUndefined();
      });
    });

    it('should default gender to "all"', () => {
      const classData = { name: 'Test Class' };
      const { error, value } = classValidationSchema.validate(classData);
      expect(error).toBeUndefined();
      expect(value.gender).toBe('all');
    });

    it('should validate positive capacity values', () => {
      const validCapacities = [1, 10, 50, 100];

      validCapacities.forEach(capacity => {
        const classData = { name: 'Test Class', capacity };
        const { error } = classValidationSchema.validate(classData);
        expect(error).toBeUndefined();
      });
    });

    it('should reject invalid capacity values', () => {
      const invalidCapacities = [0, -1, -10, 1.5];

      invalidCapacities.forEach(capacity => {
        const classData = { name: 'Test Class', capacity };
        const { error } = classValidationSchema.validate(classData);
        expect(error).toBeDefined();
        expect(error.details[0].path).toContain('capacity');
      });
    });

    it('should validate positive teacher_id values', () => {
      const validTeacherIds = [1, 5, 100];

      validTeacherIds.forEach(teacher_id => {
        const classData = { name: 'Test Class', teacher_id };
        const { error } = classValidationSchema.validate(classData);
        expect(error).toBeUndefined();
      });
    });

    it('should reject invalid teacher_id values', () => {
      const invalidTeacherIds = [0, -1, 1.5, 'not-a-number'];

      invalidTeacherIds.forEach(teacher_id => {
        const classData = { name: 'Test Class', teacher_id };
        const { error } = classValidationSchema.validate(classData);
        expect(error).toBeDefined();
        expect(error.details[0].path).toContain('teacher_id');
      });
    });

    it('should validate ISO date formats', () => {
      const validDates = ['2024-01-01', '2024-12-31', '2025-06-15'];

      validDates.forEach(date => {
        const classData = { name: 'Test Class', start_date: date, end_date: date };
        const { error } = classValidationSchema.validate(classData);
        expect(error).toBeUndefined();
      });
    });

    it('should allow null values for optional fields', () => {
      const classWithNulls = {
        name: 'Test Class',
        teacher_id: null,
        capacity: null,
        schedule: null,
        start_date: null,
        end_date: null,
      };

      const { error } = classValidationSchema.validate(classWithNulls);
      expect(error).toBeUndefined();
    });
  });

  describe('userValidationSchema - Advanced Cases', () => {
    it('should validate user with all fields', () => {
      const completeUser = {
        matricule: 'U-123456',
        username: 'adminuser123',
        password: 'securepassword123',
        first_name: 'أحمد',
        last_name: 'محمود',
        email: 'admin@example.com',
        phone_number: '12345678',
        role: 'Admin',
        employment_type: 'contract',
        date_of_birth: '1985-03-15',
        national_id: '12345678',
        occupation: 'مدير',
        civil_status: 'Married',
        start_date: '2024-01-01',
        end_date: '2024-12-31',
        notes: 'موظف متميز',
        need_guide: true,
        current_step: 0,
      };

      const { error } = userValidationSchema.validate(completeUser);
      expect(error).toBeUndefined();
    });

    it('should validate user with minimal required fields', () => {
      const minimalUser = {
        username: 'minimaluser',
        password: 'password123',
        first_name: 'أحمد',
        last_name: 'محمد',
      };

      const { error } = userValidationSchema.validate(minimalUser);
      expect(error).toBeUndefined();
    });

    it('should validate all role options', () => {
      const validRoles = ['Superadmin', 'Manager', 'FinanceManager', 'Admin', 'SessionSupervisor'];

      validRoles.forEach(role => {
        const user = {
          username: 'testuser',
          password: 'password123',
          first_name: 'Test',
          last_name: 'User',
          role
        };
        const { error } = userValidationSchema.validate(user);
        expect(error).toBeUndefined();
      });
    });

    it('should reject invalid role values', () => {
      const invalidRoles = ['User', 'Guest', 'Moderator', 'Owner'];

      invalidRoles.forEach(role => {
        const user = {
          username: 'testuser',
          password: 'password123',
          first_name: 'Test',
          last_name: 'User',
          role
        };
        const { error } = userValidationSchema.validate(user);
        expect(error).toBeDefined();
        expect(error.details[0].path).toContain('role');
      });
    });

    it('should validate employment type options', () => {
      const validEmploymentTypes = ['volunteer', 'contract'];

      validEmploymentTypes.forEach(employment_type => {
        const user = {
          username: 'testuser',
          password: 'password123',
          first_name: 'Test',
          last_name: 'User',
          employment_type
        };
        const { error } = userValidationSchema.validate(user);
        expect(error).toBeUndefined();
      });
    });

    it('should validate civil status options', () => {
      const validCivilStatuses = ['Single', 'Married', 'Divorced', 'Widowed'];

      validCivilStatuses.forEach(civil_status => {
        const user = {
          username: 'testuser',
          password: 'password123',
          first_name: 'Test',
          last_name: 'User',
          civil_status
        };
        const { error } = userValidationSchema.validate(user);
        expect(error).toBeUndefined();
      });
    });

    it('should validate username format (alphanumeric)', () => {
      const validUsernames = ['user123', 'admin', 'test123user', 'a1b2c3'];

      validUsernames.forEach(username => {
        const user = {
          username,
          password: 'password123',
          first_name: 'Test',
          last_name: 'User',
        };
        const { error } = userValidationSchema.validate(user);
        expect(error).toBeUndefined();
      });
    });

    it('should reject invalid username formats', () => {
      const invalidUsernames = [
        'user-name',    // Contains dash
        'user.name',    // Contains dot
        'user name',    // Contains space
        'user@name',    // Contains special char
        'us',           // Too short
        'a'.repeat(31), // Too long
      ];

      invalidUsernames.forEach(username => {
        const user = {
          username,
          password: 'password123',
          first_name: 'Test',
          last_name: 'User',
        };
        const { error } = userValidationSchema.validate(user);
        expect(error).toBeDefined();
        expect(error.details[0].path).toContain('username');
      });
    });

    it('should validate password length requirements', () => {
      const validPasswords = ['123456', 'password', 'verylongpassword123'];

      validPasswords.forEach(password => {
        const user = {
          username: 'testuser',
          password,
          first_name: 'Test',
          last_name: 'User',
        };
        const { error } = userValidationSchema.validate(user);
        expect(error).toBeUndefined();
      });
    });

    it('should reject short passwords', () => {
      const shortPasswords = ['', '1', '12', '123', '1234', '12345'];

      shortPasswords.forEach(password => {
        const user = {
          username: 'testuser',
          password,
          first_name: 'Test',
          last_name: 'User',
        };
        const { error } = userValidationSchema.validate(user);
        expect(error).toBeDefined();
        expect(error.details[0].path).toContain('password');
      });
    });

    it('should validate name length requirements', () => {
      const validNames = ['أح', 'أحمد', 'محمد عبد الرحمن الطويل'];

      validNames.forEach(name => {
        const user = {
          username: 'testuser',
          password: 'password123',
          first_name: name,
          last_name: name,
        };
        const { error } = userValidationSchema.validate(user);
        expect(error).toBeUndefined();
      });
    });

    it('should reject invalid name lengths', () => {
      const invalidNames = ['', 'أ', 'a'.repeat(51)];

      invalidNames.forEach(name => {
        const user = {
          username: 'testuser',
          password: 'password123',
          first_name: name,
          last_name: 'Valid',
        };
        const { error } = userValidationSchema.validate(user);
        expect(error).toBeDefined();
        expect(error.details[0].path).toContain('first_name');
      });
    });

    it('should validate need_guide as boolean or number', () => {
      const validNeedGuideValues = [true, false, 0, 1];

      validNeedGuideValues.forEach(need_guide => {
        const user = {
          username: 'testuser',
          password: 'password123',
          first_name: 'Test',
          last_name: 'User',
          need_guide,
        };
        const { error } = userValidationSchema.validate(user);
        expect(error).toBeUndefined();
      });
    });

    it('should reject invalid need_guide values', () => {
      const invalidNeedGuideValues = [2, -1, 'true', 'false'];

      invalidNeedGuideValues.forEach(need_guide => {
        const user = {
          username: 'testuser',
          password: 'password123',
          first_name: 'Test',
          last_name: 'User',
          need_guide,
        };
        const { error } = userValidationSchema.validate(user);
        expect(error).toBeDefined();
        expect(error.details[0].path).toContain('need_guide');
      });
    });

    it('should validate current_step as non-negative integer', () => {
      const validSteps = [0, 1, 5, 10];

      validSteps.forEach(current_step => {
        const user = {
          username: 'testuser',
          password: 'password123',
          first_name: 'Test',
          last_name: 'User',
          current_step,
        };
        const { error } = userValidationSchema.validate(user);
        expect(error).toBeUndefined();
      });
    });

    it('should reject invalid current_step values', () => {
      const invalidSteps = [-1, -5, 1.5, 'step'];

      invalidSteps.forEach(current_step => {
        const user = {
          username: 'testuser',
          password: 'password123',
          first_name: 'Test',
          last_name: 'User',
          current_step,
        };
        const { error } = userValidationSchema.validate(user);
        expect(error).toBeDefined();
        expect(error.details[0].path).toContain('current_step');
      });
    });

    it('should set default values correctly', () => {
      const user = {
        username: 'testuser',
        password: 'password123',
        first_name: 'Test',
        last_name: 'User',
      };

      const { error, value } = userValidationSchema.validate(user);
      expect(error).toBeUndefined();
      expect(value.need_guide).toBe(true);
      expect(value.current_step).toBe(0);
    });
  });

  describe('userUpdateValidationSchema - Advanced Cases', () => {
    it('should allow password to be null or empty for updates', () => {
      const updateData = {
        username: 'updateduser',
        first_name: 'Updated',
        last_name: 'User',
        status: 'active',
        password: null,
      };

      const { error } = userUpdateValidationSchema.validate(updateData);
      expect(error).toBeUndefined();
    });

    it('should require status field', () => {
      const updateData = {
        username: 'updateduser',
        first_name: 'Updated',
        last_name: 'User',
        // status missing
      };

      const { error } = userUpdateValidationSchema.validate(updateData);
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('status');
    });

    it('should validate status options', () => {
      const validStatuses = ['active', 'inactive'];

      validStatuses.forEach(status => {
        const updateData = {
          username: 'testuser',
          first_name: 'Test',
          last_name: 'User',
          status,
        };
        const { error } = userUpdateValidationSchema.validate(updateData);
        expect(error).toBeUndefined();
      });
    });

    it('should reject invalid status values', () => {
      const invalidStatuses = ['pending', 'suspended', 'deleted'];

      invalidStatuses.forEach(status => {
        const updateData = {
          username: 'testuser',
          first_name: 'Test',
          last_name: 'User',
          status,
        };
        const { error } = userUpdateValidationSchema.validate(updateData);
        expect(error).toBeDefined();
        expect(error.details[0].path).toContain('status');
      });
    });

    it('should validate password length when provided', () => {
      const updateData = {
        username: 'testuser',
        first_name: 'Test',
        last_name: 'User',
        status: 'active',
        password: 'newpassword123',
      };

      const { error } = userUpdateValidationSchema.validate(updateData);
      expect(error).toBeUndefined();
    });

    it('should reject short passwords when provided', () => {
      const updateData = {
        username: 'testuser',
        first_name: 'Test',
        last_name: 'User',
        status: 'active',
        password: '123', // Too short
      };

      const { error } = userUpdateValidationSchema.validate(updateData);
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('password');
    });
  });

  describe('passwordUpdateValidationSchema - Advanced Cases', () => {
    it('should validate correct password update data', () => {
      const passwordUpdate = {
        current_password: 'oldpassword123',
        new_password: 'newpassword456',
        confirm_new_password: 'newpassword456',
      };

      const { error } = passwordUpdateValidationSchema.validate(passwordUpdate);
      expect(error).toBeUndefined();
    });

    it('should require all three password fields', () => {
      const requiredFields = ['current_password', 'new_password', 'confirm_new_password'];

      requiredFields.forEach(missingField => {
        const passwordUpdate = {
          current_password: 'oldpassword',
          new_password: 'newpassword123',
          confirm_new_password: 'newpassword123',
        };
        delete passwordUpdate[missingField];

        const { error } = passwordUpdateValidationSchema.validate(passwordUpdate);
        expect(error).toBeDefined();
        expect(error.details[0].path).toContain(missingField);
        expect(error.details[0].message).toContain('مطلوب');
      });
    });

    it('should validate new password length', () => {
      const validNewPasswords = ['123456', 'password', 'verylongpassword123'];

      validNewPasswords.forEach(new_password => {
        const passwordUpdate = {
          current_password: 'oldpassword',
          new_password,
          confirm_new_password: new_password,
        };

        const { error } = passwordUpdateValidationSchema.validate(passwordUpdate);
        expect(error).toBeUndefined();
      });
    });

    it('should reject short new passwords', () => {
      const shortPasswords = ['', '1', '12', '123', '1234', '12345'];

      shortPasswords.forEach(new_password => {
        const passwordUpdate = {
          current_password: 'oldpassword',
          new_password,
          confirm_new_password: new_password,
        };

        const { error } = passwordUpdateValidationSchema.validate(passwordUpdate);
        expect(error).toBeDefined();
        expect(error.details[0].path).toContain('new_password');
        expect(error.details[0].message).toContain('6 أحرف على الأقل');
      });
    });

    it('should require password confirmation to match', () => {
      const passwordUpdate = {
        current_password: 'oldpassword',
        new_password: 'newpassword123',
        confirm_new_password: 'differentpassword456',
      };

      const { error } = passwordUpdateValidationSchema.validate(passwordUpdate);
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('confirm_new_password');
      expect(error.details[0].message).toContain('غير متطابقة');
    });

    it('should handle empty string passwords', () => {
      const passwordUpdate = {
        current_password: '',
        new_password: 'newpassword123',
        confirm_new_password: 'newpassword123',
      };

      const { error } = passwordUpdateValidationSchema.validate(passwordUpdate);
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('current_password');
      expect(error.details[0].message).toContain('مطلوبة');
    });

    it('should handle whitespace-only passwords', () => {
      const passwordUpdate = {
        current_password: '   ',
        new_password: 'newpassword123',
        confirm_new_password: 'newpassword123',
      };

      const { error } = passwordUpdateValidationSchema.validate(passwordUpdate);
      expect(error).toBeDefined();
      expect(error.details[0].path).toContain('current_password');
    });

    it('should validate complex password scenarios', () => {
      const complexScenarios = [
        {
          current_password: 'أكلمة مرور عربية',
          new_password: 'كلمة مرور جديدة',
          confirm_new_password: 'كلمة مرور جديدة',
        },
        {
          current_password: 'password123!@#',
          new_password: 'newPassword456$%^',
          confirm_new_password: 'newPassword456$%^',
        },
        {
          current_password: 'very_long_password_with_underscores_123',
          new_password: 'another-very-long-password-with-dashes-456',
          confirm_new_password: 'another-very-long-password-with-dashes-456',
        },
      ];

      complexScenarios.forEach(passwordUpdate => {
        const { error } = passwordUpdateValidationSchema.validate(passwordUpdate);
        expect(error).toBeUndefined();
      });
    });
  });

  describe('Schema Integration and Edge Cases', () => {
    it('should handle validation with custom error messages in Arabic', () => {
      const invalidStudent = { name: '' };
      const { error } = studentValidationSchema.validate(invalidStudent);
      
      expect(error).toBeDefined();
      expect(error.details[0].message).toContain('الاسم مطلوب');
    });

    it('should handle validation with mixed language content', () => {
      const mixedStudent = {
        name: 'Ahmed أحمد',
        email: 'ahmed@example.com',
        notes: 'Mixed content: English and عربي',
      };

      const { error } = studentValidationSchema.validate(mixedStudent);
      expect(error).toBeUndefined();
    });

    it('should handle very large valid inputs', () => {
      const largeValidInputs = {
        name: 'أ'.repeat(100), // Max length
        notes: 'ملاحظة طويلة جداً '.repeat(50),
        address: 'عنوان طويل جداً '.repeat(20),
      };

      const { error } = studentValidationSchema.validate(largeValidInputs);
      expect(error).toBeUndefined();
    });

    it('should handle boundary values correctly', () => {
      const boundaryValues = {
        name: 'أحم', // Exactly 3 characters (minimum)
        contact_info: '12345678', // Exactly 8 digits
        national_id: '00000000', // All zeros but valid format
      };

      const { error } = studentValidationSchema.validate(boundaryValues);
      expect(error).toBeUndefined();
    });

    it('should preserve original data structure in validation result', () => {
      const originalData = {
        name: 'Test Student',
        custom_field: 'custom_value',
        nested_object: { key: 'value' },
      };

      const { error, value } = studentValidationSchema.validate(originalData);
      expect(error).toBeUndefined();
      expect(value).toEqual(expect.objectContaining(originalData));
    });
  });
});