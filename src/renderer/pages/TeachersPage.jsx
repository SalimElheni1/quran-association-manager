import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Spinner, Alert, Form, InputGroup } from 'react-bootstrap';
import TeacherFormModal from '../components/TeacherFormModal';
import ConfirmationModal from '../components/ConfirmationModal';
import TeacherDetailsModal from '../components/TeacherDetailsModal';
// We can reuse the same page styles from the students page
import '../styles/StudentsPage.css';

function TeachersPage() {
  const [teachers, setTeachers] = useState([]);
  const [filteredTeachers, setFilteredTeachers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
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
    try {
      setError(null);
      setLoading(true);
      const fetchedTeachers = await window.electronAPI.db.all(
        'SELECT * FROM teachers ORDER BY name ASC',
      );
      setTeachers(fetchedTeachers);
      //   setFilteredTeachers(fetchedTeachers);
    } catch (err) {
      console.error('Error fetching teachers:', err);
      setError('فشل في تحميل بيانات المعلمين.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTeachers();
  }, [fetchTeachers]);

  useEffect(() => {
    const results = teachers.filter((teacher) => {
      const nameMatch = teacher.name.toLowerCase().includes(searchTerm.toLowerCase());
      const genderMatch = genderFilter === 'all' || teacher.gender === genderFilter;
      const specializationMatch =
        !specializationFilter ||
        (teacher.specialization &&
          teacher.specialization.toLowerCase().includes(specializationFilter.toLowerCase()));
      return nameMatch && genderMatch && specializationMatch;
    });
    setFilteredTeachers(results);
  }, [searchTerm, genderFilter, specializationFilter, teachers]);

  const handleShowAddModal = () => {
    setEditingTeacher(null);
    setShowModal(true);
  };

  const handleShowEditModal = (teacher) => {
    setEditingTeacher(teacher);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingTeacher(null);
  };

  const handleShowDetailsModal = (teacher) => {
    setTeacherToView(teacher);
    setShowDetailsModal(true);
  };

  const handleCloseDetailsModal = () => {
    setTeacherToView(null);
    setShowDetailsModal(false);
  };

  const handleSaveTeacher = async (formData, teacherId) => {
    const fields = [
      'name',
      'national_id',
      'contact_info',
      'email',
      'address',
      'date_of_birth',
      'gender',
      'educational_level',
      'specialization',
      'years_of_experience',
      'availability',
      'notes',
    ];
    try {
      if (teacherId) {
        const setClauses = fields.map((field) => `${field} = ?`).join(', ');
        const sql = `UPDATE teachers SET ${setClauses} WHERE id = ?`;
        const params = [...fields.map((field) => formData[field] || null), teacherId];
        await window.electronAPI.db.run(sql, params);
      } else {
        const placeholders = fields.map(() => '?').join(', ');
        const sql = `INSERT INTO teachers (${fields.join(', ')}) VALUES (${placeholders})`;
        const params = fields.map((field) => formData[field] || null);
        await window.electronAPI.db.run(sql, params);
      }
      fetchTeachers();
      handleCloseModal();
    } catch (err) {
      console.error('Error saving teacher:', err);
      setError(`فشل في حفظ بيانات المعلم: ${err.message}`);
    }
  };

  const handleDeleteRequest = (teacher) => {
    setTeacherToDelete(teacher);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!teacherToDelete) return;
    try {
      await window.electronAPI.db.run('DELETE FROM teachers WHERE id = ?', [teacherToDelete.id]);
      fetchTeachers();
    } catch (err) {
      console.error('Error deleting teacher:', err);
      setError('فشل في حذف المعلم.');
    } finally {
      setShowDeleteModal(false);
      setTeacherToDelete(null);
    }
  };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>إدارة المعلمين</h1>
        <Button variant="primary" onClick={handleShowAddModal}>
          <i className="fas fa-plus ms-2"></i> إضافة معلم جديد
        </Button>
      </div>
      <div className="filter-bar">
        <InputGroup className="search-input-group">
          <InputGroup.Text>
            <i className="fas fa-search"></i>
          </InputGroup.Text>
          <Form.Control
            type="search"
            placeholder="ابحث بالاسم..."
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
            <option value="all">الكل (الجنس)</option>
            <option value="Male">ذكر</option>
            <option value="Female">أنثى</option>
          </Form.Select>
          <Form.Control
            type="text"
            placeholder="ابحث بالتخصص..."
            value={specializationFilter}
            onChange={(e) => setSpecializationFilter(e.target.value)}
            className="filter-select"
          />
        </div>
      </div>
      {error && <Alert variant="danger">{error}</Alert>}
      {loading ? (
        <div className="text-center">
          <Spinner animation="border" />
        </div>
      ) : (
        <Table striped bordered hover responsive>
          <thead>
            <tr>
              <th>#</th>
              <th>الاسم</th>
              <th>رقم الهاتف</th>
              <th>التخصص</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {filteredTeachers.length > 0 ? (
              filteredTeachers.map((teacher, index) => (
                <tr key={teacher.id}>
                  <td>{index + 1}</td>
                  <td>{teacher.name}</td>
                  <td>{teacher.contact_info || 'N/A'}</td>
                  <td>{teacher.specialization || 'N/A'}</td>
                  <td className="table-actions d-flex gap-2">
                    <Button
                      variant="outline-info"
                      size="sm"
                      onClick={() => handleShowDetailsModal(teacher)}
                    >
                      <i className="fas fa-eye"></i> عرض
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
                  {teachers.length > 0
                    ? 'لم يتم العثور على معلمين مطابقين للبحث.'
                    : 'لم يتم العثور على معلمين.'}
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
        title="تأكيد الحذف"
        body={`هل أنت متأكد من رغبتك في حذف المعلم "${teacherToDelete?.name}"؟`}
        confirmVariant="danger"
        confirmText="نعم، قم بالحذف"
      />
    </div>
  );
}

export default TeachersPage;
