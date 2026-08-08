import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Spinner, Form, InputGroup, Badge, Tabs, Tab, Row, Col, Modal, Alert, Card } from 'react-bootstrap';
import { toast } from 'react-toastify';
import ClassFormModal from '@renderer/components/ClassFormModal';
import ConfirmationModal from '@renderer/components/common/ConfirmationModal';
import ClassDetailsModal from '@renderer/components/ClassDetailsModal';
import EnrollmentModal from '@renderer/components/EnrollmentModal';
import TablePagination from '@renderer/components/common/TablePagination';
import ExportModal from '@renderer/components/modals/ExportModal';
import ImportModal from '@renderer/components/modals/ImportModal';
import '@renderer/styles/StudentsPage.css';
import { error as logError } from '@renderer/utils/logger';
import PlusIcon from '@renderer/components/icons/PlusIcon';
import SearchIcon from '@renderer/components/icons/SearchIcon';
import UserPlusIcon from '@renderer/components/icons/UserPlusIcon';
import EyeIcon from '@renderer/components/icons/EyeIcon';
import EditIcon from '@renderer/components/icons/EditIcon';
import TrashIcon from '@renderer/components/icons/TrashIcon';
import ExportIcon from '@renderer/components/icons/ExportIcon';
import ImportIcon from '@renderer/components/icons/ImportIcon';
import { usePermissions } from '@renderer/hooks/usePermissions';
import { PERMISSIONS } from '@renderer/utils/permissions';

const classesFields = [
  { key: 'name', label: 'اسم الفصل' },
  { key: 'teacher_name', label: 'المعلم المسؤول' },
  { key: 'schedule', label: 'الجدول الزمني' },
  { key: 'age_group_name', label: 'فئة العمر' },
  { key: 'status', label: 'الحالة' },
];

const dayTranslations = {
  Monday: 'الإثنين',
  Tuesday: 'الثلاثاء',
  Wednesday: 'الأربعاء',
  Thursday: 'الخميس',
  Friday: 'الجمعة',
  Saturday: 'السبت',
  Sunday: 'الأحد',
};

const daysOfWeekList = [
  { value: 'Monday', label: 'الإثنين' },
  { value: 'Tuesday', label: 'الثلاثاء' },
  { value: 'Wednesday', label: 'الأربعاء' },
  { value: 'Thursday', label: 'الخميس' },
  { value: 'Friday', label: 'الجمعة' },
  { value: 'Saturday', label: 'السبت' },
  { value: 'Sunday', label: 'الأحد' },
];

function ClassesPage() {
  const { hasPermission } = usePermissions();
  const [activeTab, setActiveTab] = useState('classes-list');

  // Existing classes states
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingClass, setEditingClass] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [classToDelete, setClassToDelete] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [classToView, setClassToView] = useState(null);
  const [showEnrollmentModal, setShowEnrollmentModal] = useState(false);
  const [classToEnroll, setClassToEnroll] = useState(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalClasses, setTotalClasses] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // NEW Timetable & Classroom states
  const [classrooms, setClassrooms] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [showClassroomModal, setShowClassroomModal] = useState(false);
  const [newClassroom, setNewClassroom] = useState({ name: '', capacity: '', notes: '' });

  // Séance Creator states
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [newSession, setNewSession] = useState({
    classId: '',
    dayOfWeek: 'Monday',
    startTime: '08:00',
    endTime: '10:00',
    classroomId: '',
  });
  const [schedulingConflicts, setSchedulingConflicts] = useState([]);
  const [isCheckingConflicts, setIsCheckingConflicts] = useState(false);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const fetchClasses = useCallback(async () => {
    setLoading(true);
    try {
      const filters = {
        searchTerm,
        page: currentPage,
        limit: pageSize,
      };
      const result = await window.electronAPI.getClasses(filters);
      if (result && result.classes) {
        setClasses(result.classes);
        setTotalClasses(result.total);
        setTotalPages(result.totalPages);
      } else {
        setClasses(result);
        setTotalClasses(result.length);
        setTotalPages(1);
      }
    } catch (err) {
      logError('Error fetching classes:', err);
      toast.error('فشل تحميل بيانات الفصول الدراسية.');
    } finally {
      setLoading(false);
    }
  }, [searchTerm, currentPage, pageSize]);

  // Fetch classrooms
  const fetchClassrooms = async () => {
    try {
      const data = await window.electronAPI.getClassrooms();
      setClassrooms(data || []);
    } catch (err) {
      console.error('Error fetching classrooms:', err);
    }
  };

  // Fetch class sessions
  const fetchClassSessions = async () => {
    try {
      const data = await window.electronAPI.getClassSessions();
      setSessions(data || []);
    } catch (err) {
      console.error('Error fetching class sessions:', err);
    }
  };

  useEffect(() => {
    fetchClasses();
    fetchClassrooms();
    fetchClassSessions();
  }, [fetchClasses, activeTab]);

  // Subscribe to import completion events
  useEffect(() => {
    const lastHandledAtRef = { current: 0 };
    const domHandler = (e) => {
      try {
        const now = Date.now();
        if (now - lastHandledAtRef.current < 1200) return;
        const sheets = e?.detail?.sheets || [];
        if (sheets.includes('الفصول')) {
          lastHandledAtRef.current = now;
          fetchClasses();
          fetchClassSessions();
          toast.info('تم تحديث قائمة الفصول بعد الاستيراد.');
        }
      } catch (err) {
        logError('Error handling DOM import-completed in ClassesPage:', err);
      }
    };

    let unsubscribe = null;
    try {
      if (window.electronAPI && typeof window.electronAPI.onImportCompleted === 'function') {
        unsubscribe = window.electronAPI.onImportCompleted((payload) => {
          try {
            const now = Date.now();
            if (now - lastHandledAtRef.current < 1200) return;
            const sheets = payload?.sheets || [];
            if (sheets.includes('الفصول')) {
              lastHandledAtRef.current = now;
              fetchClasses();
              fetchClassSessions();
              toast.info('تم تحديث قائمة الفصول بعد الاستيراد.');
            }
          } catch (err) {
            logError('Error handling import-completed IPC payload in ClassesPage:', err);
          }
        });
      }
    } catch (err) {
      logError('Failed to register import completion IPC listener in ClassesPage:', err);
    }

    window.addEventListener('app:import-completed', domHandler);
    return () => {
      window.removeEventListener('app:import-completed', domHandler);
      try {
        if (typeof unsubscribe === 'function') unsubscribe();
      } catch (e) {
        /* ignore */
      }
    };
  }, [fetchClasses]);

  const handleShowAddModal = () => {
    setEditingClass(null);
    setShowModal(true);
  };

  const handleShowEditModal = async (classData) => {
    try {
      const fullClassData = await window.electronAPI.getClassById(classData.id);
      setEditingClass(fullClassData);
    } catch (err) {
      logError('Error fetching full class details for edit:', err);
      toast.error('فشل تحميل بيانات الفصل للتعديل.');
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingClass(null);
  };

  const handleShowDetailsModal = async (classData) => {
    try {
      const fullClassData = await window.electronAPI.getClassById(classData.id);
      setClassToView(fullClassData);
      setShowDetailsModal(true);
    } catch (err) {
      logError('Error fetching full class details:', err);
      toast.error('فشل تحميل التفاصيل الكاملة للفصل.');
    }
  };

  const handleCloseDetailsModal = () => {
    setShowDetailsModal(false);
    setClassToView(null);
  };

  const handleShowEnrollmentModal = (classData) => {
    setClassToEnroll(classData);
    setShowEnrollmentModal(true);
  };

  const handleSaveClass = async (formData, classId) => {
    try {
      if (classId) {
        await window.electronAPI.updateClass(classId, formData);
        toast.success(`تم تحديث بيانات الفصل "${formData.name}" بنجاح!`);
      } else {
        await window.electronAPI.addClass(formData);
        toast.success(`تمت إضافة الفصل "${formData.name}" بنجاح!`);
      }
      fetchClasses();
      handleCloseModal();
    } catch (err) {
      logError('Error saving class:', err);
      const friendlyMessage = err.message.split('Error:').pop().trim();
      toast.error(friendlyMessage);
    }
  };

  const handleDeleteRequest = (classData) => {
    setClassToDelete(classData);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!classToDelete) return;
    try {
      await window.electronAPI.deleteClass(classToDelete.id);
      toast.success(`تم حذف الفصل "${classToDelete.name}" بنجاح.`);
      fetchClasses();
      fetchClassSessions();
    } catch (err) {
      logError('Error deleting class:', err);
      toast.error(`فشل حذف الفصل "${classToDelete.name}".`);
    } finally {
      setShowDeleteModal(false);
      classToDelete(null);
    }
  };

  const formatSchedule = (scheduleJSON) => {
    if (!scheduleJSON || scheduleJSON === '[]') return 'غير حدد';
    try {
      const scheduleArray = JSON.parse(scheduleJSON);
      if (!Array.isArray(scheduleArray) || scheduleArray.length === 0) return 'غير محدد';
      return scheduleArray
        .map((item) => `${dayTranslations[item.day] || item.day}: ${item.time}`)
        .join(' | ');
    } catch (e) {
      return 'جدول غير صالح';
    }
  };

  const renderStatusBadge = (status) => {
    const variants = {
      'قيد الانتظار': 'warning',
      نشط: 'success',
      مكتمل: 'secondary',
    };
    const bgColor = variants[status] || 'light';
    const textColor = bgColor === 'white';
    return (
      <Badge bg={bgColor} text={textColor} className="p-2">
        {status}
      </Badge>
    );
  };

  // --- CLASSROOMS HANDLERS ---
  const handleAddClassroom = async (e) => {
    e.preventDefault();
    if (!newClassroom.name) {
      toast.error('اسم القاعة مطلوب.');
      return;
    }
    try {
      await window.electronAPI.addClassroom(newClassroom);
      toast.success('تمت إضافة القاعة بنجاح.');
      setNewClassroom({ name: '', capacity: '', notes: '' });
      setShowClassroomModal(false);
      fetchClassrooms();
    } catch (err) {
      toast.error(err.message || 'فشل إضافة القاعة.');
    }
  };

  const handleDeleteClassroom = async (id) => {
    if (!window.confirm('هل أنت متأكد من حذف هذه القاعة؟')) return;
    try {
      await window.electronAPI.deleteClassroom(id);
      toast.success('تم حذف القاعة بنجاح.');
      fetchClassrooms();
      fetchClassSessions();
    } catch (err) {
      toast.error('فشل حذف القاعة.');
    }
  };

  // --- SÉANCE SESSIONS HANDLERS ---
  const handleOpenSessionModal = (day = 'Monday', time = '08:00') => {
    // Round end time automatically (+2 hours)
    let endHour = parseInt(time.split(':')[0]) + 2;
    if (endHour > 23) endHour = 23;
    const formattedEnd = `${endHour.toString().padStart(2, '0')}:00`;

    setNewSession({
      classId: classes[0]?.id || '',
      dayOfWeek: day,
      startTime: time,
      endTime: formattedEnd,
      classroomId: classrooms[0]?.id || '',
    });
    setSchedulingConflicts([]);
    setShowSessionModal(true);
  };

  // Trigger conflict checks on input updates
  const handleCheckConflicts = async (sessionData) => {
    if (!sessionData.classId || !sessionData.startTime || !sessionData.endTime) return;
    setIsCheckingConflicts(true);
    try {
      const result = await window.electronAPI.checkClassSessionConflicts({
        classId: parseInt(sessionData.classId),
        dayOfWeek: sessionData.dayOfWeek,
        startTime: sessionData.startTime,
        endTime: sessionData.endTime,
        classroomId: sessionData.classroomId ? parseInt(sessionData.classroomId) : null,
      });
      if (result && result.hasConflict) {
        setSchedulingConflicts(result.conflicts);
      } else {
        setSchedulingConflicts([]);
      }
    } catch (err) {
      console.error('Error checking conflicts:', err);
    } finally {
      setIsCheckingConflicts(false);
    }
  };

  useEffect(() => {
    if (showSessionModal) {
      handleCheckConflicts(newSession);
    }
  }, [newSession.classId, newSession.dayOfWeek, newSession.startTime, newSession.endTime, newSession.classroomId, showSessionModal]);

  const handleSaveSession = async () => {
    if (!newSession.classId) {
      toast.error('الرجاء اختيار الفصل الدراسي.');
      return;
    }
    try {
      await window.electronAPI.addClassSession({
        classId: parseInt(newSession.classId),
        dayOfWeek: newSession.dayOfWeek,
        startTime: newSession.startTime,
        endTime: newSession.endTime,
        classroomId: newSession.classroomId ? parseInt(newSession.classroomId) : null,
      });
      toast.success('تمت إضافة الحصة بنجاح.');
      setShowSessionModal(false);
      fetchClassSessions();
    } catch (err) {
      toast.error(err.message || 'فشل إضافة الحصة.');
    }
  };

  const handleDeleteSession = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('هل أنت متأكد من حذف هذه الحصة؟')) return;
    try {
      await window.electronAPI.deleteClassSession(id);
      toast.success('تم حذف الحصة بنجاح.');
      fetchClassSessions();
    } catch (err) {
      toast.error('فشل حذف الحصة.');
    }
  };

  const handlePrintTimetable = () => {
    window.print();
  };

  // Filter sessions by weekday
  const getSessionsForDay = (dayValue) => {
    return sessions.filter((s) => s.day_of_week === dayValue);
  };

  return (
    <div className="page-container">
      {/* Printable Area Wrapper */}
      <div className="d-print-none">
        <div className="page-header">
          <h1>شؤون الفصول والجدولة</h1>
          <div className="page-header-actions">
            {activeTab === 'classes-list' && hasPermission(PERMISSIONS.CLASSES_VIEW) && (
              <Button variant="outline-primary" onClick={() => setShowExportModal(true)}>
                <ExportIcon className="ms-2" /> تصدير البيانات
              </Button>
            )}
            {activeTab === 'classes-list' && hasPermission(PERMISSIONS.CLASSES_CREATE) && (
              <Button variant="outline-success" onClick={() => setShowImportModal(true)}>
                <ImportIcon className="ms-2" /> استيراد البيانات
              </Button>
            )}
            {activeTab === 'classes-list' && hasPermission(PERMISSIONS.CLASSES_CREATE) && (
              <Button variant="primary" onClick={handleShowAddModal}>
                <PlusIcon className="ms-2" /> إضافة فصل
              </Button>
            )}
            {activeTab === 'timetable-grid' && (
              <>
                <Button variant="outline-primary" onClick={handlePrintTimetable} className="ms-2">
                  🖨️ طباعة الجدول الزمني
                </Button>
                <Button variant="primary" onClick={() => handleOpenSessionModal('Monday', '08:00')}>
                  <PlusIcon className="ms-2" /> جدولة حصة جديدة (سلس)
                </Button>
              </>
            )}
            {activeTab === 'classrooms-manage' && (
              <Button variant="primary" onClick={() => setShowClassroomModal(true)}>
                <PlusIcon className="ms-2" /> إضافة قاعة جديدة
              </Button>
            )}
          </div>
        </div>

        <Tabs
          activeKey={activeTab}
          onSelect={(k) => setActiveTab(k)}
          id="classes-tabs"
          className="mb-4"
        >
          {/* TAB 1: Classes List */}
          <Tab eventKey="classes-list" title="قائمة الفصول">
            <div className="filter-bar mb-3">
              <InputGroup className="search-input-group">
                <InputGroup.Text>
                  <SearchIcon />
                </InputGroup.Text>
                <Form.Control
                  type="search"
                  placeholder="البحث باسم الفصل..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </InputGroup>
            </div>

            {loading ? (
              <div className="text-center py-5">
                <Spinner animation="border" />
              </div>
            ) : (
              <div>
                <Table striped bordered hover responsive>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>اسم الفصل</th>
                      <th>المعلم المسؤول</th>
                      <th>الجدول الزمني</th>
                      <th>فئة العمر</th>
                      <th>الحالة</th>
                      <th>الإجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {classes.length > 0 ? (
                      classes.map((cls, index) => (
                        <tr key={cls.id}>
                          <td>{(currentPage - 1) * pageSize + index + 1}</td>
                          <td>{cls.name}</td>
                          <td>{cls.teacher_name || <span className="text-muted">غير محدد</span>}</td>
                          <td>{formatSchedule(cls.schedule)}</td>
                          <td>{cls.age_group_name || <span className="text-muted">غير محدد</span>}</td>
                          <td>{renderStatusBadge(cls.status)}</td>
                          <td className="table-actions d-flex gap-2" style={{ minWidth: '260px' }}>
                            {hasPermission(PERMISSIONS.CLASSES_EDIT) && (
                              <Button
                                variant="outline-primary"
                                size="sm"
                                onClick={() => handleShowEnrollmentModal(cls)}
                              >
                                <UserPlusIcon />
                              </Button>
                            )}
                            <Button
                              variant="outline-info"
                              size="sm"
                              onClick={() => handleShowDetailsModal(cls)}
                            >
                              <EyeIcon />
                            </Button>
                            {hasPermission(PERMISSIONS.CLASSES_EDIT) && (
                              <Button
                                variant="outline-success"
                                size="sm"
                                onClick={() => handleShowEditModal(cls)}
                              >
                                <EditIcon />
                              </Button>
                            )}
                            {hasPermission(PERMISSIONS.CLASSES_DELETE) && (
                              <Button
                                variant="outline-danger"
                                size="sm"
                                onClick={() => handleDeleteRequest(cls)}
                              >
                                <TrashIcon />
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="7" className="text-center">
                          {searchTerm ? 'لا توجد نتائج تطابق معايير البحث.' : 'لا توجد فصول دراسية مسجلة حالياً.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </Table>

                <TablePagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={totalClasses}
                  pageSize={pageSize}
                  onPageChange={setCurrentPage}
                  onPageSizeChange={(newPageSize, newPage) => {
                    setPageSize(newPageSize);
                    setCurrentPage(newPage);
                  }}
                />
              </div>
            )}
          </Tab>

          {/* TAB 2: Interactive Timetable Calendar Grid */}
          <Tab eventKey="timetable-grid" title="جدول الحصص والتقويم">
            <div className="alert alert-info py-2" style={{ fontSize: '14px' }}>
              💡 انقر على زر إضافة حصة لبرمجة جلسات على مخطط التقويم الأسبوعي. يدعم النظام كشف التعارضات وتكرار الحصص في نفس الوقت مع تنظيم التخطيط.
            </div>

            <Row className="weekly-timetable-grid g-3">
              {daysOfWeekList.map((day) => {
                const daySessions = getSessionsForDay(day.value);
                return (
                  <Col key={day.value} xs={12} md={true} className="day-column border-end pb-3">
                    <div className="day-header bg-primary text-white text-center py-2 rounded mb-2 fw-bold">
                      {day.label} ({daySessions.length})
                    </div>
                    <div className="sessions-list d-flex flex-column gap-2" style={{ minHeight: '300px', backgroundColor: '#fcfcfc', padding: '5px', borderRadius: '4px' }}>
                      {daySessions.length > 0 ? (
                        daySessions.map((session) => (
                          <Card key={session.id} className="session-card shadow-sm border-left-indicator">
                            <Card.Body className="p-2 position-relative">
                              <Button
                                variant="link"
                                className="position-absolute top-0 end-0 text-danger p-1"
                                style={{ fontSize: '12px', textDecoration: 'none' }}
                                onClick={(e) => handleDeleteSession(session.id, e)}
                                title="حذف الجلسة"
                              >
                                🗑️
                              </Button>
                              <div className="fw-bold text-truncate text-primary" style={{ maxWidth: '85%' }}>
                                {session.class_name}
                              </div>
                              <div className="text-muted" style={{ fontSize: '12px' }}>
                                ⏰ {session.start_time} - {session.end_time}
                              </div>
                              <div className="text-secondary" style={{ fontSize: '12px' }}>
                                👨‍🏫 {session.teacher_name || 'بدون معلم'}
                              </div>
                              {session.classroom_name && (
                                <Badge bg="info" className="mt-1" style={{ fontSize: '11px' }}>
                                  🏢 {session.classroom_name}
                                </Badge>
                              )}
                            </Card.Body>
                          </Card>
                        ))
                      ) : (
                        <div className="text-center text-muted my-auto" style={{ fontSize: '12px' }}>
                          لا توجد حصص
                        </div>
                      )}
                      <Button
                        variant="outline-secondary"
                        size="sm"
                        className="w-100 mt-auto border-dashed py-1"
                        style={{ fontSize: '12px' }}
                        onClick={() => handleOpenSessionModal(day.value, '08:00')}
                      >
                        + إضافة حصة
                      </Button>
                    </div>
                  </Col>
                );
              })}
            </Row>
          </Tab>

          {/* TAB 3: Classrooms Management */}
          <Tab eventKey="classrooms-manage" title="إدارة القاعات الدراسية">
            <div className="table-responsive">
              <Table striped bordered hover>
                <thead>
                  <tr>
                    <th>اسم القاعة</th>
                    <th>الطاقة الاستيعابية</th>
                    <th>ملاحظات</th>
                    <th>الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {classrooms.length > 0 ? (
                    classrooms.map((room) => (
                      <tr key={room.id}>
                        <td className="fw-bold">{room.name}</td>
                        <td>{room.capacity ? `${room.capacity} طالباً` : 'غير محدد'}</td>
                        <td>{room.notes || <span className="text-muted">-</span>}</td>
                        <td>
                          <Button
                            variant="outline-danger"
                            size="sm"
                            onClick={() => handleDeleteClassroom(room.id)}
                          >
                            <TrashIcon /> حذف القاعة
                          </Button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="4" className="text-center text-muted py-4">
                        لا توجد قاعات مضافة حالياً. انقر على إضافة قاعة جديدة للبدء.
                      </td>
                    </tr>
                  )}
                </tbody>
              </Table>
            </div>
          </Tab>
        </Tabs>
      </div>

      {/* PRINT-ONLY AREA */}
      <div className="d-none d-print-block print-container RTL text-right" style={{ direction: 'rtl' }}>
        <div className="text-center mb-4">
          <h2>الرابطة الوطنية للقرآن الكريم</h2>
          <h4>جدول التوقيت الأسبوعي العام للفصول الدراسية</h4>
          <hr />
        </div>
        <Table bordered className="print-table w-100">
          <thead>
            <tr>
              {daysOfWeekList.map((day) => (
                <th key={day.value} className="text-center bg-light">{day.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {daysOfWeekList.map((day) => {
                const daySessions = getSessionsForDay(day.value);
                return (
                  <td key={day.value} style={{ verticalAlign: 'top', minWidth: '120px' }}>
                    {daySessions.map((session) => (
                      <div key={session.id} className="p-2 mb-2 border rounded" style={{ fontSize: '11px', backgroundColor: '#f9f9f9' }}>
                        <div className="fw-bold">{session.class_name}</div>
                        <div>⏱️ {session.start_time} - {session.end_time}</div>
                        <div>👨‍🏫 {session.teacher_name || 'بدون معلم'}</div>
                        {session.classroom_name && <div>🏢 {session.classroom_name}</div>}
                      </div>
                    ))}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </Table>
      </div>

      {/* --- ADD SÉANCE / SESSION MODAL WITH LIVE DOUBLE BOOKING RESOLUTION --- */}
      <Modal show={showSessionModal} onHide={() => setShowSessionModal(false)} size="lg" centered>
        <Modal.Header closeButton>
          <Modal.Title>جدولة حصة جديدة (Séance)</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Row className="g-3">
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>الفصل الدراسي</Form.Label>
                  <Form.Select
                    value={newSession.classId}
                    onChange={(e) => setNewSession({ ...newSession, classId: e.target.value })}
                  >
                    <option value="">-- اختر الفئة --</option>
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>يوم الأسبوع</Form.Label>
                  <Form.Select
                    value={newSession.dayOfWeek}
                    onChange={(e) => setNewSession({ ...newSession, dayOfWeek: e.target.value })}
                  >
                    {daysOfWeekList.map((d) => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>وقت البدء</Form.Label>
                  <Form.Control
                    type="time"
                    value={newSession.startTime}
                    onChange={(e) => setNewSession({ ...newSession, startTime: e.target.value })}
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label>وقت الانتهاء</Form.Label>
                  <Form.Control
                    type="time"
                    value={newSession.endTime}
                    onChange={(e) => setNewSession({ ...newSession, endTime: e.target.value })}
                  />
                </Form.Group>
              </Col>
              <Col md={12}>
                <Form.Group className="mb-3">
                  <Form.Label>القاعة الدراسية (الموقع)</Form.Label>
                  <Form.Select
                    value={newSession.classroomId}
                    onChange={(e) => setNewSession({ ...newSession, classroomId: e.target.value })}
                  >
                    <option value="">-- بدون تحديد (خارجي/مسجد عام) --</option>
                    {classrooms.map((room) => (
                      <option key={room.id} value={room.id}>{room.name} (استيعاب: {room.capacity || 'غير محدد'})</option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Col>
            </Row>

            {/* Smart conflict detection warning output */}
            {isCheckingConflicts && <div className="text-muted mb-2">⏳ يجري فحص تعارض الجدول والقاعات...</div>}
            {schedulingConflicts.length > 0 && (
              <Alert variant="danger" className="mt-3">
                <div className="fw-bold mb-2">⚠️ تحذير تعارض في الجدول (Double Booking):</div>
                <ul className="mb-0 pr-3">
                  {schedulingConflicts.map((c, i) => (
                    <li key={i}>{c.message}</li>
                  ))}
                </ul>
              </Alert>
            )}
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowSessionModal(false)}>إلغاء</Button>
          <Button variant="primary" onClick={handleSaveSession}>حفظ وبرمجة الحصة</Button>
        </Modal.Footer>
      </Modal>

      {/* --- ADD CLASSROOM MODAL --- */}
      <Modal show={showClassroomModal} onHide={() => setShowClassroomModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>إضافة قاعة دراسية جديدة</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form onSubmit={handleAddClassroom}>
            <Form.Group className="mb-3">
              <Form.Label>اسم القاعة</Form.Label>
              <Form.Control
                type="text"
                required
                value={newClassroom.name}
                onChange={(e) => setNewClassroom({ ...newClassroom, name: e.target.value })}
                placeholder="مثال: القاعة 1، قاعة النور"
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>الطاقة الاستيعابية (طالب)</Form.Label>
              <Form.Control
                type="number"
                value={newClassroom.capacity}
                onChange={(e) => setNewClassroom({ ...newClassroom, capacity: e.target.value })}
                placeholder="اختياري"
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>ملاحظات</Form.Label>
              <Form.Control
                as="textarea"
                rows={3}
                value={newClassroom.notes}
                onChange={(e) => setNewClassroom({ ...newClassroom, notes: e.target.value })}
                placeholder="تفاصيل إضافية عن القاعة أو موقعها"
              />
            </Form.Group>
            <div className="d-flex justify-content-end gap-2">
              <Button variant="secondary" onClick={() => setShowClassroomModal(false)}>إلغاء</Button>
              <Button variant="primary" type="submit">إضافة</Button>
            </div>
          </Form>
        </Modal.Body>
      </Modal>

      {/* Existing classes modals */}
      <ClassFormModal
        show={showModal}
        handleClose={handleCloseModal}
        onSave={handleSaveClass}
        classData={editingClass}
      />
      <ClassDetailsModal
        show={showDetailsModal}
        handleClose={handleCloseDetailsModal}
        classData={classToView}
      />
      <ConfirmationModal
        show={showDeleteModal}
        handleClose={() => setShowDeleteModal(false)}
        handleConfirm={confirmDelete}
        title="تأكيد حذف الفصل"
        body={`هل أنت متأكد من رغبتك في حذف الفصل "${classToDelete?.name}"؟ لا يمكن التراجع عن هذا الإجراء.`}
        confirmVariant="danger"
        confirmText="نعم، حذف"
      />
      <EnrollmentModal
        show={showEnrollmentModal}
        handleClose={() => setShowEnrollmentModal(false)}
        classData={classToEnroll}
      />
      <ExportModal
        show={showExportModal}
        handleClose={() => setShowExportModal(false)}
        exportType="classes"
        fields={classesFields}
        title="تصدير بيانات الفصول"
      />
      <ImportModal
        show={showImportModal}
        handleClose={() => setShowImportModal(false)}
        importType="الفصول"
        title="استيراد بيانات الفصول"
      />
    </div>
  );
}

export default ClassesPage;
