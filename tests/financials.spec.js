const { registerFinancialHandlers } = require('../src/main/financialHandlers');
const { initializeTestDatabase, closeDatabase, runQuery, getQuery } = require('../src/db/db');
const { ipcMain } = require('electron');
const path = require('path');

describe('Financial Handlers', () => {
    beforeAll(async () => {
        const dbPath = path.join(__dirname, 'test-financials.sqlite');
        await initializeTestDatabase(dbPath);
        registerFinancialHandlers();
    });

    afterAll(async () => {
        await closeDatabase();
    });

    afterEach(async () => {
        await runQuery('DELETE FROM donations');
        await runQuery('DELETE FROM expenses');
        await runQuery('DELETE FROM salaries');
        await runQuery('DELETE FROM payments');
        await runQuery('DELETE FROM users');
        await runQuery('DELETE FROM students');
    });

    describe('donations:add', () => {
        it('should add a new cash donation', async () => {
            const newDonation = {
                donor_name: 'John Doe',
                amount: 500,
                donation_date: '2025-01-01',
                notes: 'Test note',
                donation_type: 'Cash',
                category: 'General',
            };

            const result = await ipcMain.invoke('donations:add', newDonation);
            expect(result).toHaveProperty('id');

            const insertedDonation = await getQuery('SELECT * FROM donations WHERE id = ?', [result.id]);
            expect(insertedDonation.donor_name).toBe(newDonation.donor_name);
            expect(insertedDonation.amount).toBe(newDonation.amount);
        });

        it('should add a new in-kind donation', async () => {
            const newDonation = {
                donor_name: 'Jane Doe',
                donation_date: '2025-01-02',
                donation_type: 'In-kind',
                description: 'Office Chair',
                category: 'Furniture',
            };

            const result = await ipcMain.invoke('donations:add', newDonation);
            expect(result).toHaveProperty('id');

            const insertedDonation = await getQuery('SELECT * FROM donations WHERE id = ?', [result.id]);
            expect(insertedDonation.donor_name).toBe(newDonation.donor_name);
            expect(insertedDonation.description).toBe(newDonation.description);
        });
    });

    describe('expenses:add', () => {
        it('should add a new expense', async () => {
            const newExpense = {
                category: 'Supplies',
                amount: 100,
                expense_date: '2025-01-03',
                description: 'Pencils and paper',
            };

            const result = await ipcMain.invoke('expenses:add', newExpense);
            expect(result).toHaveProperty('id');

            const insertedExpense = await getQuery('SELECT * FROM expenses WHERE id = ?', [result.id]);
            expect(insertedExpense.category).toBe(newExpense.category);
            expect(insertedExpense.amount).toBe(newExpense.amount);
        });
    });

    describe('salaries:add', () => {
        it('should add a new salary payment', async () => {
            const newUser = await runQuery("INSERT INTO users (username, password, role, first_name, last_name) VALUES ('teacher1', 'pw', 'Admin', 'Test', 'Teacher')");
            const newSalary = {
                user_id: newUser.id,
                user_type: 'admin',
                amount: 5000,
                payment_date: '2025-01-04',
                notes: 'Monthly salary',
            };

            const result = await ipcMain.invoke('salaries:add', newSalary);
            expect(result).toHaveProperty('id');

            const insertedSalary = await getQuery('SELECT * FROM salaries WHERE id = ?', [result.id]);
            expect(insertedSalary.user_id).toBe(newSalary.user_id);
            expect(insertedSalary.amount).toBe(newSalary.amount);
        });
    });

    describe('payments:add', () => {
        it('should add a new student payment', async () => {
            const newStudent = await runQuery("INSERT INTO students (name) VALUES ('Test Student')");
            const newPayment = {
                student_id: newStudent.id,
                amount: 200,
                payment_date: '2025-01-05',
                payment_type: 'fee',
            };

            const result = await ipcMain.invoke('payments:add', newPayment);
            expect(result).toHaveProperty('id');

            const insertedPayment = await getQuery('SELECT * FROM payments WHERE id = ?', [result.id]);
            expect(insertedPayment.student_id).toBe(newPayment.student_id);
            expect(insertedPayment.amount).toBe(newPayment.amount);
        });
    });
});
