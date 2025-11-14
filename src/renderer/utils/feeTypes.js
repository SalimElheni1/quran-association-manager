export const feeTypes = [
  { value: 'ANNUAL', label: 'رسوم سنوية' },
  { value: 'MONTHLY', label: 'رسوم شهرية' },
  { value: 'CLASS', label: 'رسوم فصل خاص' },
  { value: 'OTHER', label: 'رسوم أخرى' },
  { value: 'CREDIT', label: 'رصيد زائد' },
];

export const getFeeTypeLabel = (value) => {
  const type = feeTypes.find((t) => t.value === value);
  return type ? type.label : value;
};

export const feeStatuses = [
  { value: 'PAID', label: 'مدفوع' },
  { value: 'PARTIALLY_PAID', label: 'جزئياً مدفوع' },
  { value: 'UNPAID', label: 'غير مدفوع' },
];

export const getFeeStatusLabel = (value) => {
  const status = feeStatuses.find((s) => s.value === value);
  return status ? status.label : value;
};
