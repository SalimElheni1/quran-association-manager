// Mock dependencies first
jest.mock('../src/main/logger');
jest.mock('../src/db/db');
jest.mock('../src/main/matriculeService');
jest.mock('electron', () => ({
  ipcMain: {
    handle: jest.fn(),
  },
}));

const { log, error: logError } = require('../src/main/logger');
const { allQuery, runQuery, getQuery } = require('../src/db/db');
const { generateMatricule } = require('../src/main/matriculeService');
const { ipcMain } = require('electron');

const {
  registerFinancialHandlers,
  handleGetExpenses,
  handleAddExpense,
  handleUpdateExpense,
  handleDeleteExpense,
  handleGetDonations,
  handleAddDonation,
  handleUpdateDonation,
  handleDeleteDonation,
  handleGetInventoryItems,
  handleCheckItemUniqueness,
  handleAddInventoryItem,
  handleUpdateInventoryItem,
  handleDeleteInventoryItem,
  handleGetSalaries,
  handleAddSalary,
  handleUpdateSalary,
  handleDeleteSalary,
  handleGetPayments,
  handleAddPayment,
  handleUpdatePayment,
  handleDeletePayment,
  handleGetFinancialSummary,
  handleGetMonthlySnapshot,
  handleGetStatementOfActivities,
} = require('../src/main/financialHandlers');

describe('financialHandlers - Comprehensive Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('registerFinancialHandlers', () => {
    it('should register all IPC handlers', () => {
      registerFinancialHandlers();

      const expectedHandlers = [
        'get-expenses', 'add-expense', 'update-expense', 'delete-expense',
        'get-donations', 'add-donation', 'update-donation', 'delete-donation',
        'inventory:get', 'inventory:check-uniqueness', 'inventory:add', 'inventory:update', 'inventory:delete',
        'get-salaries', 'add-salary', 'update-salary', 'delete-salary',
        'get-payments', 'add-payment', 'update-payment', 'delete-payment',
        'get-financial-summary', 'get-monthly-snapshot', 'get-statement-of-activities'
      ];

      expect(ipcMain.handle).toHaveBeenCalledTimes(expectedHandlers.length);
      expectedHandlers.forEach(handler => {
        expect(ipcMain.handle).toHaveBeenCalledWith(handler, expect.any(Function));
      });
    });
  });

  describe('Expense Handlers - Advanced Cases', () => {
    describe('handleUpdateExpense', () => {
      it('should update expense and return updated record', async () => {
        const expenseData = {
          id: 1,
          category: 'Updated Category',
          amount: 150.75,
          expense_date: '2024-02-01',
          responsible_person: 'Jane Doe',
          description: 'Updated description',
        };

        const updatedExpense = { ...expenseData, updated_at: '2024-02-01T10:00:00Z' };

        runQuery.mockResolvedValue({ changes: 1 });
        getQuery.mockResolvedValue(updatedExpense);

        const result = await handleUpdateExpense(null, expenseData);

        expect(runQuery).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE expenses SET'),
          expect.arrayContaining([
            'Updated Category', 150.75, '2024-02-01', 'Jane Doe', 'Updated description', 1
          ])
        );
        expect(getQuery).toHaveBeenCalledWith('SELECT * FROM expenses WHERE id = ?', [1]);
        expect(result).toEqual(updatedExpense);
      });

      it('should handle update with null values', async () => {
        const expenseData = {
          id: 1,
          category: 'Bills',
          amount: 100,
          expense_date: '2024-01-15',
          responsible_person: null,
          description: null,
        };

        runQuery.mockResolvedValue({ changes: 1 });
        getQuery.mockResolvedValue(expenseData);

        const result = await handleUpdateExpense(null, expenseData);

        expect(runQuery).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE expenses SET'),
          expect.arrayContaining(['Bills', 100, '2024-01-15', null, null, 1])
        );
      });
    });

    describe('handleDeleteExpense', () => {
      it('should delete expense and return deleted ID', async () => {
        runQuery.mockResolvedValue({ changes: 1 });

        const result = await handleDeleteExpense(null, 5);

        expect(runQuery).toHaveBeenCalledWith('DELETE FROM expenses WHERE id = ?', [5]);
        expect(result).toEqual({ id: 5 });
      });

      it('should handle deletion of non-existent expense', async () => {
        runQuery.mockResolvedValue({ changes: 0 });

        const result = await handleDeleteExpense(null, 999);

        expect(result).toEqual({ id: 999 });
      });
    });
  });

  describe('Donation Handlers - Advanced Cases', () => {
    describe('handleUpdateDonation', () => {
      it('should update cash donation', async () => {
        const donationData = {
          id: 1,
          donor_name: 'Updated Donor',
          amount: 2000,
          donation_date: '2024-02-01',
          notes: 'Updated notes',
          donation_type: 'Cash',
          description: null,
          quantity: null,
          category: null,
        };

        runQuery.mockResolvedValue({ changes: 1 });
        getQuery.mockResolvedValue(donationData);

        const result = await handleUpdateDonation(null, donationData);

        expect(runQuery).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE donations SET'),
          expect.arrayContaining([
            'Updated Donor', 2000, '2024-02-01', 'Updated notes', 'Cash', null, null, null, 1
          ])
        );
        expect(result).toEqual(donationData);
      });

      it('should update in-kind donation', async () => {
        const donationData = {
          id: 2,
          donor_name: 'In-kind Donor',
          amount: null,
          donation_date: '2024-02-01',
          notes: 'Books donation',
          donation_type: 'In-kind',
          description: '100 Islamic books',
          quantity: 100,
          category: 'Books',
        };

        runQuery.mockResolvedValue({ changes: 1 });
        getQuery.mockResolvedValue(donationData);

        const result = await handleUpdateDonation(null, donationData);

        expect(runQuery).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE donations SET'),
          expect.arrayContaining([
            'In-kind Donor', null, '2024-02-01', 'Books donation', 'In-kind', '100 Islamic books', 100, 'Books', 2
          ])
        );
      });
    });

    describe('handleDeleteDonation', () => {
      it('should delete donation and return deleted ID', async () => {
        runQuery.mockResolvedValue({ changes: 1 });

        const result = await handleDeleteDonation(null, 3);

        expect(runQuery).toHaveBeenCalledWith('DELETE FROM donations WHERE id = ?', [3]);
        expect(result).toEqual({ id: 3 });
      });
    });
  });

  describe('Inventory Handlers - Comprehensive Tests', () => {
    describe('handleCheckItemUniqueness', () => {
      it('should return unique when item name does not exist', async () => {
        getQuery.mockResolvedValue(undefined);

        const result = await handleCheckItemUniqueness(null, { 
          itemName: 'New Unique Item',
          currentId: null 
        });

        expect(getQuery).toHaveBeenCalledWith(
          'SELECT id FROM inventory_items WHERE item_name = ? COLLATE NOCASE',
          ['New Unique Item']
        );
        expect(result).toEqual({ isUnique: true });
      });

      it('should return not unique when item name exists', async () => {
        getQuery.mockResolvedValue({ id: 5 });

        const result = await handleCheckItemUniqueness(null, { 
          itemName: 'Existing Item',
          currentId: null 
        });

        expect(result).toEqual({ isUnique: false });
      });

      it('should exclude current item when checking uniqueness for updates', async () => {
        getQuery.mockResolvedValue(undefined);

        const result = await handleCheckItemUniqueness(null, { 
          itemName: 'Item Name',
          currentId: 3 
        });

        expect(getQuery).toHaveBeenCalledWith(
          'SELECT id FROM inventory_items WHERE item_name = ? COLLATE NOCASE AND id != ?',
          ['Item Name', 3]
        );
        expect(result).toEqual({ isUnique: true });
      });

      it('should handle case-insensitive comparison', async () => {
        getQuery.mockResolvedValue({ id: 1 });

        const result = await handleCheckItemUniqueness(null, { 
          itemName: 'EXISTING ITEM',
          currentId: null 
        });

        expect(getQuery).toHaveBeenCalledWith(
          expect.stringContaining('COLLATE NOCASE'),
          ['EXISTING ITEM']
        );
        expect(result).toEqual({ isUnique: false });
      });
    });

    describe('handleAddInventoryItem', () => {
      it('should add inventory item with calculated total value', async () => {
        const itemData = {
          item_name: 'Quran Copies',
          category: 'Books',
          quantity: 50,
          unit_value: 15.5,
          acquisition_date: '2024-01-15',
          acquisition_source: 'Purchase',
          condition_status: 'New',
          location: 'Storage Room A',
          notes: 'High quality copies',
        };

        generateMatricule.mockResolvedValue('I-000001');
        runQuery.mockResolvedValue({ id: 1 });
        getQuery.mockResolvedValue({ 
          ...itemData, 
          id: 1, 
          matricule: 'I-000001',
          total_value: 775 // 50 * 15.5
        });

        const result = await handleAddInventoryItem(null, itemData);

        expect(generateMatricule).toHaveBeenCalledWith('inventory');
        expect(runQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO inventory_items'),
          expect.arrayContaining([
            'I-000001', 'Quran Copies', 'Books', 50, 15.5, 775,
            '2024-01-15', 'Purchase', 'New', 'Storage Room A', 'High quality copies'
          ])
        );
        expect(result.total_value).toBe(775);
      });

      it('should handle zero quantity and unit value', async () => {
        const itemData = {
          item_name: 'Free Item',
          category: 'Donations',
          quantity: 0,
          unit_value: 0,
        };

        generateMatricule.mockResolvedValue('I-000002');
        runQuery.mockResolvedValue({ id: 2 });
        getQuery.mockResolvedValue({ 
          ...itemData, 
          id: 2, 
          matricule: 'I-000002',
          total_value: 0
        });

        const result = await handleAddInventoryItem(null, itemData);

        expect(runQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO inventory_items'),
          expect.arrayContaining(['I-000002', 'Free Item', 'Donations', 0, 0, 0])
        );
        expect(result.total_value).toBe(0);
      });

      it('should handle null unit value', async () => {
        const itemData = {
          item_name: 'Unknown Value Item',
          category: 'Misc',
          quantity: 10,
          unit_value: null,
        };

        generateMatricule.mockResolvedValue('I-000003');
        runQuery.mockResolvedValue({ id: 3 });
        getQuery.mockResolvedValue({ 
          ...itemData, 
          id: 3, 
          matricule: 'I-000003',
          total_value: 0
        });

        const result = await handleAddInventoryItem(null, itemData);

        expect(runQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO inventory_items'),
          expect.arrayContaining(['I-000003', 'Unknown Value Item', 'Misc', 10, null, 0])
        );
      });
    });

    describe('handleUpdateInventoryItem', () => {
      it('should update inventory item and recalculate total value', async () => {
        const itemData = {
          id: 1,
          item_name: 'Updated Item',
          category: 'Updated Category',
          quantity: 25,
          unit_value: 20,
          acquisition_date: '2024-02-01',
          acquisition_source: 'Donation',
          condition_status: 'Used',
          location: 'Storage Room B',
          notes: 'Updated notes',
        };

        runQuery.mockResolvedValue({ changes: 1 });
        getQuery.mockResolvedValue({ 
          ...itemData, 
          total_value: 500 // 25 * 20
        });

        const result = await handleUpdateInventoryItem(null, itemData);

        expect(runQuery).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE inventory_items SET'),
          expect.arrayContaining([
            'Updated Item', 'Updated Category', 25, 20, 500,
            '2024-02-01', 'Donation', 'Used', 'Storage Room B', 'Updated notes', 1
          ])
        );
        expect(result.total_value).toBe(500);
      });

      it('should handle partial updates', async () => {
        const itemData = {
          id: 1,
          item_name: 'Partially Updated Item',
          category: 'Books',
          quantity: 30,
          unit_value: undefined, // Not provided
          notes: null,
        };

        runQuery.mockResolvedValue({ changes: 1 });
        getQuery.mockResolvedValue({ 
          ...itemData, 
          total_value: 0 // 30 * 0 (undefined treated as 0)
        });

        const result = await handleUpdateInventoryItem(null, itemData);

        expect(runQuery).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE inventory_items SET'),
          expect.arrayContaining([
            'Partially Updated Item', 'Books', 30, undefined, 0,
            undefined, undefined, undefined, undefined, null, 1
          ])
        );
      });
    });

    describe('handleDeleteInventoryItem', () => {
      it('should delete inventory item and return deleted ID', async () => {
        runQuery.mockResolvedValue({ changes: 1 });

        const result = await handleDeleteInventoryItem(null, 7);

        expect(runQuery).toHaveBeenCalledWith('DELETE FROM inventory_items WHERE id = ?', [7]);
        expect(result).toEqual({ id: 7 });
      });
    });
  });

  describe('Salary Handlers - Advanced Cases', () => {
    describe('handleGetSalaries', () => {
      it('should get salaries with employee names from both teachers and users', async () => {
        const mockSalaries = [
          {
            id: 1,
            user_id: 1,
            user_type: 'teacher',
            amount: 1500,
            payment_date: '2024-01-15',
            employee_name: 'أستاذ محمد',
          },
          {
            id: 2,
            user_id: 2,
            user_type: 'admin',
            amount: 2000,
            payment_date: '2024-01-15',
            employee_name: 'أحمد محمود',
          },
        ];

        allQuery.mockResolvedValue(mockSalaries);

        const result = await handleGetSalaries(null, {
          startDate: '2024-01-01',
          endDate: '2024-01-31'
        });

        expect(allQuery).toHaveBeenCalledWith(
          expect.stringContaining('LEFT JOIN teachers t ON s.user_id = t.id AND s.user_type = \'teacher\''),
          ['2024-01-01', '2024-01-31']
        );
        expect(allQuery).toHaveBeenCalledWith(
          expect.stringContaining('LEFT JOIN users u ON s.user_id = u.id AND s.user_type = \'admin\''),
          ['2024-01-01', '2024-01-31']
        );
        expect(result).toEqual(mockSalaries);
      });

      it('should handle salaries with unknown employee type', async () => {
        const mockSalaries = [
          {
            id: 1,
            user_id: 999,
            user_type: 'unknown',
            amount: 1000,
            payment_date: '2024-01-15',
            employee_name: 'غير معروف',
          },
        ];

        allQuery.mockResolvedValue(mockSalaries);

        const result = await handleGetSalaries();

        expect(result[0].employee_name).toBe('غير معروف');
      });
    });

    describe('handleAddSalary', () => {
      it('should add salary for teacher', async () => {
        const salaryData = {
          user_id: 1,
          user_type: 'teacher',
          amount: 1800,
          payment_date: '2024-02-01',
          notes: 'Monthly salary',
        };

        runQuery.mockResolvedValue({ id: 1 });
        getQuery.mockResolvedValue({
          ...salaryData,
          id: 1,
          employee_name: 'أستاذة فاطمة',
        });

        const result = await handleAddSalary(null, salaryData);

        expect(runQuery).toHaveBeenCalledWith(
          'INSERT INTO salaries (user_id, user_type, amount, payment_date, notes) VALUES (?, ?, ?, ?, ?)',
          [1, 'teacher', 1800, '2024-02-01', 'Monthly salary']
        );
        expect(getQuery).toHaveBeenCalledWith(
          expect.stringContaining('LEFT JOIN teachers t ON s.user_id = t.id AND s.user_type = \'teacher\''),
          [1]
        );
        expect(result.employee_name).toBe('أستاذة فاطمة');
      });

      it('should add salary for admin user', async () => {
        const salaryData = {
          user_id: 2,
          user_type: 'admin',
          amount: 2200,
          payment_date: '2024-02-01',
          notes: 'Admin salary',
        };

        runQuery.mockResolvedValue({ id: 2 });
        getQuery.mockResolvedValue({
          ...salaryData,
          id: 2,
          employee_name: 'مدير الفرع',
        });

        const result = await handleAddSalary(null, salaryData);

        expect(result.employee_name).toBe('مدير الفرع');
      });
    });

    describe('handleUpdateSalary', () => {
      it('should update salary and return updated record with employee name', async () => {
        const salaryData = {
          id: 1,
          user_id: 1,
          user_type: 'teacher',
          amount: 1900,
          payment_date: '2024-02-15',
          notes: 'Updated salary',
        };

        runQuery.mockResolvedValue({ changes: 1 });
        getQuery.mockResolvedValue({
          ...salaryData,
          employee_name: 'أستاذ محمد المحدث',
        });

        const result = await handleUpdateSalary(null, salaryData);

        expect(runQuery).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE salaries SET'),
          [1, 'teacher', 1900, '2024-02-15', 'Updated salary', 1]
        );
        expect(result.employee_name).toBe('أستاذ محمد المحدث');
      });
    });
  });

  describe('Payment Handlers - Advanced Cases', () => {
    describe('handleGetPayments', () => {
      it('should get payments with student names', async () => {
        const mockPayments = [
          {
            id: 1,
            student_id: 1,
            student_name: 'أحمد محمد',
            amount: 150,
            payment_date: '2024-01-15',
            payment_method: 'Cash',
            notes: 'Monthly fee',
          },
        ];

        allQuery.mockResolvedValue(mockPayments);

        const result = await handleGetPayments(null, {
          startDate: '2024-01-01',
          endDate: '2024-01-31'
        });

        expect(allQuery).toHaveBeenCalledWith(
          expect.stringContaining('JOIN students s ON p.student_id = s.id'),
          ['2024-01-01', '2024-01-31']
        );
        expect(result).toEqual(mockPayments);
      });

      it('should get all payments when no period specified', async () => {
        const mockPayments = [
          { id: 1, student_name: 'طالب 1', amount: 100 },
          { id: 2, student_name: 'طالب 2', amount: 150 },
        ];

        allQuery.mockResolvedValue(mockPayments);

        const result = await handleGetPayments();

        expect(allQuery).toHaveBeenCalledWith(
          expect.stringContaining('ORDER BY p.payment_date DESC'),
          []
        );
        expect(result).toEqual(mockPayments);
      });
    });

    describe('handleAddPayment', () => {
      it('should add payment and return with student name', async () => {
        const paymentData = {
          student_id: 1,
          amount: 200,
          payment_date: '2024-02-01',
          payment_method: 'Bank Transfer',
          notes: 'Semester fee',
        };

        runQuery.mockResolvedValue({ id: 1 });
        getQuery.mockResolvedValue({
          ...paymentData,
          id: 1,
          student_name: 'فاطمة أحمد',
        });

        const result = await handleAddPayment(null, paymentData);

        expect(runQuery).toHaveBeenCalledWith(
          'INSERT INTO payments (student_id, amount, payment_date, payment_method, notes) VALUES (?, ?, ?, ?, ?)',
          [1, 200, '2024-02-01', 'Bank Transfer', 'Semester fee']
        );
        expect(result.student_name).toBe('فاطمة أحمد');
      });

      it('should handle payment with null notes', async () => {
        const paymentData = {
          student_id: 2,
          amount: 100,
          payment_date: '2024-02-01',
          payment_method: 'Cash',
          notes: null,
        };

        runQuery.mockResolvedValue({ id: 2 });
        getQuery.mockResolvedValue({
          ...paymentData,
          id: 2,
          student_name: 'محمد علي',
        });

        const result = await handleAddPayment(null, paymentData);

        expect(runQuery).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO payments'),
          [2, 100, '2024-02-01', 'Cash', null]
        );
      });
    });

    describe('handleUpdatePayment', () => {
      it('should update payment and return updated record', async () => {
        const paymentData = {
          id: 1,
          student_id: 1,
          amount: 250,
          payment_date: '2024-02-15',
          payment_method: 'Bank Transfer',
          notes: 'Updated payment',
        };

        runQuery.mockResolvedValue({ changes: 1 });
        getQuery.mockResolvedValue({
          ...paymentData,
          student_name: 'أحمد محمد',
        });

        const result = await handleUpdatePayment(null, paymentData);

        expect(runQuery).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE payments SET'),
          [1, 250, '2024-02-15', 'Bank Transfer', 'Updated payment', 1]
        );
        expect(result.student_name).toBe('أحمد محمد');
      });
    });
  });

  describe('Financial Reporting - Advanced Cases', () => {
    describe('handleGetStatementOfActivities', () => {
      it('should generate statement with default current month period', async () => {
        const now = new Date();
        const expectedStartDate = new Date(now.getFullYear(), now.getMonth(), 1)
          .toISOString().split('T')[0] + ' 00:00:00';

        getQuery
          .mockResolvedValueOnce({ total: 5000 }) // fees
          .mockResolvedValueOnce({ total: 2000 }) // donations
          .mockResolvedValueOnce({ total: 3000 }) // salaries
          .mockResolvedValueOnce({ total: 1000 }); // expenses

        allQuery
          .mockResolvedValueOnce([
            { category: 'Bills', total: 500 },
            { category: 'Supplies', total: 500 }
          ]) // expenses by category
          .mockResolvedValueOnce([
            { date: '2024-01-15', type: 'دفعة رسوم', details: 'دفعة من الطالب أحمد', amount: 150 }
          ]); // recent transactions

        const result = await handleGetStatementOfActivities();

        expect(getQuery).toHaveBeenCalledWith(
          expect.stringContaining('SELECT SUM(amount) as total FROM payments'),
          [expectedStartDate, expect.any(String)]
        );
        expect(result).toEqual({
          studentFees: 5000,
          cashDonations: 2000,
          salaries: 3000,
          expensesByCategory: [
            { category: 'Bills', total: 500 },
            { category: 'Supplies', total: 500 }
          ],
          recentTransactions: [
            { date: '2024-01-15', type: 'دفعة رسوم', details: 'دفعة من الطالب أحمد', amount: 150 }
          ],
        });
      });

      it('should handle null values in database results', async () => {
        getQuery
          .mockResolvedValueOnce(null) // fees
          .mockResolvedValueOnce({ total: null }) // donations
          .mockResolvedValueOnce({ total: 1500 }) // salaries
          .mockResolvedValueOnce({ total: 800 }); // expenses

        allQuery
          .mockResolvedValueOnce([]) // no expenses by category
          .mockResolvedValueOnce([]); // no recent transactions

        const result = await handleGetStatementOfActivities(null, {
          startDate: '2024-01-01',
          endDate: '2024-01-31'
        });

        expect(result).toEqual({
          studentFees: 0,
          cashDonations: 0,
          salaries: 1500,
          expensesByCategory: [],
          recentTransactions: [],
        });
      });

      it('should include complex recent transactions query', async () => {
        getQuery.mockResolvedValue({ total: 0 });
        allQuery
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([
            { date: '2024-01-15', type: 'تبرع عيني', details: '50 مصحف', amount: null },
            { date: '2024-01-14', type: 'راتب', details: 'راتب لـ أستاذ محمد', amount: 1500 },
            { date: '2024-01-13', type: 'مصروف', details: 'فواتير', amount: 200 },
          ]);

        const result = await handleGetStatementOfActivities();

        expect(allQuery).toHaveBeenCalledWith(
          expect.stringContaining('UNION ALL'),
          []
        );
        expect(result.recentTransactions).toHaveLength(3);
        expect(result.recentTransactions[0].type).toBe('تبرع عيني');
        expect(result.recentTransactions[0].amount).toBeNull();
      });
    });

    describe('handleGetMonthlySnapshot', () => {
      it('should calculate monthly snapshot with default period', async () => {
        const now = new Date();
        const expectedStartDate = new Date(now.getFullYear(), now.getMonth(), 1)
          .toISOString().split('T')[0] + ' 00:00:00';

        getQuery
          .mockResolvedValueOnce({ total: 8000 }) // monthly income
          .mockResolvedValueOnce({ total: 3000 }) // monthly cash donations
          .mockResolvedValueOnce({ total: 2000 }) // monthly expenses
          .mockResolvedValueOnce({ total: 4000 }) // monthly salaries
          .mockResolvedValueOnce({ count: 25 }) // payment count
          .mockResolvedValueOnce({ max: 500 }); // largest expense

        const result = await handleGetMonthlySnapshot();

        expect(getQuery).toHaveBeenCalledWith(
          expect.stringContaining('SELECT SUM(amount) as total FROM payments'),
          [expectedStartDate, expect.any(String)]
        );
        expect(result).toEqual({
          totalIncomeThisMonth: 11000, // 8000 + 3000
          totalExpensesThisMonth: 6000, // 2000 + 4000
          paymentsThisMonth: 25,
          largestExpenseThisMonth: 500,
        });
      });

      it('should handle custom period', async () => {
        const customPeriod = {
          startDate: '2024-06-01',
          endDate: '2024-06-30'
        };

        getQuery.mockResolvedValue({ total: 0, count: 0, max: 0 });

        const result = await handleGetMonthlySnapshot(null, customPeriod);

        expect(getQuery).toHaveBeenCalledWith(
          expect.stringContaining('SELECT SUM(amount) as total FROM payments'),
          ['2024-06-01', '2024-06-30']
        );
      });

      it('should handle null database results', async () => {
        getQuery
          .mockResolvedValueOnce(null) // income
          .mockResolvedValueOnce({ total: null }) // donations
          .mockResolvedValueOnce({ total: null }) // expenses
          .mockResolvedValueOnce({ total: null }) // salaries
          .mockResolvedValueOnce({ count: null }) // payment count
          .mockResolvedValueOnce({ max: null }); // largest expense

        const result = await handleGetMonthlySnapshot();

        expect(result).toEqual({
          totalIncomeThisMonth: 0,
          totalExpensesThisMonth: 0,
          paymentsThisMonth: 0,
          largestExpenseThisMonth: 0,
        });
      });
    });

    describe('handleGetFinancialSummary', () => {
      it('should generate financial summary for specific year', async () => {
        const targetYear = 2024;
        const expectedStartDate = '2024-01-01 00:00:00';
        const expectedEndDate = '2024-12-31 23:59:59';

        allQuery
          .mockResolvedValueOnce([
            { source: 'Payments', total: 50000 },
            { source: 'Donations', total: 15000 }
          ]) // income
          .mockResolvedValueOnce([
            { source: 'Expenses', total: 20000 }
          ]) // expenses
          .mockResolvedValueOnce([
            { source: 'Salaries', total: 30000 }
          ]); // salaries

        const result = await handleGetFinancialSummary(null, targetYear);

        expect(allQuery).toHaveBeenCalledWith(
          expect.stringContaining('UNION ALL'),
          [expectedStartDate, expectedEndDate, expectedStartDate, expectedEndDate]
        );
        expect(result).toEqual({
          totalIncome: 65000, // 50000 + 15000
          totalExpenses: 50000, // 20000 + 30000
          balance: 15000, // 65000 - 50000
          incomeBreakdown: [
            { source: 'Payments', total: 50000 },
            { source: 'Donations', total: 15000 }
          ],
          expenseBreakdown: [
            { source: 'Expenses', total: 20000 },
            { source: 'Salaries', total: 30000 }
          ],
        });
      });

      it('should use current year when no year specified', async () => {
        const currentYear = new Date().getFullYear();
        const expectedStartDate = `${currentYear}-01-01 00:00:00`;

        allQuery.mockResolvedValue([]);

        const result = await handleGetFinancialSummary();

        expect(allQuery).toHaveBeenCalledWith(
          expect.stringContaining('SELECT \'Payments\' as source'),
          [expectedStartDate, expect.stringContaining(`${currentYear}-12-31`)]
        );
      });

      it('should handle empty financial data', async () => {
        allQuery
          .mockResolvedValueOnce([]) // no income
          .mockResolvedValueOnce([]) // no expenses
          .mockResolvedValueOnce([]); // no salaries

        const result = await handleGetFinancialSummary(null, 2024);

        expect(result).toEqual({
          totalIncome: 0,
          totalExpenses: 0,
          balance: 0,
          incomeBreakdown: [],
          expenseBreakdown: [],
        });
      });

      it('should handle null totals in breakdown', async () => {
        allQuery
          .mockResolvedValueOnce([
            { source: 'Payments', total: null },
            { source: 'Donations', total: 5000 }
          ])
          .mockResolvedValueOnce([
            { source: 'Expenses', total: null }
          ])
          .mockResolvedValueOnce([
            { source: 'Salaries', total: 8000 }
          ]);

        const result = await handleGetFinancialSummary(null, 2024);

        expect(result.totalIncome).toBe(5000); // null treated as 0
        expect(result.totalExpenses).toBe(8000);
        expect(result.balance).toBe(-3000); // 5000 - 8000
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors in expense operations', async () => {
      const dbError = new Error('Database connection failed');
      runQuery.mockRejectedValue(dbError);

      await expect(handleAddExpense(null, {
        category: 'Test',
        amount: 100,
        expense_date: '2024-01-01',
        responsible_person: 'Test Person',
        description: 'Test expense'
      })).rejects.toThrow('Database connection failed');

      expect(logError).toHaveBeenCalledWith(
        expect.stringContaining('Error in handler'),
        'Database connection failed'
      );
    });

    it('should handle database errors in inventory operations', async () => {
      const dbError = new Error('Inventory table not found');
      allQuery.mockRejectedValue(dbError);

      await expect(handleGetInventoryItems()).rejects.toThrow('Inventory table not found');
    });

    it('should handle database errors in financial summary', async () => {
      const dbError = new Error('Query timeout');
      allQuery.mockRejectedValue(dbError);

      await expect(handleGetFinancialSummary()).rejects.toThrow('Query timeout');
    });

    it('should handle matricule generation errors', async () => {
      const matriculeError = new Error('Matricule generation failed');
      generateMatricule.mockRejectedValue(matriculeError);

      await expect(handleAddInventoryItem(null, {
        item_name: 'Test Item',
        category: 'Test Category',
        quantity: 1
      })).rejects.toThrow('Matricule generation failed');
    });
  });
});