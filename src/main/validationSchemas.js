const Joi = require('joi');

const studentValidationSchema = Joi.object({
  matricule: Joi.string().pattern(/^S-\d{6}$/).messages({
    'string.pattern.base': 'الرقم التعريفي للطالب غير صالح.',
  }),
  name: Joi.string().min(3).max(100).required().messages({
    'string.base': 'الاسم يجب أن يكون نصاً',
    'string.empty': 'الاسم مطلوب',
    'string.min': 'يجب أن يكون الاسم 3 أحرف على الأقل',
    'any.required': 'الاسم مطلوب',
  }),
  status: Joi.string().valid('active', 'inactive', 'graduated', 'on_leave').required(),
  date_of_birth: Joi.date().iso().allow(null, ''),
  gender: Joi.string().valid('Male', 'Female').allow(null, ''),
  email: Joi.string()
    .email({ tlds: { allow: false } })
    .allow(null, ''),
  contact_info: Joi.string()
    .pattern(/^[0-9\s+()-]+$/)
    .allow(null, ''),
  parent_contact: Joi.string()
    .pattern(/^[0-9\s+()-]+$/)
    .allow(null, ''),
}).unknown(true);

const classValidationSchema = Joi.object({
  name: Joi.string().min(3).max(100).required().messages({
    'string.base': 'اسم الفصل يجب أن يكون نصاً',
    'string.empty': 'اسم الفصل مطلوب',
    'string.min': 'يجب أن يكون اسم الفصل 3 أحرف على الأقل',
    'any.required': 'اسم الفصل مطلوب',
  }),
  teacher_id: Joi.number().integer().positive().allow(null, ''),
  status: Joi.string().valid('pending', 'active', 'completed').required(),
  capacity: Joi.number().integer().min(1).allow(null, ''),
  schedule: Joi.string().allow(null, ''),
  gender: Joi.string().valid('women', 'men', 'kids', 'all').default('all'),
  class_type: Joi.string().allow(null, ''),
  start_date: Joi.date().iso().allow(null, ''),
  end_date: Joi.date().iso().allow(null, ''),
}).unknown(true);

const teacherValidationSchema = Joi.object({
  matricule: Joi.string().pattern(/^T-\d{6}$/).messages({
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
    .required()
    .messages({
      'string.email': 'البريد الإلكتروني غير صالح',
      'string.empty': 'البريد الإلكتروني مطلوب',
      'any.required': 'البريد الإلكتروني مطلوب',
    }),
  contact_info: Joi.string()
    .pattern(/^[0-9\s+()-]+$/)
    .allow(null, ''),
}).unknown(true);

const userValidationSchema = Joi.object({
  matricule: Joi.string().pattern(/^U-\d{6}$/).messages({
    'string.pattern.base': 'الرقم التعريفي للمستخدم غير صالح.',
  }),
  username: Joi.string().alphanum().min(3).max(30).required(),
  password: Joi.string().min(8).required(),
  first_name: Joi.string().min(2).max(50).required(),
  last_name: Joi.string().min(2).max(50).required(),
  employment_type: Joi.string().valid('volunteer', 'contract').required(),
  role: Joi.string().valid('Manager', 'FinanceManager', 'Admin', 'SessionSupervisor').required(),
  date_of_birth: Joi.date().iso().allow(null, ''),
  national_id: Joi.string().allow(null, ''),
  email: Joi.string()
    .email({ tlds: { allow: false } })
    .allow(null, ''),
  phone_number: Joi.string()
    .pattern(/^[0-9\s+()-]+$/)
    .allow(null, ''),
  occupation: Joi.string().allow(null, ''),
  civil_status: Joi.string().valid('Single', 'Married', 'Divorced', 'Widowed').allow(null, ''),
  end_date: Joi.date().iso().allow(null, ''),
  notes: Joi.string().allow(null, ''),
  start_date: Joi.when('employment_type', {
    is: 'contract',
    then: Joi.date().iso().required(),
    otherwise: Joi.date().iso().allow(null, ''),
  }),
}).unknown(true);

const userUpdateValidationSchema = userValidationSchema.keys({
  password: Joi.string().min(8).allow(null, ''),
  status: Joi.string().valid('active', 'inactive').required(),
});

module.exports = {
  studentValidationSchema,
  classValidationSchema,
  teacherValidationSchema,
  userValidationSchema,
  userUpdateValidationSchema,
};
