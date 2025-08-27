import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Spinner, Form, InputGroup } from 'react-bootstrap';
import { toast } from 'react-toastify';
import TeacherFormModal from '@renderer/components/TeacherFormModal';
import ConfirmationModal from '@renderer/components/ConfirmationModal';
import TeacherDetailsModal from '@renderer/components/TeacherDetailsModal';
// We can reuse the same page styles from the students page
import '@renderer/styles/StudentsPage.css';
import { error as logError } from '@renderer/utils/logger';

function TeachersPage() {
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [genderFilter, setGenderFilter] = useState('all');
  const [specializationFilter, setSpecializationFilter] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [teacherToDelete, setTeacherToDelete] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [teacherToView, setTeacherToView] = useState(null);

  const fetchTeachers = useCallback(async () => {
    setLoading(true);
    try {
      const filters = { searchTerm, genderFilter, specializationFilter };
      const fetchedTeachers = await window.electronAPI.getTeachers(filters);
      setTeachers(fetchedTeachers);
    } catch (err) {
      logError('Error fetching teachers:', err);
      toast.error('فشل تحميل بيانات المعلمين.');
    } finally {
      setLoading(false);
    }
  }, [searchTerm, genderFilter, specializationFilter]);

  useEffect(() => {
    fetchTeachers();
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
        <Button variant="primary" onClick={handleShowAddModal}>
          <i className="fas fa-plus ms-2"></i> إضافة معلم
        </Button>
      </div>
      <div className="filter-bar">
        <InputGroup className="search-input-group">
          <InputGroup.Text>
            <i className="fas fa-search"></i>
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
          <Form.Control
            type="text"
            placeholder="البحث بالتخصص..."
            value={specializationFilter}
            onChange={(e) => setSpecializationFilter(e.target.value)}
            className="filter-select"
          />
        </div>
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
              <th>الرقم التعريفي</th>
              <th>الاسم واللقب</th>
              <th>رقم الهاتف</th>
              <th>التخصص</th>
              <th>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {teachers.length > 0 ? (
              teachers.map((teacher, index) => (
                <tr key={teacher.id}>
                  <td>{index + 1}</td>
                  <td>{teacher.matricule}</td>
                  <td>{teacher.name}</td>
                  <td>{teacher.contact_info || '-'}</td>
                  <td>{teacher.specialization || '-'}</td>
                  <td className="table-actions d-flex gap-2">
                    <Button
                      variant="outline-info"
                      size="sm"
                      onClick={() => handleShowDetailsModal(teacher)}
                    >
                      <i className="fas fa-eye"></i> عرض التفاصيل
                    </Button>
                    <Button
                      variant="outline-success"
                      size="sm"
                      onClick={() => handleShowEditModal(teacher)}
                    >
                      <i className="fas fa-edit"></i> تعديل
                    </Button>
                    <Button
                      variant="outline-danger"
                      size="sm"
                      onClick={() => handleDeleteRequest(teacher)}
                    >
                      <i className="fas fa-trash"></i> حذف
                    </Button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="5" className="text-center">
                  {searchTerm || genderFilter !== 'all' || specializationFilter
                    ? 'لا توجد نتائج تطابق معايير البحث.'
                    : 'لا يوجد معلمون مسجلون حالياً.'}
                </td>
              </tr>
            )}
          </tbody>
        </Table>
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
    </div>
  );
}

export default TeachersPage;
