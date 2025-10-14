import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Spinner, Form, InputGroup, Badge } from 'react-bootstrap';
import { toast } from 'react-toastify';
import ClassFormModal from '@renderer/components/ClassFormModal';
import ConfirmationModal from '@renderer/components/common/ConfirmationModal';
import ClassDetailsModal from '@renderer/components/ClassDetailsModal'; // We will create this next
import EnrollmentModal from '@renderer/components/EnrollmentModal';
import '@renderer/styles/StudentsPage.css'; // Reuse styles
import { error as logError } from '@renderer/utils/logger';
import PlusIcon from '@renderer/components/icons/PlusIcon';
import SearchIcon from '@renderer/components/icons/SearchIcon';
import UserPlusIcon from '@renderer/components/icons/UserPlusIcon';
import EyeIcon from '@renderer/components/icons/EyeIcon';
import EditIcon from '@renderer/components/icons/EditIcon';
import TrashIcon from '@renderer/components/icons/TrashIcon';

function ClassesPage() {
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

  const fetchClasses = useCallback(async () => {
    setLoading(true);
    try {
      const filters = { searchTerm };
      const fetchedClasses = await window.electronAPI.getClasses(filters);
      setClasses(fetchedClasses);
    } catch (err) {
      logError('Error fetching classes:', err);
      toast.error('فشل تحميل بيانات الفصول الدراسية.');
    } finally {
      setLoading(false);
    }
  }, [searchTerm]);

  useEffect(() => {
    fetchClasses();
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
    setShowModal(true); // Show modal even if fetch fails, it will show empty fields
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
        .map((item) => {
          const day = dayTranslations[item.day] || item.day;
          // Handle both old (time) and new (startTime, endTime) formats
          const time = item.startTime
            ? `${item.startTime} - ${item.endTime}`
            : item.time || 'غير محدد';
          return `${day}: ${time}`;
        })
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
    const translations = {
      pending: 'قيد الانتظار',
      active: 'نشط',
      completed: 'مكتمل',
    };
    const variants = {
      pending: 'warning',
      active: 'success',
      completed: 'secondary',
    };
    return (
      <Badge bg={variants[status] || 'light'} text="dark" className="p-2">
        {translations[status] || status}
      </Badge>
    );
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>الفصول الدراسية</h1>
        <Button variant="primary" onClick={handleShowAddModal}>
          <PlusIcon className="ms-2" /> إضافة فصل
        </Button>
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
        <Table striped bordered hover responsive>
          <thead>
            <tr>
              <th>#</th>
              <th>اسم الفصل</th>
              <th>النوع</th>
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
                  <td>{index + 1}</td>
                  <td>{cls.name}</td>
                  <td>{cls.class_type || '-'}</td>
                  <td>{cls.teacher_name || <span className="text-muted">غير محدد</span>}</td>
                  <td>{formatSchedule(cls.schedule)}</td>
                  <td>{genderTranslations[cls.gender] || cls.gender}</td>
                  <td>{renderStatusBadge(cls.status)}</td>
                  <td className="table-actions d-flex gap-2" style={{ minWidth: '260px' }}>
                    <Button
                      variant="outline-primary"
                      size="sm"
                      onClick={() => handleShowEnrollmentModal(cls)}
                    >
                      <UserPlusIcon /> الطلاب المسجلون
                    </Button>
                    <Button
                      variant="outline-info"
                      size="sm"
                      onClick={() => handleShowDetailsModal(cls)}
                    >
                      <EyeIcon /> عرض التفاصيل
                    </Button>
                    <Button
                      variant="outline-success"
                      size="sm"
                      onClick={() => handleShowEditModal(cls)}
                    >
                      <EditIcon /> تعديل
                    </Button>
                    <Button
                      variant="outline-danger"
                      size="sm"
                      onClick={() => handleDeleteRequest(cls)}
                    >
                      <TrashIcon /> حذف
                    </Button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="8" className="text-center">
                  {searchTerm
                    ? 'لا توجد نتائج تطابق معايير البحث.'
                    : 'لا توجد فصول دراسية مسجلة حالياً.'}
                </td>
              </tr>
            )}
          </tbody>
        </Table>
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
    </div>
  );
}

export default ClassesPage;
