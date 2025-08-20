import React, { useState, useEffect, useCallback } from 'react';
import { Form, Spinner, Alert, Button, Table, Card, ButtonGroup, InputGroup } from 'react-bootstrap';
import { toast } from 'react-toastify';
import '../styles/NewAttendancePage.css';

function NewAttendancePage() {
  const [loading, setLoading] = useState(false);
  const [classes, setClasses] = useState([]);
  const [selectedSeance, setSelectedSeance] = useState('');
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  const [students, setStudents] = useState([]);
  const [attendanceData, setAttendanceData] = useState({});
  const [sheetNotes, setSheetNotes] = useState('');
  const [isExistingSheet, setIsExistingSheet] = useState(false);
  const [sheetId, setSheetId] = useState(null);
  const [isSheetLoaded, setIsSheetLoaded] = useState(false);

  // State for saved records list
  const [savedSheets, setSavedSheets] = useState([]);
  const [loadingSavedSheets, setLoadingSavedSheets] = useState(false);
  const [filters, setFilters] = useState({
    seanceId: '',
    startDate: '',
    endDate: '',
  });

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters(prev => ({ ...prev, [name]: value }));
  };

  const fetchSavedSheets = async () => {
    setLoadingSavedSheets(true);
    try {
      const sheets = await window.electronAPI.getAttendanceSheets(filters);
      setSavedSheets(sheets);
    } catch (error) {
      console.error('Error fetching saved sheets:', error);
      toast.error('فشل في تحميل السجلات المحفوظة.');
    } finally {
      setLoadingSavedSheets(false);
    }
  };

  // Fetch initial list of saved sheets on mount
  useEffect(() => {
    fetchSavedSheets();
  }, []); // Fetches all sheets initially

  // Fetch active classes (seances) on component mount
  useEffect(() => {
    const fetchActiveClasses = async () => {
      try {
        const fetchedClasses = await window.electronAPI.getClasses({ status: 'active' });
        setClasses(fetchedClasses);
      } catch (err) {
        console.error('Error fetching active classes:', err);
        toast.error('فشل في تحميل قائمة الفصول النشطة.');
      }
    };
    fetchActiveClasses();
  }, []);

  // Reset state when seance or date changes
  useEffect(() => {
    setIsSheetLoaded(false);
    setStudents([]);
    setAttendanceData({});
    setSheetNotes('');
    setSheetId(null);
    setIsExistingSheet(false);
  }, [selectedSeance, selectedDate]);

  const handleLoadSheet = async () => {
    if (!selectedSeance || !selectedDate) {
      toast.warn('الرجاء اختيار حلقة وتاريخ أولاً.');
      return;
    }
    setLoading(true);
    setIsSheetLoaded(false);

    try {
      // First, get all students for the selected seance
      const enrolledStudents = (await window.electronAPI.getEnrollmentData({ classId: selectedSeance })).enrolledStudents;
      if (enrolledStudents.length === 0) {
        toast.info('لا يوجد طلاب مسجلون في هذه الحلقة.');
        setStudents([]);
        setAttendanceData({});
        setIsSheetLoaded(true);
        return;
      }
      setStudents(enrolledStudents);

      // Then, check for an existing attendance sheet
      const existingSheetData = await window.electronAPI.getAttendanceSheet(selectedSeance, selectedDate);

      if (existingSheetData) {
        // Sheet exists, load its data
        setAttendanceData(existingSheetData.entries || {});
        setSheetNotes(existingSheetData.sheet.notes || '');
        setSheetId(existingSheetData.sheet.id);
        setIsExistingSheet(true);
        toast.success('تم تحميل السجل المحفوظ بنجاح.');
      } else {
        // No sheet exists, prepare a new one
        const defaultEntries = enrolledStudents.reduce((acc, student) => {
          acc[student.id] = { status: 'present', notes: '' };
          return acc;
        }, {});
        setAttendanceData(defaultEntries);
        setSheetNotes('');
        setSheetId(null);
        setIsExistingSheet(false);
        toast.info('سجل جديد. سيتم إنشاؤه عند الحفظ.');
      }
      setIsSheetLoaded(true);
    } catch (error) {
      console.error('Error loading attendance sheet:', error);
      toast.error(`فشل تحميل السجل: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = useCallback((studentId, field, value) => {
    setAttendanceData((prev) => {
      const newEntry = { ...prev[studentId], [field]: value };
      // If status is 'present', clear the notes.
      if (field === 'status' && value === 'present') {
        newEntry.notes = '';
      }
      return { ...prev, [studentId]: newEntry };
    });
  }, []);

  const handleSave = async () => {
    setLoading(true);
    try {
      const sheetData = {
        seance_id: parseInt(selectedSeance, 10),
        date: selectedDate,
        notes: sheetNotes,
      };

      if (isExistingSheet) {
        // Update existing sheet
        await window.electronAPI.updateAttendanceSheet(sheetId, sheetData, attendanceData);
        toast.success('تم تحديث سجل الحضور بنجاح!');
      } else {
        // Create new sheet
        const result = await window.electronAPI.createAttendanceSheet(sheetData, attendanceData);
        // After creation, update state to reflect that it now exists
        setSheetId(result.sheetId);
        setIsExistingSheet(true);
        toast.success('تم حفظ سجل الحضور بنجاح!');
      }
    } catch (error) {
      console.error('Error saving attendance sheet:', error);
      toast.error(`فشل حفظ السجل: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>تسجيل الحضور (النظام الجديد)</h1>
        <p>
          حدد حلقة وتاريخاً لعرض أو إنشاء سجل حضور. سيتم تفعيل زر الحفظ بعد تحميل بيانات الطلاب.
        </p>
      </div>

      <Card className="mb-4">
        <Card.Header>
          <i className="fas fa-filter me-2"></i>
          اختيار سجل الحضور
        </Card.Header>
        <Card.Body>
          <div className="d-flex gap-3 align-items-end">
            <Form.Group controlId="seanceSelect" className="flex-grow-1">
              <Form.Label>اختر الحلقة (الفصل):</Form.Label>
              <Form.Select
                value={selectedSeance}
                onChange={(e) => setSelectedSeance(e.target.value)}
              >
                <option value="">-- حدد الحلقة --</option>
                {classes.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>

            <Form.Group controlId="dateSelect">
              <Form.Label>اختر التاريخ:</Form.Label>
              <Form.Control
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
            </Form.Group>

            <Button variant="primary" onClick={handleLoadSheet}>
              <i className="fas fa-cloud-download-alt me-2"></i>
              تحميل السجل
            </Button>
          </div>
        </Card.Body>
      </Card>

      {loading && (
        <div className="text-center p-5">
          <Spinner animation="border" role="status" />
          <p className="mt-2">جاري تحميل البيانات...</p>
        </div>
      )}

      {!loading && isSheetLoaded && (
        <Card>
          <Card.Header>
            <h5 className="mb-0">
              {isExistingSheet ? 'تعديل سجل الحضور' : 'إنشاء سجل حضور جديد'}
            </h5>
            <span className="text-muted">
              {`للحلقة: ${classes.find(c => c.id === parseInt(selectedSeance, 10))?.name || ''} - بتاريخ: ${selectedDate}`}
            </span>
          </Card.Header>
          <Card.Body>
            {students.length > 0 ? (
              <>
                <Table striped bordered hover responsive>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>اسم الطالب</th>
                      <th>حالة الحضور</th>
                      <th>ملاحظات</th>
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
                              variant={attendanceData[student.id]?.status === 'present' ? 'success' : 'outline-success'}
                              onClick={() => handleStatusChange(student.id, 'status', 'present')}
                            >
                              حاضر
                            </Button>
                            <Button
                              variant={attendanceData[student.id]?.status === 'absent' ? 'danger' : 'outline-danger'}
                              onClick={() => handleStatusChange(student.id, 'status', 'absent')}
                            >
                              غائب
                            </Button>
                            <Button
                              variant={attendanceData[student.id]?.status === 'late' ? 'warning' : 'outline-warning'}
                              onClick={() => handleStatusChange(student.id, 'status', 'late')}
                            >
                              متأخر
                            </Button>
                            <Button
                              variant={attendanceData[student.id]?.status === 'excused' ? 'info' : 'outline-info'}
                              onClick={() => handleStatusChange(student.id, 'status', 'excused')}
                            >
                              بإذن
                            </Button>
                          </ButtonGroup>
                        </td>
                        <td>
                          <Form.Control
                            type="text"
                            placeholder="سبب الغياب..."
                            value={attendanceData[student.id]?.notes || ''}
                            onChange={(e) => handleStatusChange(student.id, 'notes', e.target.value)}
                            disabled={attendanceData[student.id]?.status === 'present'}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
                <Form.Group className="mt-3">
                  <Form.Label>ملاحظات عامة على الجلسة</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={3}
                    value={sheetNotes}
                    onChange={(e) => setSheetNotes(e.target.value)}
                    placeholder="اكتب أي ملاحظات إضافية هنا..."
                  />
                </Form.Group>
              </>
            ) : (
              <Alert variant="warning">لا يوجد طلاب لعرضهم في هذه الحلقة.</Alert>
            )}
          </Card.Body>
          <Card.Footer className="text-center">
            <Button variant="primary" size="lg" onClick={handleSave} disabled={students.length === 0}>
              <i className="fas fa-save me-2"></i>
              {isExistingSheet ? 'تحديث السجل' : 'حفظ السجل'}
            </Button>
          </Card.Footer>
        </Card>
      )}

      {!loading && !isSheetLoaded && (
         <Alert variant="info" className="text-center">
            الرجاء الضغط على "تحميل السجل" لعرض قائمة الطلاب وتعبئة الحضور.
        </Alert>
      )}

      <hr className="my-4" />

      {/* Saved Records Section */}
      <Card>
        <Card.Header>
          <h5 className="mb-0">
            <i className="fas fa-history me-2"></i>
            سجلات الحضور المحفوظة
          </h5>
        </Card.Header>
        <Card.Body>
          <Form className="mb-3">
            <div className="d-flex flex-wrap gap-3">
              <Form.Group controlId="filterSeance" className="flex-grow-1">
                <Form.Label>تصفية حسب الحلقة:</Form.Label>
                <Form.Select name="seanceId" value={filters.seanceId} onChange={handleFilterChange}>
                  <option value="">-- كل الحلقات --</option>
                  {classes.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.name}
                    </option>
                  ))}
                </Form.Select>
              </Form.Group>
              <Form.Group controlId="filterStartDate">
                <Form.Label>من تاريخ:</Form.Label>
                <Form.Control type="date" name="startDate" value={filters.startDate} onChange={handleFilterChange} />
              </Form.Group>
              <Form.Group controlId="filterEndDate">
                <Form.Label>إلى تاريخ:</Form.Label>
                <Form.Control type="date" name="endDate" value={filters.endDate} onChange={handleFilterChange} />
              </Form.Group>
              <div className="align-self-end">
                <Button variant="info" onClick={fetchSavedSheets}>
                  <i className="fas fa-search me-2"></i>
                  بحث
                </Button>
              </div>
            </div>
          </Form>

          {loadingSavedSheets ? (
            <div className="text-center"><Spinner animation="border" /></div>
          ) : savedSheets.length > 0 ? (
            <Table striped bordered hover responsive>
              <thead>
                <tr>
                  <th>التاريخ</th>
                  <th>الحلقة</th>
                  <th>المدرس</th>
                  <th>الحضور</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {savedSheets.map(sheet => (
                  <tr key={sheet.id}>
                    <td>{sheet.date}</td>
                    <td>{sheet.seance_name}</td>
                    <td>{sheet.teacher_name || 'غير محدد'}</td>
                    <td>{sheet.present_count} / {sheet.student_count}</td>
                    <td>
                      <Button
                        variant="outline-primary"
                        size="sm"
                        onClick={() => {
                          setSelectedSeance(sheet.seance_id);
                          setSelectedDate(sheet.date);
                          // Scroll to top and load
                          window.scrollTo(0, 0);
                          // Use a timeout to ensure state update before loading
                          setTimeout(() => handleLoadSheet(), 0);
                        }}
                      >
                        <i className="fas fa-eye me-1"></i> عرض / تعديل
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <Alert variant="secondary" className="text-center">
              لم يتم العثور على سجلات محفوظة تطابق معايير البحث.
            </Alert>
          )}
        </Card.Body>
      </Card>
    </div>
  );
}

export default NewAttendancePage;
