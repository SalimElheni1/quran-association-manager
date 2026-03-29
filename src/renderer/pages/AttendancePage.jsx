import React, { useState, useEffect, useCallback, useRef } from 'react';
import { error as logError } from '@renderer/utils/logger';
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
  Modal,
} from 'react-bootstrap';
import { useSearchParams } from 'react-router-dom';
import '@renderer/styles/AttendancePage.css';
import { toast } from 'react-toastify';
import EditIcon from '@renderer/components/icons/EditIcon';
import SaveIcon from '@renderer/components/icons/SaveIcon';
import TimesIcon from '@renderer/components/icons/TimesIcon';
import ExportModal from '@renderer/components/modals/ExportModal';
import ImportModal from '@renderer/components/modals/ImportModal';
import TablePagination from '@renderer/components/common/TablePagination';
import { usePermissions } from '@renderer/hooks/usePermissions';
import { PERMISSIONS } from '@renderer/utils/permissions';
import ExportIcon from '@renderer/components/icons/ExportIcon';
import ImportIcon from '@renderer/components/icons/ImportIcon';
import UserCircleIcon from '@renderer/components/icons/UserCircleIcon';
import { OverlayTrigger, Tooltip } from 'react-bootstrap';

const attendanceFields = [
  { key: 'student_name', label: 'اسم الطالب' },
  { key: 'class_name', label: 'اسم الفصل' },
  { key: 'date', label: 'التاريخ' },
  { key: 'status', label: 'الحالة' },
];

function AttendancePage() {
  const { hasPermission } = usePermissions();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialLoadRef = useRef(true);

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
  const [isSaved, setIsSaved] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [selectedStudentForContact, setSelectedStudentForContact] = useState(null);

  // Pagination for Student Roster
  const [rosterPage, setRosterPage] = useState(1);
  const [rosterPageSize, setRosterPageSize] = useState(10);

  // For Student History Search
  const [viewMode, setViewMode] = useState('class'); // 'class' or 'student'
  const [studentSearch, setStudentSearch] = useState('');
  const [searchedStudents, setSearchedStudents] = useState([]);
  const [selectedHistoryStudent, setSelectedHistoryStudent] = useState(null);
  const [studentHistory, setStudentHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Pagination for History
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPageSize, setHistoryPageSize] = useState(10);

  useEffect(() => {
    const fetchActiveClasses = async () => {
      setLoadingClasses(true);
      try {
        const fetchedClasses = await window.electronAPI.getClasses({ status: 'active' });
        setClasses(fetchedClasses);
      } catch (err) {
        logError('Error fetching active classes:', err);
        toast.error('فشل تحميل قائمة الفصول النشطة.');
      } finally {
        setLoadingClasses(false);
      }
    };
    fetchActiveClasses();
  }, []);

  useEffect(() => {
    if (initialLoadRef.current && searchParams.get('classId')) {
      initialLoadRef.current = false;
      return;
    }

    const params = {};
    if (selectedClass) params.classId = selectedClass;
    if (selectedDate) params.date = selectedDate;

    setSearchParams(params, { replace: true });
  }, [selectedClass, selectedDate, setSearchParams, searchParams]);

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
        logError('Error fetching attendance summary:', err);
        toast.error('فشل تحميل قائمة الحضور المحفوظة.');
      }
    };
    fetchSavedRecordsSummary();
  }, [selectedClass]);

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

      const isExistingRecord = Object.keys(existingRecords).length > 0;
      setIsSaved(isExistingRecord);
      setIsEditMode(!isExistingRecord);
      setRosterPage(1); // Reset to first page
    } catch (err) {
      logError('Error fetching students or attendance:', err);
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

  const handleCancelEdit = () => {
    fetchStudentAndAttendanceData();
    setIsEditMode(false);
    toast.info('تم إلغاء التعديلات.');
  };

  const handleSaveAttendance = async () => {
    if (!selectedClass || !selectedDate || Object.keys(attendanceRecords).length === 0) {
      toast.warn('الرجاء اختيار فصل وتحديد حالة الحضور للطلاب أولاً.');
      return;
    }
    setLoadingStudents(true);
    try {
      await window.electronAPI.saveAttendance({
        classId: selectedClass,
        date: selectedDate,
        records: attendanceRecords,
      });
      setIsSaved(true);
      if (!savedRecordsSummary.some((rec) => rec.date === selectedDate)) {
        const summary = await window.electronAPI.getAttendanceSummaryForClass(selectedClass);
        setSavedRecordsSummary(summary);
      }
      toast.success('تم حفظ سجل الحضور بنجاح!');
      setIsEditMode(false);
    } catch (err) {
      logError('Error saving attendance:', err);
      toast.error('فشل حفظ سجل الحضور.');
    } finally {
      setLoadingStudents(false);
    }
  };

  const fetchStudentHistory = async (studentId) => {
    setLoadingHistory(true);
    try {
      const history = await window.electronAPI.getAttendanceHistoryByStudent(studentId);
      setStudentHistory(history);
      setHistoryPage(1); // Reset to first page
    } catch (err) {
      logError('Error fetching student history:', err);
      toast.error('فشل تحميل سجل حضور الطالب.');
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleStudentSearch = async (e) => {
    const term = e.target.value;
    setStudentSearch(term);
    if (term.length > 1) {
      try {
        const results = await window.electronAPI.getStudents({ searchTerm: term, limit: 50 });
        setSearchedStudents(results.students || []);
      } catch (err) {
        logError('Error searching students:', err);
        setSearchedStudents([]);
      }
    } else {
      setSearchedStudents([]);
    }
  };

  const selectStudentForHistory = (student) => {
    setSelectedHistoryStudent(student);
    setStudentSearch('');
    setSearchedStudents([]);
    fetchStudentHistory(student.id);
  };

  const handleShowContact = (student) => {
    setSelectedStudentForContact(student);
    setShowContactModal(true);
  };

  // Pagination logic for Roster
  const totalRosterItems = students.length;
  const rosterStartIndex = (rosterPage - 1) * rosterPageSize;
  const paginatedStudents = students.slice(rosterStartIndex, rosterStartIndex + rosterPageSize);

  // Pagination logic for History
  const totalHistoryItems = studentHistory.length;
  const historyStartIndex = (historyPage - 1) * historyPageSize;
  const paginatedHistory = studentHistory.slice(historyStartIndex, historyStartIndex + historyPageSize);

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>تسجيل الحضور والغياب</h1>
        <div className="page-header-actions">
          <ButtonGroup className="me-3">
            <Button
              variant={viewMode === 'class' ? 'primary' : 'outline-primary'}
              onClick={() => setViewMode('class')}
            >
              عرض حسب الفصل
            </Button>
            <Button
              variant={viewMode === 'student' ? 'primary' : 'outline-primary'}
              onClick={() => setViewMode('student')}
            >
              عرض حسب الطالب
            </Button>
          </ButtonGroup>
          {hasPermission(PERMISSIONS.ATTENDANCE_VIEW) && (
            <Button variant="outline-primary" onClick={() => setShowExportModal(true)} className="me-2">
              <ExportIcon className="ms-2" /> تصدير البيانات
            </Button>
          )}
          {hasPermission(PERMISSIONS.ATTENDANCE_CREATE) && (
            <Button variant="outline-success" onClick={() => setShowImportModal(true)}>
              <ImportIcon className="ms-2" /> استيراد البيانات
            </Button>
          )}
        </div>
      </div>

      {viewMode === 'class' ? (
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
              <div className="d-flex justify-content-between align-items-center mb-3">
                <h4 className="mb-0">{isEditMode ? 'تعديل سجل الحضور' : 'عرض سجل الحضور'}</h4>
                <div>
                  {isSaved && !isEditMode && (
                    <Button variant="secondary" onClick={() => setIsEditMode(true)}>
                      <EditIcon className="me-2" />
                      تعديل
                    </Button>
                  )}
                </div>
              </div>

              {!isEditMode && isSaved && (
                <Alert variant="info">
                  هذا السجل محفوظ ومغلق للتعديل. اضغط على زر "تعديل" لتغيير حالة الحضور.
                </Alert>
              )}

              <Table striped bordered hover responsive>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>الطالب</th>
                    <th>معلومات الاتصال</th>
                    <th>الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedStudents.map((student, index) => (
                    <tr key={student.id}>
                      <td>{rosterStartIndex + index + 1}</td>
                      <td>{student.name}</td>
                      <td>
                        {(student.contact_info || student.parent_contact) && (
                          <span
                            style={{ cursor: 'pointer', color: '#007bff' }}
                            onClick={() => handleShowContact(student)}
                          >
                            <UserCircleIcon width={18} height={18} className="me-1" />
                            عرض الاتصال
                          </span>
                        )}
                      </td>
                      <td>
                          <ButtonGroup size="sm">
                            <Button
                              variant={
                                attendanceRecords[student.id] === 'present'
                                  ? 'success'
                                  : 'outline-success'
                              }
                              onClick={() => handleStatusChange(student.id, 'present')}
                              disabled={!isEditMode}
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
                              disabled={!isEditMode}
                            >
                              غائب
                            </Button>
                          </ButtonGroup>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
              
              <TablePagination
                currentPage={rosterPage}
                totalPages={Math.ceil(totalRosterItems / rosterPageSize)}
                totalItems={totalRosterItems}
                pageSize={rosterPageSize}
                onPageChange={setRosterPage}
                onPageSizeChange={(size) => { setRosterPageSize(size); setRosterPage(1); }}
              />

              {isEditMode && (
                <div className="text-center mt-3">
                  <Button
                    variant="primary"
                    size="lg"
                    onClick={handleSaveAttendance}
                    disabled={loadingStudents}
                    className="me-3"
                  >
                    <SaveIcon className="me-2" />
                    حفظ التغييرات
                  </Button>
                  <Button
                    variant="outline-secondary"
                    size="lg"
                    onClick={handleCancelEdit}
                    disabled={loadingStudents}
                  >
                    <TimesIcon className="me-2" />
                    إلغاء
                  </Button>
                </div>
              )}
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
      ) : (
        <Row>
          <Col md={12}>
            <Card className="mb-4">
              <Card.Body>
                <h4 className="mb-3">البحث في سجل حضور الطالب</h4>
                <div className="position-relative">
                  <Form.Control
                    type="text"
                    placeholder="ابحث عن اسم الطالب أو رقم القيد..."
                    value={studentSearch}
                    onChange={handleStudentSearch}
                  />
                  {searchedStudents.length > 0 && (
                    <ListGroup className="position-absolute w-100 shadow-sm" style={{ zIndex: 1000, top: '100%' }}>
                      {searchedStudents.map((s) => (
                        <ListGroup.Item
                          key={s.id}
                          action
                          onClick={() => selectStudentForHistory(s)}
                        >
                          {s.name} ({s.matricule})
                        </ListGroup.Item>
                      ))}
                    </ListGroup>
                  )}
                </div>
              </Card.Body>
            </Card>

            {selectedHistoryStudent && (
              <Card>
                <Card.Header className="d-flex justify-content-between align-items-center">
                  <h5 className="mb-0">سجل حضور: {selectedHistoryStudent.name}</h5>
                  <span className="badge bg-secondary">رقم القيد: {selectedHistoryStudent.matricule}</span>
                </Card.Header>
                <Card.Body>
                  {loadingHistory ? (
                    <div className="text-center p-4">
                      <Spinner animation="border" />
                    </div>
                  ) : studentHistory.length > 0 ? (
                    <>
                      <Row className="mb-4 text-center">
                        <Col md={3}>
                          <div className="p-3 border rounded bg-light">
                            <div className="text-muted mb-1">إجمالي الحصص</div>
                            <h4 className="mb-0">{studentHistory.length}</h4>
                          </div>
                        </Col>
                        <Col md={3}>
                          <div className="p-3 border rounded bg-light">
                            <div className="text-muted mb-1">حضور</div>
                            <h4 className="mb-0 text-success">
                              {studentHistory.filter(r => r.status === 'present').length}
                            </h4>
                          </div>
                        </Col>
                        <Col md={3}>
                          <div className="p-3 border rounded bg-light">
                            <div className="text-muted mb-1">غياب</div>
                            <h4 className="mb-0 text-danger">
                              {studentHistory.filter(r => r.status === 'absent').length}
                            </h4>
                          </div>
                        </Col>
                        <Col md={3}>
                          <div className="p-3 border rounded bg-light">
                            <div className="text-muted mb-1">نسبة الحضور</div>
                            <h4 className="mb-0 text-info">
                              {Math.round((studentHistory.filter(r => r.status === 'present').length / studentHistory.length) * 100)}%
                            </h4>
                          </div>
                        </Col>
                      </Row>
                      
                      {/* Contact Info Card */}
                      {(selectedHistoryStudent.contact_info || selectedHistoryStudent.parent_contact) && (
                        <Card className="mb-4 bg-light border-0 shadow-sm">
                          <Card.Body>
                            <h6 className="mb-3"><UserCircleIcon width={20} height={20} className="me-2" />معلومات الاتصال</h6>
                            <Row>
                              <Col md={4}>
                                <div className="mb-2"><strong>رقم هاتف الطالب:</strong></div>
                                <div>{selectedHistoryStudent.contact_info || 'غير متوفر'}</div>
                              </Col>
                              <Col md={4}>
                                <div className="mb-2"><strong>إسم ولي الأمر:</strong></div>
                                <div>{selectedHistoryStudent.parent_name || 'غير متوفر'}</div>
                              </Col>
                              <Col md={4}>
                                <div className="mb-2"><strong>رقم هاتف الولي:</strong></div>
                                <div>{selectedHistoryStudent.parent_contact || 'غير متوفر'}</div>
                              </Col>
                            </Row>
                          </Card.Body>
                        </Card>
                      )}

                      <Table striped bordered hover responsive>
                      <thead>
                        <tr>
                          <th>التاريخ</th>
                          <th>الفصل</th>
                          <th>الحالة</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedHistory.map((record, index) => {
                          const statusLabels = {
                            present: { label: 'حاضر', variant: 'success' },
                            absent: { label: 'غائب', variant: 'danger' },
                          };
                          const status = statusLabels[record.status] || { label: record.status, variant: 'secondary' };

                          return (
                            <tr key={historyStartIndex + index}>
                              <td>
                                {new Date(record.date).toLocaleDateString('ar-TN', {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                })}
                              </td>
                              <td>{record.class_name || 'غير معروف'}</td>
                              <td>
                                <span className={`badge bg-${status.variant}`}>
                                  {status.label}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      </Table>

                      <TablePagination
                        currentPage={historyPage}
                        totalPages={Math.ceil(totalHistoryItems / historyPageSize)}
                        totalItems={totalHistoryItems}
                        pageSize={historyPageSize}
                        onPageChange={setHistoryPage}
                        onPageSizeChange={(size) => { setHistoryPageSize(size); setHistoryPage(1); }}
                      />
                    </>
                  ) : (
                    <Alert variant="info" className="text-center">
                      لا يوجد سجل حضور لهذا الطالب.
                    </Alert>
                  )}
                </Card.Body>
              </Card>
            )}
          </Col>
        </Row>
      )}
      <ExportModal
        show={showExportModal}
        handleClose={() => setShowExportModal(false)}
        exportType="attendance"
        fields={attendanceFields}
        isAttendance={true}
        title="تصدير سجل الحضور"
      />

      <ImportModal
        show={showImportModal}
        handleClose={() => setShowImportModal(false)}
        importType="الحضور"
        title="استيراد سجل الحضور"
      />

      <Modal
        show={showContactModal}
        onHide={() => setShowContactModal(false)}
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>معلومات الاتصال: {selectedStudentForContact?.name}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {selectedStudentForContact && (
            <div className="contact-details p-3 text-end" dir="rtl">
              <div className="mb-4">
                <h6 className="text-muted mb-2">الطالب:</h6>
                <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>
                  {selectedStudentForContact.contact_info || 'غير متوفر'}
                </div>
              </div>
              <hr />
              <div className="mb-3">
                <h6 className="text-muted mb-2">ولي الأمر:</h6>
                <div style={{ fontSize: '1.1rem' }}>
                  {selectedStudentForContact.parent_name || 'غير متوفر'}
                </div>
              </div>
              <div>
                <h6 className="text-muted mb-2">هاتف الولي:</h6>
                <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>
                  {selectedStudentForContact.parent_contact || 'غير متوفر'}
                </div>
              </div>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowContactModal(false)}>
            إغلاق
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}

export default AttendancePage;
