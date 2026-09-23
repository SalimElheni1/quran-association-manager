export const getAcademicYearString = () => {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  return month >= 9 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
};

export const getAcademicYearStringFor = (date) => {
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  return month >= 9 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
};
