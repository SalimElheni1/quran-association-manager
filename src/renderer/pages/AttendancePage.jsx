import React, { useState, useEffect, useCallback } from 'react';
import { Form, Spinner, Table, Button, ButtonGroup } from 'react-bootstrap';
import '../styles/AttendancePage.css';
import { toast } from 'react-toastify';

function AttendancePage() {
  // State is simplified: no more selectedDate
  const [selectedClass, setSelectedClass] = useState('');
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [attendanceRecords, setAttendanceRecords] = useState({});

  // Fetch active classes on component mount
  useEffect(() => {
    const fetchActiveClasses = async () => {
      setLoadingClasses(true);
      try {
        const fetchedClasses = await window.electronAPI.getClasses({ status: 'active' });
        setClasses(fetchedClasses);
      } catch (err) {
        console.error('Error fetching active classes:', err);
        toast.error('فشل في تحميل قائمة الفصول النشطة.');
      } finally {
        setLoadingClasses(false);
      }
    };
    fetchActiveClasses();
  }, []); // Empty dependency array means this runs once on mount

  // Fetch students and their attendance records when a class is selected
  const fetchStudentAndAttendanceData = useCallback(async () => {
    if (!selectedClass) {
      setStudents([]);
      setAttendanceRecords({});
      return;
    }
    setLoadingStudents(true);
    try {
      const today = new Date().toISOString().split('T')[0]; // Get current date for attendance
      const [fetchedStudents, existingRecords] = await Promise.all([
        window.electronAPI.getStudentsForClass(selectedClass),
        window.electronAPI.getAttendanceForDate(selectedClass, today),
      ]);

      setStudents(fetchedStudents);
      const initialRecords = fetchedStudents.reduce((acc, student) => {
        acc[student.id] = existingRecords[student.id] || 'present';
        return acc;
      }, {});
      setAttendanceRecords(initialRecords);
    } catch (err) {
      console.error('Error fetching students or attendance:', err);
      toast.error('فشل في تحميل بيانات الطلاب أو الحضور.');
    } finally {
      setLoadingStudents(false);
    }
  }, [selectedClass]);

  useEffect(() => {
    fetchStudentAndAttendanceData();
  }, [fetchStudentAndAttendanceData]);

  const handleClassChange = (e) => {
    setSelectedClass(e.target.value);
    setStudents([]);
    setAttendanceRecords({});
  };

  const handleStatusChange = (studentId, status) => {
    setAttendanceRecords((prev) => ({ ...prev, [studentId]: status }));
  };

  const handleSaveAttendance = async () => {
    if (!selectedClass || Object.keys(attendanceRecords).length === 0) {
      toast.warn('الرجاء اختيار فصل وتحديد حالة الحضور للطلاب أولاً.');
      return;
    }
    setLoadingStudents(true); // Reuse student loading spinner for save operation
    try {
      const today = new Date().toISOString().split('T')[0]; // Get current date for saving
      await window.electronAPI.saveAttendance({
        classId: selectedClass,
        date: today,
        records: attendanceRecords,
      });
      toast.success('تم حفظ سجل الحضور بنجاح!');
    } catch (err) {
      console.error('Error saving attendance:', err);
      toast.error('فشل في حفظ سجل الحضور.');
    } finally {
      setLoadingStudents(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>تسجيل الحضور (لليوم)</h1>
      </div>

      <div className="attendance-controls">
        <Form.Group controlId="classSelect">
          <Form.Label>اختر الفصل الدراسي:</Form.Label>
          <Form.Select value={selectedClass} onChange={handleClassChange} disabled={loadingClasses}>
            <option value="">-- حدد الفصل الدراسي --</option>
            {classes.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.name}
              </option>
            ))}
          </Form.Select>
          {loadingClasses && <Spinner animation="border" size="sm" className="ms-2" />}
        </Form.Group>
      </div>

      {loadingStudents ? (
        <div className="text-center p-5">
          <Spinner animation="border" />
        </div>
      ) : students.length > 0 ? (
        <div className="attendance-roster">
          <Table striped bordered hover responsive>
            <thead>
              <tr>
                <th>#</th>
                <th>اسم الطالب</th>
                <th>حالة الحضور</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student, index) => (
                <tr key={student.id}>
                  <td>{index + 1}</td>
                  <td>{student.name}</td>
                  <td>
                    <ButtonGroup>
                      <Button
                        variant={
                          attendanceRecords[student.id] === 'present'
                            ? 'success'
                            : 'outline-success'
                        }
                        onClick={() => handleStatusChange(student.id, 'present')}
                      >
                        حاضر
                      </Button>
                      <Button
                        variant={
                          attendanceRecords[student.id] === 'absent' ? 'danger' : 'outline-danger'
                        }
                        onClick={() => handleStatusChange(student.id, 'absent')}
                      >
                        غائب
                      </Button>
                      <Button
                        variant={
                          attendanceRecords[student.id] === 'late' ? 'warning' : 'outline-warning'
                        }
                        onClick={() => handleStatusChange(student.id, 'late')}
                      >
                        متأخر
                      </Button>
                    </ButtonGroup>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
          <div className="text-center mt-3">
            <Button
              variant="primary"
              size="lg"
              onClick={handleSaveAttendance}
              disabled={loadingStudents}
            >
              <i className="fas fa-save me-2"></i> حفظ سجل الحضور
            </Button>
          </div>
        </div>
      ) : (
        <div className="attendance-roster-placeholder">
          <p>
            {!selectedClass
              ? 'الرجاء اختيار فصل دراسي لعرض قائمة الطلاب.'
              : 'لا يوجد طلاب مسجلون في هذا الفصل.'}
          </p>
        </div>
      )}
    </div>
  );
}

export default AttendancePage;
