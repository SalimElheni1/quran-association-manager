
const { generateMatricule } = require('../src/main/matriculeService');
const { getQuery } = require('../src/db/db');

jest.mock('../src/db/db', () => ({
  __esModule: true,
  getQuery: jest.fn(),
}));

describe('Matricule Service', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should generate the first matricule for a student', async () => {
    getQuery.mockResolvedValue({ max_id: 0 });
    const matricule = await generateMatricule('student');
    expect(matricule).toBe('S-000001');
    expect(getQuery).toHaveBeenCalledWith(
      'SELECT COALESCE(MAX(CAST(SUBSTR(matricule, 3) AS INTEGER)), 0) as max_id FROM students WHERE matricule LIKE ?',
      ['S-%']
    );
  });

  it('should generate the next matricule for a teacher', async () => {
    getQuery.mockResolvedValue({ max_id: 10 });
    const matricule = await generateMatricule('teacher');
    expect(matricule).toBe('T-000011');
    expect(getQuery).toHaveBeenCalledWith(
      'SELECT COALESCE(MAX(CAST(SUBSTR(matricule, 3) AS INTEGER)), 0) as max_id FROM teachers WHERE matricule LIKE ?',
      ['T-%']
    );
  });

  it('should generate the first matricule for a user when none exist', async () => {
    getQuery.mockResolvedValue({ max_id: 0 });
    const matricule = await generateMatricule('user');
    expect(matricule).toBe('U-000001');
  });

  it('should generate the next matricule for inventory', async () => {
    getQuery.mockResolvedValue({ max_id: 123 });
    const matricule = await generateMatricule('inventory');
    expect(matricule).toBe('INV-000124');
    expect(getQuery).toHaveBeenCalledWith(
      'SELECT COALESCE(MAX(CAST(SUBSTR(matricule, 5) AS INTEGER)), 0) as max_id FROM inventory_items WHERE matricule LIKE ?',
      ['INV-%']
    );
  });

  it('should throw an error for an invalid entity type', async () => {
    await expect(generateMatricule('invalid-type')).rejects.toThrow(
      'Invalid entity type for matricule generation: invalid-type'
    );
  });

  it('should handle database errors gracefully', async () => {
    const dbError = new Error('DB connection failed');
    getQuery.mockRejectedValue(dbError);

    await expect(generateMatricule('student')).rejects.toThrow('فشل في إنشاء الرقم التعريفي.');
  });
});
