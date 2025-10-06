const Joi = require('joi');

const studentValidationSchema = Joi.object({
  matricule: Joi.string()
    .pattern(/^S-\d{6}$/)
    .messages({
      'string.pattern.base': 'الرقم التعريفي للطالب غير صالح.',
    }),
  name: Joi.string().min(3).max(100).required().messages({
    'string.base': 'الاسم يجب أن يكون نصاً',
    'string.empty': 'الاسم مطلوب',
    'string.min': 'يجب أن يكون الاسم 3 أحرف على الأقل',
    'any.required': 'الاسم مطلوب',
  }),
  status: Joi.string().valid('active', 'inactive', 'graduated', 'on_leave'),
  date_of_birth: Joi.date().iso().allow(null, ''),
  gender: Joi.string().valid('Male', 'Female').allow(null, ''),
  email: Joi.string()
    .email({ tlds: { allow: false } })
    .allow(null, ''),
  contact_info: Joi.string()
    .pattern(/^\d{8}$/)
    .allow(null, '')
    .messages({
      'string.pattern.base': 'رقم الهاتف يجب أن يتكون من 8 أرقام.',
    }),
  parent_contact: Joi.string()
    .pattern(/^[0-9\s+()-]+$/)
    .allow(null, ''),
  national_id: Joi.string()
    .pattern(/^\d{8}$/)
    .allow(null, '')
    .messages({
      'string.pattern.base': 'رقم الهوية الوطنية يجب أن يتكون من 8 أرقام.',
    }),
}).unknown(true);

const classValidationSchema = Joi.object({
  name: Joi.string().min(3).max(100).required().messages({
    'string.base': 'اسم الفصل يجب أن يكون نصاً',
    'string.empty': 'اسم الفصل مطلوب',
    'string.min': 'يجب أن يكون اسم الفصل 3 أحرف على الأقل',
    'any.required': 'اسم الفصل مطلوب',
  }),
  teacher_id: Joi.number().integer().positive().allow(null),
  status: Joi.string().valid('pending', 'active', 'completed'),
  capacity: Joi.number().integer().min(1).allow(null, ''),
  schedule: Joi.string().allow(null, ''),
  gender: Joi.string().valid('women', 'men', 'kids', 'all').default('all'),
  class_type: Joi.string().allow(null, ''),
  start_date: Joi.date().iso().allow(null, ''),
  end_date: Joi.date().iso().allow(null, ''),
}).unknown(true);

const teacherValidationSchema = Joi.object({
  matricule: Joi.string()
    .pattern(/^T-\d{6}$/)
    .messages({
      'string.pattern.base': 'الرقم التعريفي للمعلم غير صالح.',
    }),
  name: Joi.string().min(3).max(100).required().messages({
    'string.base': 'الاسم يجب أن يكون نصاً',
    'string.empty': 'الاسم مطلوب',
    'string.min': 'يجب أن يكون الاسم 3 أحرف على الأقل',
    'any.required': 'الاسم مطلوب',
  }),
  email: Joi.string()
    .email({ tlds: { allow: false } })
    .allow(null, ''),
  contact_info: Joi.string()
    .pattern(/^\d{8}$/)
    .required()
    .messages({
      'string.pattern.base': 'رقم الهاتف يجب أن يتكون من 8 أرقام.',
      'string.empty': 'رقم الهاتف مطلوب',
      'any.required': 'رقم الهاتف مطلوب',
    }),
}).unknown(true);

const userValidationSchema = Joi.object({
  matricule: Joi.string()
    .pattern(/^U-\d{6}$/)
    .messages({
      'string.pattern.base': 'الرقم التعريفي للمستخدم غير صالح.',
    }),
  username: Joi.string().alphanum().min(3).max(30).required().messages({
    'string.empty': 'اسم المستخدم مطلوب',
    'any.required': 'اسم المستخدم مطلوب',
  }),
  password: Joi.string().min(8).required().messages({
    'string.min': 'كلمة المرور يجب أن تكون 8 أحرف على الأقل',
    'string.empty': 'كلمة المرور مطلوبة',
    'any.required': 'كلمة المرور مطلوبة',
  }),
  first_name: Joi.string().min(2).max(50).required().messages({
    'string.empty': 'الاسم الأول مطلوب',
    'any.required': 'الاسم الأول مطلوب',
  }),
  last_name: Joi.string().min(2).max(50).required().messages({
    'string.empty': 'اللقب مطلوب',
    'any.required': 'اللقب مطلوب',
  }),
  employment_type: Joi.string().valid('volunteer', 'contract'),
  roles: Joi.array().items(Joi.string().valid('Superadmin', 'Administrator', 'FinanceManager', 'SessionSupervisor')).min(1).required(),
  date_of_birth: Joi.date().iso().allow(null, ''),
  national_id: Joi.string()
    .pattern(/^\d{8}$/)
    .required()
    .messages({
      'string.pattern.base': 'رقم الهوية الوطنية يجب أن يتكون من 8 أرقام.',
      'string.empty': 'رقم ب.ت.و مطلوب',
      'any.required': 'رقم ب.ت.و مطلوب',
    }),
  email: Joi.string()
    .email({ tlds: { allow: false } })
    .allow(null, ''),
  phone_number: Joi.string()
    .pattern(/^\d{8}$/)
    .required()
    .messages({
      'string.pattern.base': 'رقم الهاتف يجب أن يتكون من 8 أرقام.',
      'string.empty': 'رقم الهاتف مطلوب',
      'any.required': 'رقم الهاتف مطلوب',
    }),
  occupation: Joi.string().allow(null, ''),
  civil_status: Joi.string().valid('Single', 'Married', 'Divorced', 'Widowed').allow(null, ''),
  end_date: Joi.date().iso().allow(null, ''),
  notes: Joi.string().allow(null, ''),
  start_date: Joi.date().iso().allow(null, ''),
  need_guide: Joi.alternatives()
    .try(Joi.boolean(), Joi.number().integer().valid(0, 1))
    .default(true),
  current_step: Joi.number().integer().min(0).default(0),
}).unknown(true);

const userUpdateValidationSchema = userValidationSchema.keys({
  password: Joi.string().min(8).allow(null, '').messages({
    'string.min': 'كلمة المرور يجب أن تكون 8 أحرف على الأقل',
  }),
  status: Joi.string().valid('active', 'inactive').required(),
  roles: Joi.array().items(Joi.string().valid('Superadmin', 'Administrator', 'FinanceManager', 'SessionSupervisor')).min(1),
});

const passwordUpdateValidationSchema = Joi.object({
  current_password: Joi.string().required().messages({
    'string.empty': 'كلمة المرور الحالية مطلوبة',
    'any.required': 'كلمة المرور الحالية مطلوبة',
  }),
  new_password: Joi.string().min(6).required().messages({
    'string.min': 'كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل',
    'string.empty': 'كلمة المرور الجديدة مطلوبة',
    'any.required': 'كلمة المرور الجديدة مطلوبة',
  }),
  confirm_new_password: Joi.any().valid(Joi.ref('new_password')).required().messages({
    'any.only': 'كلمة المرور الجديدة غير متطابقة',
    'any.required': 'يجب تأكيد كلمة المرور الجديدة',
  }),
});

const transactionValidationSchema = Joi.object({
  type: Joi.string().valid('INCOME', 'EXPENSE').required().messages({
    'any.only': 'نوع العملية يجب أن يكون مدخول أو مصروف',
    'any.required': 'نوع العملية مطلوب',
  }),
  category: Joi.string().required().messages({
    'string.empty': 'الفئة مطلوبة',
    'any.required': 'الفئة مطلوبة',
  }),
  amount: Joi.number().positive().required().messages({
    'number.base': 'المبلغ يجب أن يكون رقماً',
    'number.positive': 'المبلغ يجب أن يكون موجباً',
    'any.required': 'المبلغ مطلوب',
  }),
  transaction_date: Joi.date().iso().required().messages({
    'date.base': 'التاريخ غير صالح',
    'any.required': 'التاريخ مطلوب',
  }),
  description: Joi.string().allow(null, ''),
  payment_method: Joi.string().valid('CASH', 'CHECK', 'TRANSFER').required().messages({
    'any.only': 'طريقة الدفع غير صالحة',
    'any.required': 'طريقة الدفع مطلوبة',
  }),
  check_number: Joi.string().when('payment_method', {
    is: 'CHECK',
    then: Joi.required().messages({
      'any.required': 'رقم الشيك مطلوب',
    }),
    otherwise: Joi.optional().allow(null, ''),
  }),
  account_id: Joi.number().integer().positive().required().messages({
    'number.base': 'الحساب غير صالح',
    'any.required': 'الحساب مطلوب',
  }),
  related_person_name: Joi.string().allow(null, ''),
  related_entity_type: Joi.string().valid('Student', 'Teacher', 'Donor', 'Supplier').allow(null, ''),
  related_entity_id: Joi.number().integer().positive().allow(null),
}).unknown(true);

module.exports = {
  studentValidationSchema,
  classValidationSchema,
  teacherValidationSchema,
  userValidationSchema,
  userUpdateValidationSchema,
  passwordUpdateValidationSchema,
  transactionValidationSchema,
};
