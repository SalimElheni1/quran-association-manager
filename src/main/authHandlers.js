const Joi = require('joi');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/db');

// This Joi schema is imported from the main index, but it should be defined here or in a shared validation file.
// For now, we redefine it to keep this module self-contained for clarity.
const userValidationSchema = Joi.object({
  username: Joi.string().alphanum().min(3).max(30).required(),
  password: Joi.string().min(8).required(),
  first_name: Joi.string().min(2).max(50).required(),
  last_name: Joi.string().min(2).max(50).required(),
  employment_type: Joi.string().valid('volunteer', 'contract').allow(null, ''),
  role: Joi.string()
    .valid('Superadmin', 'Manager', 'FinanceManager', 'Admin', 'SessionSupervisor')
    .required(),
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

const profileUpdateValidationSchema = userUpdateValidationSchema
  .keys({
    current_password: Joi.string().allow(null, ''),
    new_password: Joi.string().min(8).allow(null, ''),
    confirm_new_password: Joi.any()
      .valid(Joi.ref('new_password'))
      .when('new_password', {
        is: Joi.exist(),
        then: Joi.required(),
      })
      .messages({
        'any.only': 'كلمة المرور الجديدة غير متطابقة',
        'any.required': 'يجب تأكيد كلمة المرور الجديدة',
      }),
  })
  .with('new_password', 'current_password');

const getUserIdFromToken = (token) => {
  if (!token) {
    throw new Error('Authentication token not provided.');
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded.id;
  } catch (error) {
    throw new Error('Invalid or expired authentication token.');
  }
};

const getProfileHandler = async (token) => {
  const userId = getUserIdFromToken(token);
  const userProfile = await db.getQuery(
    'SELECT id, username, first_name, last_name, date_of_birth, national_id, email, phone_number, occupation, civil_status, employment_type, start_date, end_date, role, status, notes, branch_id FROM users WHERE id = ?',
    [userId],
  );
  if (!userProfile) {
    throw new Error('User profile not found.');
  }
  return { success: true, profile: userProfile };
};

const updateProfileHandler = async (token, profileData) => {
  const userId = getUserIdFromToken(token);

  const validatedData = await profileUpdateValidationSchema.validateAsync(profileData, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (validatedData.new_password) {
    const currentUser = await db.getQuery('SELECT password FROM users WHERE id = ?', [userId]);
    if (!currentUser) {
      throw new Error('User not found.');
    }
    const isMatch = await bcrypt.compare(validatedData.current_password, currentUser.password);
    if (!isMatch) {
      throw new Error('كلمة المرور الحالية غير صحيحة.');
    }
    validatedData.password = await bcrypt.hash(validatedData.new_password, 10);
  }

  const fieldsToExclude = [
    'id',
    'username',
    'role',
    'current_password',
    'new_password',
    'confirm_new_password',
  ];
  const fieldsToUpdate = Object.keys(validatedData).filter(
    (field) => !fieldsToExclude.includes(field) && validatedData[field] !== undefined,
  );

  if (fieldsToUpdate.length === 0) {
    return { success: true, message: 'لم يتم تحديث أي بيانات.' };
  }

  const setClauses = fieldsToUpdate.map((field) => `${field} = ?`).join(', ');
  const params = [...fieldsToUpdate.map((field) => validatedData[field] ?? null), userId];

  const sql = `UPDATE users SET ${setClauses} WHERE id = ?`;
  await db.runQuery(sql, params);

  return { success: true, message: 'تم تحديث الملف الشخصي بنجاح.' };
};

module.exports = {
  getProfileHandler,
  updateProfileHandler,
};
