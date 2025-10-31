import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Table, Button, Spinner, Form, InputGroup, Badge } from 'react-bootstrap';
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
  { key: 'gender', label: 'الجنس' },
  { key: 'status', label: 'الحالة' },
];

function ClassesPage() {
  const { hasPermission } = usePermissions();
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

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalClasses, setTotalClasses] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

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

  useEffect(() => {
    fetchClasses();
  }, [fetchClasses]);

  // Subscribe to import completion events (IPC via preload preferred, DOM fallback supported)
  useEffect(() => {
    const lastHandledAtRef = { current: 0 };
    const domHandler = (e) => {
      try {
        const now = Date.now();
        if (now - lastHandledAtRef.current < 1200) return; // debounce duplicate events
        const sheets = e?.detail?.sheets || [];
        if (sheets.includes('الفصول')) {
          lastHandledAtRef.current = now;
          fetchClasses();
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
    } catch (err) {
      logError('Error deleting class:', err);
      toast.error(`فشل حذف الفصل "${classToDelete.name}".`);
    } finally {
      setShowDeleteModal(false);
      setClassToDelete(null);
    }
  };

  const formatSchedule = (scheduleJSON) => {
    if (!scheduleJSON || scheduleJSON === '[]') return 'غير محدد';
    try {
      const scheduleArray = JSON.parse(scheduleJSON);
      if (!Array.isArray(scheduleArray) || scheduleArray.length === 0) return 'غير محدد';

      const dayTranslations = {
        Monday: 'الإثنين',
        Tuesday: 'الثلاثاء',
        Wednesday: 'الأربعاء',
        Thursday: 'الخميس',
        Friday: 'الجمعة',
        Saturday: 'السبت',
        Sunday: 'الأحد',
      };

      return scheduleArray
        .map((item) => `${dayTranslations[item.day] || item.day}: ${item.time}`)
        .join(' | ');
    } catch (e) {
      return 'جدول غير صالح';
    }
  };

  const genderTranslations = {
    all: 'الكل',
    men: 'رجال',
    women: 'نساء',
    kids: 'أطفال',
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

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>الفصول الدراسية</h1>
        <div className="page-header-actions">
          {hasPermission(PERMISSIONS.CLASSES_VIEW) && (
            <Button variant="outline-primary" onClick={() => setShowExportModal(true)}>
              <ExportIcon className="ms-2" /> تصدير البيانات
            </Button>
          )}
          {hasPermission(PERMISSIONS.CLASSES_CREATE) && (
            <Button variant="outline-success" onClick={() => setShowImportModal(true)}>
              <ImportIcon className="ms-2" /> استيراد البيانات
            </Button>
          )}
          {hasPermission(PERMISSIONS.CLASSES_CREATE) && (
            <Button variant="primary" onClick={handleShowAddModal}>
              <PlusIcon className="ms-2" /> إضافة فصل
            </Button>
          )}
        </div>
      </div>
      <div className="filter-bar">
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
        <div className="text-center">
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
                <th>الجنس</th>
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
                    <td>{genderTranslations[cls.gender] || cls.gender}</td>
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
                    {searchTerm
                      ? 'لا توجد نتائج تطابق معايير البحث.'
                      : 'لا توجد فصول دراسية مسجلة حالياً.'}
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
