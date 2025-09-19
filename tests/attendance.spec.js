const path = require('path');
const { ipcMain } = require('electron');
const { initializeTestDatabase, closeDatabase, getQuery, runQuery, allQuery } = require('../src/db/db');
const { registerAttendanceHandlers } = require('../src/main/handlers/attendanceHandlers');
const { registerClassHandlers } = require('../src/main/handlers/classHandlers');
const { registerStudentHandlers } = require('../src/main/handlers/studentHandlers');

describe('Attendance Handlers', () => {
    let classId;
    let student1Id;
    let student2Id;

    beforeAll(async () => {
        const dbPath = path.join(__dirname, 'test-attendance.sqlite');
        await initializeTestDatabase(dbPath);
        registerAttendanceHandlers();
        registerClassHandlers();
        registerStudentHandlers();

        // Setup initial data
        const classResult = await ipcMain.invoke('classes:add', { name: 'Test Class', class_type: 'Hifz', gender: 'men' });
        classId = classResult.id;

        const student1Result = await ipcMain.invoke('students:add', { name: 'Student 1' });
        student1Id = student1Result.id;
        const student2Result = await ipcMain.invoke('students:add', { name: 'Student 2' });
        student2Id = student2Result.id;

        // Enroll students in the class
        await runQuery('INSERT INTO class_students (class_id, student_id) VALUES (?, ?)', [classId, student1Id]);
        await runQuery('INSERT INTO class_students (class_id, student_id) VALUES (?, ?)', [classId, student2Id]);
    });

    afterAll(async () => {
        await closeDatabase();
    });

    afterEach(async () => {
        await runQuery('DELETE FROM attendance');
    });

    describe('attendance:save', () => {
        it('should save new attendance records correctly', async () => {
            const date = '2024-01-01';
            const records = {
                [student1Id]: 'present',
                [student2Id]: 'absent',
            };

            const result = await ipcMain.invoke('attendance:save', { classId, date, records });
            expect(result.success).toBe(true);

            const attendanceRecords = await allQuery('SELECT * FROM attendance WHERE class_id = ? AND date = ?', [classId, date]);
            expect(attendanceRecords).toHaveLength(2);

            const student1Record = attendanceRecords.find(r => r.student_id === student1Id);
            expect(student1Record.status).toBe('present');

            const student2Record = attendanceRecords.find(r => r.student_id === student2Id);
            expect(student2Record.status).toBe('absent');
        });

        it('should update existing attendance records correctly', async () => {
            const date = '2024-01-01';
            // First, save some initial records
            await ipcMain.invoke('attendance:save', {
                classId,
                date,
                records: { [student1Id]: 'present', [student2Id]: 'present' },
            });

            // Now, update the records
            const updatedRecords = {
                [student1Id]: 'late',
                [student2Id]: 'absent',
            };
            const result = await ipcMain.invoke('attendance:save', { classId, date, records: updatedRecords });
            expect(result.success).toBe(true);

            const attendanceRecords = await allQuery('SELECT * FROM attendance WHERE class_id = ? AND date = ?', [classId, date]);
            expect(attendanceRecords).toHaveLength(2);

            const student1Record = attendanceRecords.find(r => r.student_id === student1Id);
            expect(student1Record.status).toBe('late');

            const student2Record = attendanceRecords.find(r => r.student_id === student2Id);
            expect(student2Record.status).toBe('absent');
        });

        it('should clear attendance for a day if empty records are provided', async () => {
            const date = '2024-01-01';
            // First, save some initial records
            await ipcMain.invoke('attendance:save', {
                classId,
                date,
                records: { [student1Id]: 'present' },
            });

            // Now, save empty records
            const result = await ipcMain.invoke('attendance:save', { classId, date, records: {} });
            expect(result.success).toBe(true);

            const attendanceRecords = await allQuery('SELECT * FROM attendance WHERE class_id = ? AND date = ?', [classId, date]);
            expect(attendanceRecords).toHaveLength(0);
        });
    });
});
