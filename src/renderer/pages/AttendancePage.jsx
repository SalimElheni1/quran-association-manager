import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Form,
  Spinner,
  Table,
  Button,
  ButtonGroup,
  Row,
  Col,
  Card,
  ListGroup,
  Alert,
} from 'react-bootstrap';
import { useSearchParams } from 'react-router-dom';
import '@/styles/AttendancePage.css';
import { toast } from 'react-toastify';

function AttendancePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialLoadRef = useRef(true);

  // Initialize state from URL search parameters
  const [selectedClass, setSelectedClass] = useState(searchParams.get('classId') || '');
  const [selectedDate, setSelectedDate] = useState(
    searchParams.get('date') || new Date().toISOString().split('T')[0],
  );
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [attendanceRecords, setAttendanceRecords] = useState({});
  const [savedRecordsSummary, setSavedRecordsSummary] = useState([]);
  const [isSaved, setIsSaved] = useState(false); // To track if the current record is already saved

  // Fetch active classes on component mount
  useEffect(() => {
    const fetchActiveClasses = async () => {
      setLoadingClasses(true);
      try {
        const fetchedClasses = await window.electronAPI.getClasses({ status: 'active' });
        setClasses(fetchedClasses);
      } catch (err) {
        console.error('Error fetching active classes:', err);
        toast.error('فشل تحميل قائمة الفصول النشطة.');
      } finally {
        setLoadingClasses(false);
      }
    };
    fetchActiveClasses();
  }, []); // Empty dependency array means this runs once on mount

  // Update URL search params when the selected class changes
  useEffect(() => {
    // Avoid updating URL on initial render if params are already set
    if (initialLoadRef.current && searchParams.get('classId')) {
      initialLoadRef.current = false;
      return;
    }

    const params = {};
    if (selectedClass) params.classId = selectedClass;
    if (selectedDate) params.date = selectedDate;

    // Use replace to avoid polluting browser history
    setSearchParams(params, { replace: true });
  }, [selectedClass, selectedDate, setSearchParams, searchParams]);

  // Fetch the summary of saved attendance records when a class is selected
  useEffect(() => {
    const fetchSavedRecordsSummary = async () => {
      if (!selectedClass) {
        setSavedRecordsSummary([]);
        return;
      }
      try {
        const summary = await window.electronAPI.getAttendanceSummaryForClass(selectedClass);
        setSavedRecordsSummary(summary);
      } catch (err) {
        console.error('Error fetching attendance summary:', err);
        toast.error('فشل تحميل قائمة الحضور المحفوظة.');
      }
    };
    fetchSavedRecordsSummary();
  }, [selectedClass]);

  // Fetch students and their attendance records when a class is selected
  const fetchStudentAndAttendanceData = useCallback(async () => {
    if (!selectedClass || !selectedDate) {
      setStudents([]);
      setAttendanceRecords({});
      return;
    }
    setLoadingStudents(true);
    try {
      const [fetchedStudents, existingRecords] = await Promise.all([
        window.electronAPI.getStudentsForClass(selectedClass),
        window.electronAPI.getAttendanceForDate(selectedClass, selectedDate),
      ]);

      setStudents(fetchedStudents);
      const initialRecords = fetchedStudents.reduce((acc, student) => {
        acc[student.id] = existingRecords[student.id] || 'present';
        return acc;
      }, {});
      setAttendanceRecords(initialRecords);
      setIsSaved(Object.keys(existingRecords).length > 0); // Set save status
    } catch (err) {
      console.error('Error fetching students or attendance:', err);
      toast.error('فشل تحميل بيانات الطلاب أو الحضور.');
    } finally {
      setLoadingStudents(false);
    }
  }, [selectedClass, selectedDate]);

  useEffect(() => {
    fetchStudentAndAttendanceData();
  }, [fetchStudentAndAttendanceData]);

  const handleClassChange = (e) => {
    setSelectedClass(e.target.value);
    setStudents([]);
  };

  const handleDateChange = (e) => {
    setSelectedDate(e.target.value);
    setStudents([]);
  };

  const handleStatusChange = (studentId, status) => {
    setAttendanceRecords((prev) => ({ ...prev, [studentId]: status }));
  };

  const handleSaveAttendance = async () => {
    if (!selectedClass || !selectedDate || Object.keys(attendanceRecords).length === 0) {
      toast.warn('الرجاء اختيار فصل وتحديد حالة الحضور للطلاب أولاً.');
      return;
    }
    setLoadingStudents(true); // Reuse student loading spinner for save operation
    try {
      await window.electronAPI.saveAttendance({
        classId: selectedClass,
        date: selectedDate,
        records: attendanceRecords,
      });
      setIsSaved(true); // Mark as saved
      // Refresh the summary list to include the new record if it wasn't there
      if (!savedRecordsSummary.some((rec) => rec.date === selectedDate)) {
        const summary = await window.electronAPI.getAttendanceSummaryForClass(selectedClass);
        setSavedRecordsSummary(summary);
      }
      toast.success('تم حفظ سجل الحضور بنجاح!');
    } catch (err) {
      console.error('Error saving attendance:', err);
      toast.error('فشل حفظ سجل الحضور.');
    } finally {
      setLoadingStudents(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>تسجيل الحضور والغياب</h1>
      </div>

      <Row>
        <Col md={8}>
          <div className="attendance-controls">
            <Form.Group as={Col} md="6" controlId="classSelect">
              <Form.Label>الفصل الدراسي:</Form.Label>
              <Form.Select
                value={selectedClass}
                onChange={handleClassChange}
                disabled={loadingClasses}
              >
                <option value="">-- اختر الفصل --</option>
                {classes.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name}
                  </option>
                ))}
              </Form.Select>
              {loadingClasses && <Spinner animation="border" size="sm" className="ms-2" />}
            </Form.Group>
            <Form.Group as={Col} md="4" controlId="dateSelect">
              <Form.Label>التاريخ:</Form.Label>
              <Form.Control type="date" value={selectedDate} onChange={handleDateChange} />
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
                    <th>الطالب</th>
                    <th>الحالة</th>
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
                            حضور
                          </Button>
                          <Button
                            variant={
                              attendanceRecords[student.id] === 'absent'
                                ? 'danger'
                                : 'outline-danger'
                            }
                            onClick={() => handleStatusChange(student.id, 'absent')}
                          >
                            غياب
                          </Button>
                          <Button
                            variant={
                              attendanceRecords[student.id] === 'late'
                                ? 'warning'
                                : 'outline-warning'
                            }
                            onClick={() => handleStatusChange(student.id, 'late')}
                          >
                            تأخر
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
                  <i className="fas fa-save me-2"></i>
                  حفظ التغييرات
                </Button>
              </div>
            </div>
          ) : (
            <Alert variant="info" className="mt-4 text-center">
              {!selectedClass
                ? 'الرجاء اختيار فصل دراسي لعرض قائمة الطلاب.'
                : 'لا يوجد طلاب مسجلون في هذا الفصل أو لم يتم تحديد تاريخ صالح.'}
            </Alert>
          )}
        </Col>
        <Col md={4}>
          <Card>
            <Card.Header as="h5">سجلات الحضور المحفوظة</Card.Header>
            <ListGroup variant="flush" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              {savedRecordsSummary.length > 0 ? (
                savedRecordsSummary.map((record) => (
                  <ListGroup.Item
                    key={record.date}
                    action
                    active={record.date === selectedDate}
                    onClick={() => setSelectedDate(record.date)}
                  >
                    <div className="d-flex justify-content-between">
                      <span>
                        {new Date(record.date).toLocaleDateString('ar-TN-u-ca-islamic', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </span>
                      <span className="badge bg-secondary">{record.record_count} طلاب</span>
                    </div>
                    <small className="text-muted">
                      {new Date(record.date).toLocaleDateString('en-GB')}
                    </small>
                  </ListGroup.Item>
                ))
              ) : (
                <ListGroup.Item>
                  {selectedClass ? 'لا توجد سجلات محفوظة لهذا الفصل.' : 'اختر فصلاً لعرض السجلات.'}
                </ListGroup.Item>
              )}
            </ListGroup>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

export default AttendancePage;
