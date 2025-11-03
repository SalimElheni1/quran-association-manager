import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Spinner, Form, InputGroup } from 'react-bootstrap';
import { toast } from 'react-toastify';
import TeacherFormModal from '@renderer/components/TeacherFormModal';
import ConfirmationModal from '@renderer/components/common/ConfirmationModal';
import TeacherDetailsModal from '@renderer/components/TeacherDetailsModal';
import TablePagination from '@renderer/components/common/TablePagination';
import ExportModal from '@renderer/components/modals/ExportModal';
import ImportModal from '@renderer/components/modals/ImportModal';
import '@renderer/styles/StudentsPage.css';
import { error as logError } from '@renderer/utils/logger';
import PlusIcon from '@renderer/components/icons/PlusIcon';
import SearchIcon from '@renderer/components/icons/SearchIcon';
import EyeIcon from '@renderer/components/icons/EyeIcon';
import EditIcon from '@renderer/components/icons/EditIcon';
import TrashIcon from '@renderer/components/icons/TrashIcon';
import ExportIcon from '@renderer/components/icons/ExportIcon';
import ImportIcon from '@renderer/components/icons/ImportIcon';
import { usePermissions } from '@renderer/hooks/usePermissions';
import { PERMISSIONS } from '@renderer/utils/permissions';

const teachersFields = [
  { key: 'matricule', label: 'الرقم التعريفي' },
  { key: 'name', label: 'الاسم واللقب' },
  { key: 'gender', label: 'الجنس' },
  { key: 'address', label: 'العنوان' },
  { key: 'contact_info', label: 'رقم الهاتف' },
  { key: 'date_of_birth', label: 'تاريخ الميلاد' },
  { key: 'date_of_joining', label: 'تاريخ الالتحاق' },
  { key: 'qualifications', label: 'المؤهلات' },
  { key: 'notes', label: 'ملاحظات' },
];

function TeachersPage() {
  const { hasPermission } = usePermissions();
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [genderFilter, setGenderFilter] = useState('all');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [teacherToDelete, setTeacherToDelete] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [teacherToView, setTeacherToView] = useState(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalTeachers, setTotalTeachers] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, genderFilter]);

  const fetchTeachers = useCallback(async () => {
    setLoading(true);
    try {
      const filters = {
        searchTerm,
        genderFilter,
        page: currentPage,
        limit: pageSize,
      };
      const result = await window.electronAPI.getTeachers(filters);
      if (result && result.teachers) {
        setTeachers(result.teachers);
        setTotalTeachers(result.total);
        setTotalPages(result.totalPages);
      } else {
        setTeachers(result);
        setTotalTeachers(result.length);
        setTotalPages(1);
      }
    } catch (err) {
      logError('Error fetching teachers:', err);
      toast.error('فشل تحميل بيانات المعلمين.');
    } finally {
      setLoading(false);
    }
  }, [searchTerm, genderFilter, currentPage, pageSize]);

  useEffect(() => {
    fetchTeachers();
  }, [fetchTeachers]);

  // Listen for global import completion events and refresh if teachers were imported
  useEffect(() => {
    const handler = (e) => {
      try {
        const detail = e?.detail || {};
        const sheets = detail.sheets || [];
        if (sheets.includes('المعلمون') || sheets.includes('المعلمين')) {
          fetchTeachers();
          toast.info('تم تحديث قائمة المعلمين بعد الاستيراد.');
        }
      } catch (err) {
        logError('Error handling import-completed event:', err);
      }
    };

    window.addEventListener('app:import-completed', handler);
    return () => window.removeEventListener('app:import-completed', handler);
  }, [fetchTeachers]);

  // Also subscribe via the secure preload IPC listener if available (preferred)
  useEffect(() => {
    let unsubscribe = null;
    try {
      if (window.electronAPI && typeof window.electronAPI.onImportCompleted === 'function') {
        unsubscribe = window.electronAPI.onImportCompleted((payload) => {
          try {
            const sheets = payload?.sheets || [];
            if (sheets.includes('المعلمون') || sheets.includes('المعلمين')) {
              fetchTeachers();
              toast.info('تم تحديث قائمة المعلمين بعد الاستيراد.');
            }
          } catch (err) {
            logError('Error handling import-completed IPC payload:', err);
          }
        });
      }
    } catch (err) {
      logError('Failed to register import completion IPC listener:', err);
    }

    return () => {
      try {
        if (typeof unsubscribe === 'function') unsubscribe();
      } catch (err) {
        /* ignore */
      }
    };
  }, [fetchTeachers]);

  const handleShowAddModal = () => {
    setEditingTeacher(null);
    setShowModal(true);
  };

  const handleShowEditModal = async (teacher) => {
    try {
      const fullTeacher = await window.electronAPI.getTeacherById(teacher.id);
      setEditingTeacher(fullTeacher);
      setShowModal(true);
    } catch (err) {
      logError('Error fetching full teacher details:', err);
      toast.error('فشل تحميل التفاصيل الكاملة للمعلم.');
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingTeacher(null);
  };

  const handleShowDetailsModal = async (teacher) => {
    try {
      const fullTeacher = await window.electronAPI.getTeacherById(teacher.id);
      setTeacherToView(fullTeacher);
      setShowDetailsModal(true);
    } catch (err) {
      logError('Error fetching full teacher details:', err);
      toast.error('فشل تحميل التفاصيل الكاملة للمعلم.');
    }
  };

  const handleCloseDetailsModal = () => {
    setTeacherToView(null);
    setShowDetailsModal(false);
  };

  const handleSaveTeacher = async (formData, teacherId) => {
    try {
      if (teacherId) {
        await window.electronAPI.updateTeacher(teacherId, formData);
        toast.success(`تم تحديث بيانات المعلم "${formData.name}" بنجاح!`);
      } else {
        await window.electronAPI.addTeacher(formData);
        toast.success(`تمت إضافة المعلم "${formData.name}" بنجاح!`);
      }
      fetchTeachers();
      handleCloseModal();
    } catch (err) {
      logError('Error saving teacher:', err);
      const friendlyMessage = err.message.split('Error:').pop().trim();
      toast.error(friendlyMessage);
    }
  };

  const handleDeleteRequest = (teacher) => {
    setTeacherToDelete(teacher);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!teacherToDelete) return;
    try {
      await window.electronAPI.deleteTeacher(teacherToDelete.id);
      toast.success(`تم حذف المعلم "${teacherToDelete.name}" بنجاح.`);
      fetchTeachers();
    } catch (err) {
      logError('Error deleting teacher:', err);
      toast.error(`فشل حذف المعلم "${teacherToDelete.name}".`);
    } finally {
      setShowDeleteModal(false);
      setTeacherToDelete(null);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>شؤون المعلمين</h1>
        <div className="page-header-actions">
          {hasPermission(PERMISSIONS.USERS_VIEW) && (
            <Button variant="outline-primary" onClick={() => setShowExportModal(true)}>
              <ExportIcon className="ms-2" /> تصدير البيانات
            </Button>
          )}
          {hasPermission(PERMISSIONS.USERS_CREATE) && (
            <Button variant="outline-success" onClick={() => setShowImportModal(true)}>
              <ImportIcon className="ms-2" /> استيراد البيانات
            </Button>
          )}
          {hasPermission(PERMISSIONS.USERS_CREATE) && (
            <Button variant="primary" onClick={handleShowAddModal}>
              <PlusIcon className="ms-2" /> إضافة معلم
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
            placeholder="البحث بالاسم أو الرقم التعريفي..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </InputGroup>
        <div className="filter-controls">
          <Form.Select
            aria-label="Filter by gender"
            value={genderFilter}
            onChange={(e) => setGenderFilter(e.target.value)}
            className="filter-select"
          >
            <option value="all">الجنس (الكل)</option>
            <option value="Male">ذكر</option>
            <option value="Female">أنثى</option>
          </Form.Select>
        </div>
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
                <th>الرقم التعريفي</th>
                <th>الاسم واللقب</th>
                <th>رقم الهاتف</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {teachers.length > 0 ? (
                teachers.map((teacher, index) => (
                  <tr key={teacher.id}>
                    <td>{(currentPage - 1) * pageSize + index + 1}</td>
                    <td>{teacher.matricule}</td>
                    <td>{teacher.name}</td>
                    <td>{teacher.contact_info || '-'}</td>
                    <td className="table-actions d-flex gap-2">
                      <Button
                        variant="outline-info"
                        size="sm"
                        onClick={() => handleShowDetailsModal(teacher)}
                      >
                        <EyeIcon />
                      </Button>
                      {hasPermission(PERMISSIONS.USERS_EDIT) && (
                        <Button
                          variant="outline-success"
                          size="sm"
                          onClick={() => handleShowEditModal(teacher)}
                        >
                          <EditIcon />
                        </Button>
                      )}
                      {hasPermission(PERMISSIONS.USERS_DELETE) && (
                        <Button
                          variant="outline-danger"
                          size="sm"
                          onClick={() => handleDeleteRequest(teacher)}
                        >
                          <TrashIcon />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="text-center">
                    {searchTerm || genderFilter !== 'all'
                      ? 'لا توجد نتائج تطابق معايير البحث.'
                      : 'لا يوجد معلمون مسجلون حالياً.'}
                  </td>
                </tr>
              )}
            </tbody>
          </Table>

          <TablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalTeachers}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(newPageSize, newPage) => {
              setPageSize(newPageSize);
              setCurrentPage(newPage);
            }}
          />
        </div>
      )}
      <TeacherFormModal
        show={showModal}
        handleClose={handleCloseModal}
        onSave={handleSaveTeacher}
        teacher={editingTeacher}
      />
      <TeacherDetailsModal
        show={showDetailsModal}
        handleClose={handleCloseDetailsModal}
        teacher={teacherToView}
      />
      <ConfirmationModal
        show={showDeleteModal}
        handleClose={() => setShowDeleteModal(false)}
        handleConfirm={confirmDelete}
        title="تأكيد حذف المعلم"
        body={`هل أنت متأكد من رغبتك في حذف المعلم "${teacherToDelete?.name}"؟ لا يمكن التراجع عن هذا الإجراء.`}
        confirmVariant="danger"
        confirmText="نعم، حذف"
      />
      <ExportModal
        show={showExportModal}
        handleClose={() => setShowExportModal(false)}
        exportType="teachers"
        fields={teachersFields}
        title="تصدير بيانات المعلمين"
      />
      <ImportModal
        show={showImportModal}
        handleClose={() => setShowImportModal(false)}
        importType="المعلمين"
        title="استيراد بيانات المعلمين"
      />
    </div>
  );
}

export default TeachersPage;
