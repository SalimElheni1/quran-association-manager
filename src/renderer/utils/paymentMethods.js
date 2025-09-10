export const paymentMethods = [
  { value: 'Cash', label: 'نقداً' },
  { value: 'Bank Transfer', label: 'تحويل بنكي' },
  { value: 'Online', label: 'عبر الإنترنت' },
  { value: 'Other', label: 'أخرى' },
];

export const getPaymentMethodLabel = (value) => {
  const method = paymentMethods.find((m) => m.value === value);
  return method ? method.label : value;
};
