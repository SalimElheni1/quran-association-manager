import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Spinner, Badge, Form, InputGroup } from 'react-bootstrap';
import { toast } from 'react-toastify';
import StudentFormModal from '@renderer/components/StudentFormModal';
import ConfirmationModal from '@renderer/components/ConfirmationModal';
import StudentDetailsModal from '@renderer/components/StudentDetailsModal';
import '@renderer/styles/StudentsPage.css';

function StudentsPage() {
  const [students, setStudents] = useState([]); // This will now hold only the filtered students
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingStudent, setEditingStudent] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [genderFilter, setGenderFilter] = useState('all');
  const [minAgeFilter, setMinAgeFilter] = useState('');
  const [maxAgeFilter, setMaxAgeFilter] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [studentToDelete, setStudentToDelete] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [studentToView, setStudentToView] = useState(null);

  const fetchStudents = useCallback(async () => {
    setLoading(true);
    try {
      const filters = { searchTerm, genderFilter, minAgeFilter, maxAgeFilter };
      const fetchedStudents = await window.electronAPI.getStudents(filters);
      setStudents(fetchedStudents);
    } catch (err) {
      console.error('Error fetching students:', err);
      toast.error('فشل تحميل بيانات الطلاب. يرجى المحاولة مرة أخرى.');
    } finally {
      setLoading(false);
    }
  }, [searchTerm, genderFilter, minAgeFilter, maxAgeFilter]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  const handleShowAddModal = () => {
    setEditingStudent(null);
    setShowModal(true);
  };

  const handleShowEditModal = async (student) => {
    try {
      // Fetch the full student record before opening the modal
      const fullStudent = await window.electronAPI.getStudentById(student.id);
      setEditingStudent(fullStudent);
      setShowModal(true);
    } catch (err) {
      console.error('Error fetching full student details:', err);
      toast.error('فشل تحميل التفاصيل الكاملة للطالب.');
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingStudent(null);
  };

  const handleShowDetailsModal = async (student) => {
    try {
      const fullStudent = await window.electronAPI.getStudentById(student.id);
      setStudentToView(fullStudent);
      setShowDetailsModal(true);
    } catch (err) {
      console.error('Error fetching full student details:', err);
      toast.error('فشل تحميل التفاصيل الكاملة للطالب.');
    }
  };

  const handleCloseDetailsModal = () => {
    setStudentToView(null);
    setShowDetailsModal(false);
  };

  const handleSaveStudent = async (formData, studentId) => {
    try {
      if (studentId) {
        await window.electronAPI.updateStudent(studentId, formData);
        toast.success(`تم تحديث بيانات الطالب "${formData.name}" بنجاح!`);
      } else {
        await window.electronAPI.addStudent(formData);
        toast.success(`تمت إضافة الطالب "${formData.name}" بنجاح!`);
      }
      fetchStudents(); // Refresh the list
      handleCloseModal();
    } catch (err) {
      console.error('Error saving student:', err);
      const friendlyMessage = err.message.split('Error:').pop().trim();
      toast.error(friendlyMessage);
    }
  };

  const handleDeleteRequest = (student) => {
    setStudentToDelete(student);
    setShowDeleteModal(true);
  };

  const handleCloseDeleteModal = () => {
    setStudentToDelete(null);
    setShowDeleteModal(false);
  };

  const confirmDelete = async () => {
    if (!studentToDelete) return;

    try {
      await window.electronAPI.deleteStudent(studentToDelete.id);
      toast.success(`تم حذف الطالب "${studentToDelete.name}" بنجاح.`);
      fetchStudents(); // Refresh the list
    } catch (err) {
      console.error('Error deleting student:', err);
      toast.error(`فشل حذف الطالب "${studentToDelete.name}".`);
    } finally {
      handleCloseDeleteModal();
    }
  };

  const calculateAge = (dob) => {
    if (!dob) return null;
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const renderStatusBadge = (status) => {
    const translations = {
      active: 'نشط',
      inactive: 'غير نشط',
    };
    const variants = {
      active: 'success',
      inactive: 'secondary',
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
        <h1>شؤون الطلاب</h1>
        <Button variant="primary" onClick={handleShowAddModal}>
          <i className="fas fa-plus ms-2"></i> إضافة طالب
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
            type="number"
            placeholder="العمر (من)"
            value={minAgeFilter}
            onChange={(e) => setMinAgeFilter(e.target.value)}
            className="age-filter-input"
          />
          <Form.Control
            type="number"
            placeholder="العمر (إلى)"
            value={maxAgeFilter}
            onChange={(e) => setMaxAgeFilter(e.target.value)}
            className="age-filter-input"
          />
        </div>
      </div>

      {loading ? (
        <div className="text-center">
          <Spinner animation="border" role="status">
            <span className="visually-hidden">Loading...</span>
          </Spinner>
        </div>
      ) : (
        <Table striped bordered hover responsive className="students-table">
          <thead>
            <tr>
              <th>#</th>
              <th>الرقم التعريفي</th>
              <th>الاسم واللقب</th>
              <th>العمر</th>
              <th>تاريخ التسجيل</th>
              <th>الحالة</th>
              <th>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {students.length > 0 ? (
              students.map((student, index) => (
                <tr key={student.id}>
                  <td>{index + 1}</td>
                  <td>{student.matricule}</td>
                  <td>{student.name}</td>
                  <td>{calculateAge(student.date_of_birth) ?? 'غير متوفر'}</td>
                  <td>{new Date(student.enrollment_date).toLocaleDateString('en-GB')}</td>
                  <td>{renderStatusBadge(student.status)}</td>
                  <td className="table-actions d-flex gap-2">
                    <Button
                      variant="outline-info"
                      size="sm"
                      onClick={() => handleShowDetailsModal(student)}
                    >
                      <i className="fas fa-eye"></i> عرض التفاصيل
                    </Button>
                    <Button
                      variant="outline-success"
                      size="sm"
                      onClick={() => handleShowEditModal(student)}
                    >
                      <i className="fas fa-edit"></i> تعديل
                    </Button>
                    <Button
                      variant="outline-danger"
                      size="sm"
                      onClick={() => handleDeleteRequest(student)}
                    >
                      <i className="fas fa-trash"></i> حذف
                    </Button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="6" className="text-center">
                  {searchTerm || genderFilter !== 'all' || minAgeFilter || maxAgeFilter
                    ? 'لا توجد نتائج تطابق معايير البحث.'
                    : 'لا يوجد طلاب مسجلون حالياً.'}
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      )}

      <StudentFormModal
        show={showModal}
        handleClose={handleCloseModal}
        onSave={handleSaveStudent}
        student={editingStudent}
      />

      <StudentDetailsModal
        show={showDetailsModal}
        handleClose={handleCloseDetailsModal}
        student={studentToView}
      />

      <ConfirmationModal
        show={showDeleteModal}
        handleClose={handleCloseDeleteModal}
        handleConfirm={confirmDelete}
        title="تأكيد حذف الطالب"
        body={`هل أنت متأكد من رغبتك في حذف الطالب "${studentToDelete?.name}"؟ لا يمكن التراجع عن هذا الإجراء.`}
        confirmVariant="danger"
        confirmText="نعم، حذف"
      />
    </div>
  );
}

export default StudentsPage;
