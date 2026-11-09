// Mock dependencies
jest.mock('fs');
jest.mock('path');
jest.mock('os');
jest.mock('electron', () => ({
  BrowserWindow: jest.fn(),
  app: {
    getPath: jest.fn(() => '/mock/userData'),
  },
}));
jest.mock('exceljs');
jest.mock('docx');
jest.mock('../src/db/db');
jest.mock('../src/main/settingsManager');

const ExcelJS = require('exceljs');
const {
  getExportHeaderData,
  fetchExportData,
  localizeData,
  generateXlsx,
} = require('../src/main/exportManager');
const { getSetting } = require('../src/main/settingsManager');
const { allQuery } = require('../src/db/db');

describe('exportManager', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getExportHeaderData', () => {
    it('should fetch and return header data from settings', async () => {
      getSetting
        .mockResolvedValueOnce('National Association')
        .mockResolvedValueOnce('Regional Association')
        .mockResolvedValueOnce('Local Branch')
        .mockResolvedValueOnce('/path/to/national/logo.png')
        .mockResolvedValueOnce('/path/to/regional/logo.png');

      const result = await getExportHeaderData();

      expect(getSetting).toHaveBeenCalledTimes(5);
      expect(getSetting).toHaveBeenCalledWith('national_association_name');
      expect(getSetting).toHaveBeenCalledWith('regional_association_name');
      expect(getSetting).toHaveBeenCalledWith('local_branch_name');
      expect(getSetting).toHaveBeenCalledWith('national_logo_path');
      expect(getSetting).toHaveBeenCalledWith('regional_local_logo_path');

      expect(result).toEqual({
        nationalAssociationName: 'National Association',
        regionalAssociationName: 'Regional Association',
        localBranchName: 'Local Branch',
        nationalLogoPath: '/path/to/national/logo.png',
        regionalLocalLogoPath: '/path/to/regional/logo.png',
      });
    });
  });

  describe('fetchExportData', () => {
    it('should throw error when no fields provided', async () => {
      await expect(fetchExportData({ type: 'students', fields: [] })).rejects.toThrow(
        'No fields selected for export.',
      );
    });

    // PRAGMA table_info answers with these columns; the data query answers with `rows`.
    const mockTable = (columns, rows = []) =>
      allQuery.mockImplementation((sql) =>
        Promise.resolve(sql.startsWith('PRAGMA') ? columns.map((name) => ({ name })) : rows),
      );
    const dataQuery = () => allQuery.mock.calls.find(([sql]) => !sql.startsWith('PRAGMA'));

    it('exports students that are not deleted, only with columns that exist', async () => {
      mockTable(['name', 'gender'], [{ name: 'Ali', date_of_birth: Date.UTC(2015, 0, 2) }]);

      const result = await fetchExportData({
        type: 'students',
        fields: ['name', 'gender', 'sponsor_cin'],
      });

      expect(dataQuery()).toEqual([
        'SELECT name, gender FROM students s WHERE s.deleted_at IS NULL ORDER BY s.name',
        [],
      ]);
      // Timestamps are exported as dates.
      expect(result).toEqual([{ name: 'Ali', date_of_birth: '2015-01-02' }]);
    });

    it('exports the students of one group', async () => {
      mockTable(['name']);

      await fetchExportData({ type: 'students', fields: ['name'], options: { groupId: 3 } });

      expect(dataQuery()).toEqual([
        expect.stringContaining(
          'JOIN student_groups sg ON s.id = sg.student_id WHERE sg.group_id = ?',
        ),
        [3],
      ]);
    });

    it('refuses a student export when no selected column exists', async () => {
      mockTable(['name']);

      await expect(fetchExportData({ type: 'students', fields: ['sponsor_cin'] })).rejects.toThrow(
        'No valid student fields available for export after validating against DB columns.',
      );
    });

    it('exports teachers that are not deleted, filtered by gender', async () => {
      mockTable(['name', 'email']);

      await fetchExportData({
        type: 'teachers',
        fields: ['name', 'email'],
        options: { gender: 'men' },
      });

      expect(dataQuery()).toEqual([
        'SELECT name, email FROM teachers WHERE deleted_at IS NULL AND gender = ? AND gender IS NOT NULL ORDER BY name',
        ['Male'],
      ]);
    });

    it('exports users with their role name, leaving deleted users out', async () => {
      mockTable(['username']);

      await fetchExportData({ type: 'admins', fields: ['username', 'role'] });

      const [sql] = dataQuery();
      expect(sql).toMatch(/^SELECT username, r\.name as role\s+FROM users u/);
      expect(sql).toContain('JOIN roles r ON ur.role_id = r.id');
      expect(sql).toContain('u.deleted_at IS NULL');
      // All four application roles, not the 'Branch Admin' role that no longer exists.
      ['Superadmin', 'Administrator', 'FinanceManager', 'SessionSupervisor'].forEach((role) =>
        expect(sql).toContain(`'${role}'`),
      );
      expect(sql).not.toContain('Branch Admin');
    });

    describe('column keys are a whitelist (SQL injection)', () => {
      const injected =
        "(SELECT value FROM settings WHERE key='association_transfer_key') AS leaked";

      it.each([
        ['students', 'name'],
        ['teachers', 'name'],
        ['admins', 'username'],
        ['classes', 'name'],
        ['inventory', 'item_name'],
        ['attendance', 'date'],
        ['student-fees', 'amount'],
        ['expenses', 'amount'],
        ['income', 'amount'],
      ])(
        '%s: an expression, a dotted name or an unknown key never reaches the SQL',
        async (type, key) => {
          mockTable([key, 'password', 'secret']);

          await fetchExportData({
            type,
            fields: [key, injected, 'u.password', 'secret', 'password'],
            options: { startDate: '2026-01-01', endDate: '2026-12-31' },
          });

          const [sql] = dataQuery();
          expect(sql).not.toContain('settings');
          expect(sql).not.toContain('leaked');
          expect(sql).not.toContain('password');
          expect(sql).not.toContain('secret');
        },
      );

      it('refuses an export whose keys are all unknown', async () => {
        mockTable(['name']);

        await expect(fetchExportData({ type: 'students', fields: [injected] })).rejects.toThrow(
          'No valid student fields available for export after validating against DB columns.',
        );
        expect(dataQuery()).toBeUndefined();
      });

      it('does not treat inherited object keys as columns', async () => {
        mockTable(['name']);

        await expect(
          fetchExportData({ type: 'expenses', fields: ['constructor', 'toString'] }),
        ).rejects.toThrow('No valid expense fields selected.');
      });
    });

    describe('every column the export screens offer is exported', () => {
      it('expenses and income export the category the screens ask for as category_name', async () => {
        mockTable([]);

        await fetchExportData({ type: 'expenses', fields: ['date', 'category_name'] });
        expect(dataQuery()[0]).toMatch(
          /^SELECT transaction_date as date, category as category_name\s/,
        );

        allQuery.mockClear();
        await fetchExportData({ type: 'income', fields: ['category_name'] });
        expect(dataQuery()[0]).toMatch(/^SELECT category as category_name\s/);
      });

      it("classes export their age group's name", async () => {
        mockTable([]);

        await fetchExportData({ type: 'classes', fields: ['name', 'age_group_name'] });

        const [sql] = dataQuery();
        expect(sql).toMatch(/^SELECT c\.name, ag\.name as age_group_name\s/);
        expect(sql).toContain('LEFT JOIN age_groups ag ON c.age_group_id = ag.id');
      });

      it('fee payments export the sponsor and the class', async () => {
        mockTable([]);

        await fetchExportData({
          type: 'student-fees',
          fields: ['class_matricule', 'sponsor_name', 'sponsor_phone'],
        });

        const [sql] = dataQuery();
        expect(sql).toMatch(
          /^SELECT sp\.class_id as class_matricule, sp\.sponsor_name, sp\.sponsor_phone\s/,
        );
      });

      it("teachers' legacy keys come back under the key that was asked for", async () => {
        mockTable(['name']);

        await fetchExportData({ type: 'teachers', fields: ['date_of_joining', 'qualifications'] });

        expect(dataQuery()[0]).toMatch(
          /^SELECT created_at as date_of_joining, educational_level as qualifications FROM teachers/,
        );
      });

      it('students export their enrolment date', async () => {
        mockTable(['name', 'enrollment_date']);

        await fetchExportData({ type: 'students', fields: ['name', 'enrollment_date'] });

        expect(dataQuery()[0]).toMatch(/^SELECT name, enrollment_date FROM students/);
      });
    });

    it('should throw error for invalid export type', async () => {
      await expect(
        fetchExportData({
          type: 'invalid',
          fields: ['name'],
        }),
      ).rejects.toThrow('Invalid export type: invalid');
    });
  });

  describe('localizeData', () => {
    it('should localize gender values', () => {
      const data = [
        { name: 'John', gender: 'Male' },
        { name: 'Jane', gender: 'Female' },
      ];

      const result = localizeData(data);

      expect(result).toEqual([
        { name: 'John', gender: 'ذكر' },
        { name: 'Jane', gender: 'أنثى' },
      ]);
    });

    it('should localize status values', () => {
      const data = [
        { name: 'Student 1', status: 'active' },
        { name: 'Student 2', status: 'inactive' },
      ];

      const result = localizeData(data);

      expect(result).toEqual([
        { name: 'Student 1', status: 'نشط' },
        { name: 'Student 2', status: 'غير نشط' },
      ]);
    });

    it('should localize payment methods', () => {
      const data = [
        { amount: 100, payment_method: 'Cash' },
        { amount: 200, payment_method: 'Bank Transfer' },
      ];

      const result = localizeData(data);

      expect(result).toEqual([
        { amount: 100, payment_method: 'نقداً' },
        { amount: 200, payment_method: 'تحويل بنكي' },
      ]);
    });

    it('should not modify unmapped values', () => {
      const data = [{ name: 'Test', custom_field: 'unchanged' }];

      const result = localizeData(data);

      expect(result).toEqual([{ name: 'Test', custom_field: 'unchanged' }]);
    });
  });

  describe('generateXlsx', () => {
    let mockWorkbook, mockWorksheet;

    beforeEach(() => {
      mockWorksheet = {
        views: [],
        columns: [],
        addRows: jest.fn(),
        getRow: jest.fn(() => ({ font: {} })),
        insertRow: jest.fn(),
        mergeCells: jest.fn(),
        getCell: jest.fn(() => ({ alignment: {}, font: {} })),
      };

      mockWorkbook = {
        addWorksheet: jest.fn(() => mockWorksheet),
        xlsx: {
          writeFile: jest.fn(),
        },
      };

      ExcelJS.Workbook.mockImplementation(() => mockWorkbook);
    });

    it('should generate XLSX file with localized data', async () => {
      const columns = [
        { header: 'Name', key: 'name' },
        { header: 'Gender', key: 'gender' },
      ];
      const data = [
        { name: 'John', gender: 'Male' },
        { name: 'Jane', gender: 'Female' },
      ];
      const outputPath = '/mock/output.xlsx';

      await generateXlsx(columns, data, outputPath);

      expect(mockWorkbook.addWorksheet).toHaveBeenCalledWith('Exported Data');
      expect(mockWorksheet.views).toEqual([{ rightToLeft: true }]);
      expect(mockWorksheet.columns).toEqual(columns.map((col) => ({ ...col, width: 25 })));
      expect(mockWorksheet.addRows).toHaveBeenCalledWith([
        { name: 'John', gender: 'ذكر' },
        { name: 'Jane', gender: 'أنثى' },
      ]);
      expect(mockWorkbook.xlsx.writeFile).toHaveBeenCalledWith(outputPath);
    });
  });
});
