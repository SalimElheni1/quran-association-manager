import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
import { toast } from 'react-toastify';
import '../styles/AttendancePage.css';

// Helper to get today's date in YYYY-MM-DD format
const getToday = () => new Date().toISOString().split('T')[0];

function AttendancePage() {
  // --- State Management ---
  const [seances, setSeances] = useState([]);
  const [students, setStudents] = useState([]);
  const [savedSheets, setSavedSheets] = useState([]);

  const [selectedSeance, setSelectedSeance] = useState('');
  const [selectedDate, setSelectedDate] = useState(getToday());

  // The currently loaded sheet object from the backend
  const [currentSheet, setCurrentSheet] = useState(null);
  // The attendance records for the current grid { studentId: status }
  const [attendanceRecords, setAttendanceRecords] = useState({});

  // Loading states
  const [loadingSeances, setLoadingSeances] = useState(true);
  const [loadingGrid, setLoadingGrid] = useState(false);
  const [loadingSavedSheets, setLoadingSavedSheets] = useState(true);

  // Dirty state tracking
  const [isDirty, setIsDirty] = useState(false);
  const [isNewRecord, setIsNewRecord] = useState(false);

  // --- Data Fetching ---

  // Fetch all active seances (classes) on mount
  useEffect(() => {
    const fetchSeances = async () => {
      try {
        const fetchedSeances = await window.electronAPI.classes.get({ status: 'active' });
        setSeances(fetchedSeances);
      } catch (err) {
        console.error('Error fetching seances:', err);
        toast.error('فشل في تحميل قائمة الحصص.');
      } finally {
        setLoadingSeances(false);
      }
    };
    fetchSeances();
  }, []);

  // Fetch all saved attendance sheets on mount
  const fetchSavedSheets = useCallback(async () => {
    setLoadingSavedSheets(true);
    try {
      // TODO: Add filters when UI supports them
      const sheets = await window.electronAPI.attendance.listSheets();
      setSavedSheets(sheets);
    } catch (err) {
      console.error('Error fetching saved sheets:', err);
      toast.error('فشل في تحميل قائمة السجلات المحفوظة.');
    } finally {
      setLoadingSavedSheets(false);
    }
  }, []);

  useEffect(() => {
    fetchSavedSheets();
  }, [fetchSavedSheets]);

  // Main logic to fetch data when seance or date changes
  const loadGridData = useCallback(async () => {
    if (!selectedSeance || !selectedDate) {
      setStudents([]);
      setAttendanceRecords({});
      setCurrentSheet(null);
      return;
    }

    setLoadingGrid(true);
    setIsDirty(false);
    setIsNewRecord(false);

    try {
      // 1. Try to get an existing sheet
      const existingSheet = await window.electronAPI.attendance.getSheet({
        seanceId: selectedSeance,
        date: selectedDate,
      });

      // 2. Fetch the list of students for the seance
      // This is needed in both cases (new or existing sheet)
      const fetchedStudents = await window.electronAPI.attendance.getStudentsForClass(
        selectedSeance,
      );
      setStudents(fetchedStudents);

      if (existingSheet) {
        // --- Load existing sheet ---
        setCurrentSheet(existingSheet);
        // Normalize entries from backend to simple { studentId: status } map
        const records = {};
        fetchedStudents.forEach((student) => {
          records[student.id] = existingSheet.entries[student.id]?.status || 'present'; // Default to present if student was added to class after sheet was made
        });
        setAttendanceRecords(records);
      } else {
        // --- Create a new, unsaved sheet ---
        setCurrentSheet(null); // No persistent sheet yet
        setIsNewRecord(true);
        // Default all students to 'present' for the new sheet
        const initialRecords = fetchedStudents.reduce((acc, student) => {
          acc[student.id] = 'present';
          return acc;
        }, {});
        setAttendanceRecords(initialRecords);
      }
    } catch (err) {
      console.error('Error loading grid data:', err);
      toast.error('فشل في تحميل بيانات الحضور.');
      setStudents([]);
      setAttendanceRecords({});
      setCurrentSheet(null);
    } finally {
      setLoadingGrid(false);
    }
  }, [selectedSeance, selectedDate]);

  useEffect(() => {
    loadGridData();
  }, [loadGridData]);

  // --- Event Handlers ---

  const handleStatusChange = (studentId, status) => {
    setAttendanceRecords((prev) => ({ ...prev, [studentId]: status }));
    setIsDirty(true); // Mark as dirty on any change
  };

  const handleBulkAction = (status) => {
    const newRecords = students.reduce((acc, student) => {
      acc[student.id] = status;
      return acc;
    }, {});
    setAttendanceRecords(newRecords);
    setIsDirty(true);
  };

  const handleSaveOrUpdate = async () => {
    if (!selectedSeance || students.length === 0) {
      toast.warn('الرجاء اختيار حصة تحتوي على طلاب.');
      return;
    }

    setLoadingGrid(true);
    try {
      if (currentSheet && currentSheet.id) {
        // --- Update existing sheet ---
        await window.electronAPI.attendance.updateSheet({
          sheetId: currentSheet.id,
          entries: attendanceRecords,
        });
        toast.success('تم تحديث سجل الحضور بنجاح!');
      } else {
        // --- Create new sheet ---
        const newSheet = await window.electronAPI.attendance.createSheet({
          seanceId: selectedSeance,
          date: selectedDate,
          entries: attendanceRecords,
          // userId: could be passed from auth context
        });
        setCurrentSheet({ ...newSheet, seance_id: selectedSeance, date: selectedDate }); // Update state with the newly created sheet ID
        toast.success('تم حفظ سجل الحضور بنجاح!');
      }
      setIsDirty(false);
      setIsNewRecord(false);
      // Refresh the list of saved sheets
      fetchSavedSheets();
    } catch (err) {
      console.error('Error saving attendance:', err);
      toast.error(`فشل في حفظ سجل الحضور: ${err.message}`);
    } finally {
      setLoadingGrid(false);
    }
  };

  const loadSheetFromSaved = (sheet) => {
    // This will trigger the main `useEffect` to load the data
    setSelectedSeance(sheet.seance_id);
    setSelectedDate(sheet.date);
  };

  const handleNewSheet = () => {
    // Simply reset the controls to today's date and clear the seance
    setSelectedDate(getToday());
    setSelectedSeance('');
    setCurrentSheet(null);
    setStudents([]);
    setAttendanceRecords({});
    setIsDirty(false);
    setIsNewRecord(false);
  };

  // --- Memoized Values ---

  const isSaveDisabled = useMemo(() => {
    return loadingGrid || !isDirty || students.length === 0;
  }, [loadingGrid, isDirty, students]);

  const pageTitle = useMemo(() => {
    if (!selectedSeance) return 'تسجيل الحضور';
    const seanceName = seances.find((s) => s.id === parseInt(selectedSeance))?.name || '';
    return `سجل حضور: ${seanceName} - ${selectedDate}`;
  }, [selectedSeance, selectedDate, seances]);

  // --- Render ---

  return (
    <div className="page-container attendance-page-grid">
      {/* --- Left Panel: Saved Records --- */}
      <Card className="saved-sheets-panel">
        <Card.Header as="h5">
          <i className="fas fa-history me-2"></i>
          السجلات المحفوظة
        </Card.Header>
        <Card.Body>
          {loadingSavedSheets ? (
            <div className="text-center">
              <Spinner animation="border" />
            </div>
          ) : (
            <ListGroup variant="flush">
              {savedSheets.length > 0 ? (
                savedSheets.map((sheet) => (
                  <ListGroup.Item
                    key={sheet.id}
                    action
                    onClick={() => loadSheetFromSaved(sheet)}
                    active={currentSheet?.id === sheet.id}
                  >
                    <div className="d-flex justify-content-between">
                      <strong>{sheet.seance_name}</strong>
                      <span className="text-muted">{sheet.date}</span>
                    </div>
                  </ListGroup.Item>
                ))
              ) : (
                <p className="text-muted text-center mt-3">لا توجد سجلات محفوظة.</p>
              )}
            </ListGroup>
          )}
        </Card.Body>
      </Card>

      {/* --- Right Panel: Main Content --- */}
      <div className="main-content">
        <div className="page-header">
          <h1>{pageTitle}</h1>
        </div>

        {/* --- Controls --- */}
        <Card className="mb-4">
          <Card.Body>
            <Row className="align-items-end">
              <Col md={5}>
                <Form.Group controlId="seanceSelect">
                  <Form.Label>اختر الحصة:</Form.Label>
                  <Form.Select
                    value={selectedSeance}
                    onChange={(e) => setSelectedSeance(e.target.value)}
                    disabled={loadingSeances}
                  >
                    <option value="">-- حدد الحصة --</option>
                    {seances.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col md={5}>
                <Form.Group controlId="dateSelect">
                  <Form.Label>اختر التاريخ:</Form.Label>
                  <Form.Control
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                  />
                </Form.Group>
              </Col>
              <Col md={2} className="d-flex justify-content-end">
                <Button variant="secondary" onClick={handleNewSheet}>
                  <i className="fas fa-plus me-2"></i> جديد
                </Button>
              </Col>
            </Row>
          </Card.Body>
        </Card>

        {isNewRecord && selectedSeance && (
          <Alert variant="info">
            <i className="fas fa-info-circle me-2"></i>
            أنت تقوم بإنشاء سجل حضور جديد. سيتم الحفظ عند الضغط على زر "حفظ".
          </Alert>
        )}

        {/* --- Attendance Grid --- */}
        {loadingGrid ? (
          <div className="text-center p-5">
            <Spinner animation="border" />
          </div>
        ) : students.length > 0 ? (
          <div className="attendance-roster">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <ButtonGroup>
                <Button variant="outline-success" onClick={() => handleBulkAction('present')}>
                  <i className="fas fa-check-circle me-2"></i> تحديد الكل كـ "حاضر"
                </Button>
                <Button variant="outline-danger" onClick={() => handleBulkAction('absent')}>
                  <i className="fas fa-times-circle me-2"></i> تحديد الكل كـ "غائب"
                </Button>
              </ButtonGroup>
              <Button variant="primary" size="lg" onClick={handleSaveOrUpdate} disabled={isSaveDisabled}>
                <i className="fas fa-save me-2"></i>
                {currentSheet?.id ? 'تحديث السجل' : 'حفظ السجل'}
              </Button>
            </div>
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
                            attendanceRecords[student.id] === 'absent'
                              ? 'danger'
                              : 'outline-danger'
                          }
                          onClick={() => handleStatusChange(student.id, 'absent')}
                        >
                          غائب
                        </Button>
                        <Button
                          variant={
                            attendanceRecords[student.id] === 'late'
                              ? 'warning'
                              : 'outline-warning'
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
          </div>
        ) : (
          <div className="attendance-roster-placeholder">
            <p>
              {!selectedSeance
                ? 'الرجاء اختيار حصة وتاريخ لعرض قائمة الطلاب.'
                : 'لا يوجد طلاب مسجلون في هذه الحصة.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default AttendancePage;
