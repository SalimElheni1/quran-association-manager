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
  teacher_id: Joi.number().integer().positive().allow(null, ''),
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
  username: Joi.string().alphanum().min(3).max(30).required(),
  password: Joi.string().min(6).required(),
  first_name: Joi.string().min(2).max(50).required(),
  last_name: Joi.string().min(2).max(50).required(),
  employment_type: Joi.string().valid('volunteer', 'contract'),
  role: Joi.string().valid('Superadmin', 'Manager', 'FinanceManager', 'Admin', 'SessionSupervisor'),
  date_of_birth: Joi.date().iso().allow(null, ''),
  national_id: Joi.string()
    .pattern(/^\d{8}$/)
    .allow(null, '')
    .messages({
      'string.pattern.base': 'رقم الهوية الوطنية يجب أن يتكون من 8 أرقام.',
    }),
  email: Joi.string()
    .email({ tlds: { allow: false } })
    .allow(null, ''),
  phone_number: Joi.string()
    .pattern(/^\d{8}$/)
    .allow(null, '')
    .messages({
      'string.pattern.base': 'رقم الهاتف يجب أن يتكون من 8 أرقام.',
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
  password: Joi.string().min(6).allow(null, ''),
  status: Joi.string().valid('active', 'inactive').required(),
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

module.exports = {
  studentValidationSchema,
  classValidationSchema,
  teacherValidationSchema,
  userValidationSchema,
  userUpdateValidationSchema,
  passwordUpdateValidationSchema,
};
