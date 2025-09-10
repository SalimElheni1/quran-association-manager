export const categories = [
  { value: 'Electronics', label: 'إلكترونيات' },
  { value: 'Furniture', label: 'أثاث' },
  { value: 'Books', label: 'كتب' },
  { value: 'School Supplies', label: 'أدوات مدرسية' },
  { value: 'Other', label: 'أخرى' },
];

export const getCategoryLabel = (value) => {
  const category = categories.find((cat) => cat.value === value);
  return category ? category.label : value;
};
