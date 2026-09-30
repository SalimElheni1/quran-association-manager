// tests/validationSchemas.spec.js
// jest.config.js maps 'joi' to a mock for the handler tests; these schemas are checked with
// the real Joi so a wrong rule or message fails here.
jest.mock('joi', () => jest.requireActual('../node_modules/joi/lib/index.js'));

const {
  studentValidationSchema,
  studentPaymentValidationSchema,
  classValidationSchema,
  teacherValidationSchema,
  userValidationSchema,
  userUpdateValidationSchema,
  passwordUpdateValidationSchema,
  transactionValidationSchema,
} = require('../src/main/validationSchemas');

const messageOf = (schema, value) => schema.validate(value).error?.message;
const omit = (obj, key) => {
  const copy = { ...obj };
  delete copy[key];
  return copy;
};

describe('validationSchemas (real Joi)', () => {
  describe('studentValidationSchema', () => {
    it('accepts a student with only a name and keeps extra fields', () => {
      const { error, value } = studentValidationSchema.validate({
        name: 'سارة أحمد',
        parent_name: 'أحمد',
      });
      expect(error).toBeUndefined();
      expect(value.parent_name).toBe('أحمد');
      expect(value.discount_percentage).toBe(0);
    });

    it('requires a name of at least 3 characters', () => {
      expect(messageOf(studentValidationSchema, {})).toBe('الاسم مطلوب');
      expect(messageOf(studentValidationSchema, { name: 'عل' })).toBe(
        'يجب أن يكون الاسم 3 أحرف على الأقل',
      );
    });

    it('checks the phone number, national id and sponsor id are 8 digits', () => {
      expect(messageOf(studentValidationSchema, { name: 'أحمد', contact_info: '1234' })).toBe(
        'رقم الهاتف يجب أن يتكون من 8 أرقام.',
      );
      expect(messageOf(studentValidationSchema, { name: 'أحمد', national_id: '12345' })).toBe(
        'رقم الهوية الوطنية يجب أن يتكون من 8 أرقام.',
      );
      expect(messageOf(studentValidationSchema, { name: 'أحمد', sponsor_cin: 'abc' })).toBe(
        'رقم بطاقة الكافل يجب أن يتكون من 8 أرقام.',
      );
      expect(
        studentValidationSchema.validate({ name: 'أحمد', contact_info: '', national_id: null })
          .error,
      ).toBeUndefined();
    });

    it('rejects a malformed matricule', () => {
      expect(messageOf(studentValidationSchema, { name: 'أحمد', matricule: 'T-0001' })).toBe(
        'الرقم التعريفي للطالب غير صالح.',
      );
      expect(
        studentValidationSchema.validate({ name: 'أحمد', matricule: 'S-0001' }).error,
      ).toBeUndefined();
    });

    it('only accepts the known fee categories and a discount between 0 and 100', () => {
      ['CAN_PAY', 'EXEMPT', 'SPONSORED'].forEach((fee_category) => {
        expect(
          studentValidationSchema.validate({ name: 'أحمد', fee_category }).error,
        ).toBeUndefined();
      });
      expect(
        studentValidationSchema.validate({ name: 'أحمد', fee_category: 'FREE' }).error,
      ).toBeDefined();
      expect(
        studentValidationSchema.validate({ name: 'أحمد', discount_percentage: 101 }).error,
      ).toBeDefined();
    });

    it('turns the ISO birth date into a Date (the minimum-age check reads it)', () => {
      const { value } = studentValidationSchema.validate({
        name: 'أحمد',
        date_of_birth: '2015-03-20',
      });
      expect(value.date_of_birth).toBeInstanceOf(Date);
    });
  });

  describe('studentPaymentValidationSchema', () => {
    const payment = { student_id: 1, amount: 30, payment_method: 'CASH' };

    it('accepts a cash payment', () => {
      expect(studentPaymentValidationSchema.validate(payment).error).toBeUndefined();
    });

    it('requires a positive amount and a known payment method', () => {
      expect(messageOf(studentPaymentValidationSchema, { ...payment, amount: 0 })).toBe(
        'المبلغ يجب أن يكون موجباً',
      );
      expect(
        messageOf(studentPaymentValidationSchema, { ...payment, payment_method: 'CARD' }),
      ).toBe('طريقة الدفع غير صالحة');
    });

    it('requires the check number for a check payment only', () => {
      expect(
        messageOf(studentPaymentValidationSchema, { ...payment, payment_method: 'CHECK' }),
      ).toBe('رقم الشيك مطلوب');
      expect(
        studentPaymentValidationSchema.validate({
          ...payment,
          payment_method: 'CHECK',
          check_number: '123',
        }).error,
      ).toBeUndefined();
    });
  });

  describe('classValidationSchema', () => {
    const cls = { name: 'حلقة الفجر', age_group_id: 2 };

    it('requires an age group (classes take their payment system from it)', () => {
      expect(messageOf(classValidationSchema, { name: 'حلقة الفجر' })).toBe('فئة العمر مطلوبة');
      expect(classValidationSchema.validate(cls).error).toBeUndefined();
    });

    it('requires a positive monthly fee for a special-fee class only', () => {
      expect(messageOf(classValidationSchema, { ...cls, fee_type: 'special' })).toBe(
        'المعلم الشهري مطلوب عند اختيار معلوم خاص',
      );
      expect(
        classValidationSchema.validate({ ...cls, fee_type: 'special', monthly_fee: 15 }).error,
      ).toBeUndefined();
      expect(
        classValidationSchema.validate({ ...cls, fee_type: 'standard', monthly_fee: '' }).error,
      ).toBeUndefined();
    });

    it('only accepts the known class genders and statuses', () => {
      expect(classValidationSchema.validate({ ...cls, gender: 'kids' }).error).toBeUndefined();
      expect(classValidationSchema.validate({ ...cls, gender: 'teens' }).error).toBeDefined();
      expect(classValidationSchema.validate({ ...cls, status: 'archived' }).error).toBeDefined();
    });
  });

  describe('teacherValidationSchema', () => {
    it('requires an 8-digit phone number', () => {
      expect(messageOf(teacherValidationSchema, { name: 'الشيخ علي' })).toBe('رقم الهاتف مطلوب');
      expect(
        messageOf(teacherValidationSchema, { name: 'الشيخ علي', contact_info: '12 34 56 78' }),
      ).toBe('رقم الهاتف يجب أن يتكون من 8 أرقام.');
      expect(
        teacherValidationSchema.validate({ name: 'الشيخ علي', contact_info: '12345678' }).error,
      ).toBeUndefined();
    });
  });

  describe('userValidationSchema', () => {
    const user = {
      username: 'admin2',
      password: 'longenough',
      first_name: 'سالم',
      last_name: 'الحاني',
      roles: ['Administrator'],
      national_id: '12345678',
      phone_number: '98765432',
    };

    it('accepts a user without an employment type and turns the guide on by default', () => {
      const { error, value } = userValidationSchema.validate(user);
      expect(error).toBeUndefined();
      expect(value.need_guide).toBe(true);
      expect(value.current_step).toBe(0);
    });

    it('only accepts the four application roles, at least one', () => {
      ['Superadmin', 'Administrator', 'FinanceManager', 'SessionSupervisor'].forEach((role) => {
        expect(userValidationSchema.validate({ ...user, roles: [role] }).error).toBeUndefined();
      });
      expect(
        userValidationSchema.validate({ ...user, roles: ['Branch Admin'] }).error,
      ).toBeDefined();
      expect(userValidationSchema.validate({ ...user, roles: [] }).error).toBeDefined();
    });

    it('requires a password of 8 characters and the national id', () => {
      expect(messageOf(userValidationSchema, { ...user, password: 'short' })).toBe(
        'كلمة المرور يجب أن تكون 8 أحرف على الأقل',
      );
      expect(messageOf(userValidationSchema, omit(user, 'national_id'))).toBe(
        'رقم الهوية الوطنية (CIN) مطلوب',
      );
    });

    it('rejects usernames with non-alphanumeric characters', () => {
      expect(userValidationSchema.validate({ ...user, username: 'مدير' }).error).toBeDefined();
    });
  });

  describe('userUpdateValidationSchema', () => {
    const update = {
      username: 'admin2',
      first_name: 'سالم',
      last_name: 'الحاني',
      national_id: '12345678',
      phone_number: '98765432',
      status: 'active',
    };

    it('lets the password be left empty and the roles out', () => {
      expect(
        userUpdateValidationSchema.validate({ ...update, password: '' }).error,
      ).toBeUndefined();
    });

    it('requires the account status', () => {
      expect(userUpdateValidationSchema.validate(omit(update, 'status')).error).toBeDefined();
      expect(
        userUpdateValidationSchema.validate({ ...update, status: 'suspended' }).error,
      ).toBeDefined();
    });
  });

  describe('passwordUpdateValidationSchema', () => {
    it('requires the confirmation to match the new password', () => {
      expect(
        messageOf(passwordUpdateValidationSchema, {
          current_password: 'old',
          new_password: 'newpass',
          confirm_new_password: 'other',
        }),
      ).toBe('كلمة المرور الجديدة غير متطابقة');
      expect(
        passwordUpdateValidationSchema.validate({
          current_password: 'old',
          new_password: 'newpass',
          confirm_new_password: 'newpass',
        }).error,
      ).toBeUndefined();
    });

    it('requires a new password of at least 6 characters', () => {
      expect(
        messageOf(passwordUpdateValidationSchema, {
          current_password: 'old',
          new_password: '12345',
          confirm_new_password: '12345',
        }),
      ).toBe('كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل');
    });
  });

  describe('transactionValidationSchema', () => {
    const transaction = {
      type: 'INCOME',
      category: 'التبرعات النقدية',
      amount: 50,
      transaction_date: '2026-09-01',
      payment_method: 'CASH',
      voucher_number: 'V-12',
      account_id: 1,
    };

    it('accepts a cash income with its voucher number', () => {
      expect(transactionValidationSchema.validate(transaction).error).toBeUndefined();
    });

    it('requires the voucher number except for in-kind donations', () => {
      const withoutVoucher = omit(transaction, 'voucher_number');
      expect(messageOf(transactionValidationSchema, withoutVoucher)).toBe('رقم الوصل مطلوب');
      expect(
        transactionValidationSchema.validate({ ...withoutVoucher, category: 'التبرعات العينية' })
          .error,
      ).toBeUndefined();
    });

    it('requires the check number for a check payment', () => {
      expect(
        messageOf(transactionValidationSchema, { ...transaction, payment_method: 'CHECK' }),
      ).toBe('رقم الشيك مطلوب');
    });

    it('only accepts income or expense', () => {
      expect(messageOf(transactionValidationSchema, { ...transaction, type: 'TRANSFER' })).toBe(
        'نوع العملية يجب أن يكون مدخول أو مصروف',
      );
    });
  });
});
