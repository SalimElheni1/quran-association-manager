import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Spinner, Alert, Badge, Form, InputGroup } from 'react-bootstrap';
import StudentFormModal from '../components/StudentFormModal';
import ConfirmationModal from '../components/ConfirmationModal';
import StudentDetailsModal from '../components/StudentDetailsModal';
import '../styles/StudentsPage.css';

function StudentsPage() {
  const [students, setStudents] = useState([]); // Master list of all students
  const [filteredStudents, setFilteredStudents] = useState([]); // Students to display after filtering
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
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
    try {
      setError(null);
      setLoading(true);
      const fetchedStudents = await window.electronAPI.db.all(
        'SELECT * FROM students ORDER BY name ASC',
      );
      setStudents(fetchedStudents);
    } catch (err) {
      console.error('Error fetching students:', err);
      setError('فشل في تحميل بيانات الطلاب. يرجى المحاولة مرة أخرى.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  // Effect for client-side filtering
  useEffect(() => {
    const results = students
      .filter((student) => {
        // Search term filter
        return student.name.toLowerCase().includes(searchTerm.toLowerCase());
      })
      .filter((student) => {
        // Gender filter
        if (genderFilter === 'all') return true;
        return student.gender === genderFilter;
      })
      .filter((student) => {
        // Age range filter
        const minAge = parseInt(minAgeFilter, 10);
        const maxAge = parseInt(maxAgeFilter, 10);
        if (isNaN(minAge) && isNaN(maxAge)) return true;

        const age = calculateAge(student.date_of_birth);
        if (age === null) return false; // Exclude students without a DOB from age filtering

        const minMatch = isNaN(minAge) || age >= minAge;
        const maxMatch = isNaN(maxAge) || age <= maxAge;
        return minMatch && maxMatch;
      });

    setFilteredStudents(results);
  }, [searchTerm, genderFilter, minAgeFilter, maxAgeFilter, students]);

  const handleShowAddModal = () => {
    setEditingStudent(null);
    setShowModal(true);
  };

  const handleShowEditModal = (student) => {
    setEditingStudent(student);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingStudent(null);
  };

  const handleShowDetailsModal = (student) => {
    setStudentToView(student);
    setShowDetailsModal(true);
  };

  const handleCloseDetailsModal = () => {
    setStudentToView(null);
    setShowDetailsModal(false);
  };

  const handleSaveStudent = async (formData, studentId) => {
    // A list of all fields in the students table to ensure we save everything
    const fields = [
      'name',
      'date_of_birth',
      'gender',
      'address',
      'contact_info',
      'email',
      'status',
      'memorization_level',
      'notes',
      'parent_name',
      'guardian_relation',
      'parent_contact',
      'guardian_email',
      'emergency_contact_name',
      'emergency_contact_phone',
      'health_conditions',
      'national_id',
      'school_name',
      'grade_level',
      'educational_level',
      'occupation',
      'civil_status',
      'related_family_members',
      'financial_assistance_notes',
    ];

    try {
      if (studentId) {
        // Update existing student
        const setClauses = fields.map((field) => `${field} = ?`).join(', ');
        const sql = `UPDATE students SET ${setClauses} WHERE id = ?`;
        const params = [...fields.map((field) => formData[field] || null), studentId];
        await window.electronAPI.db.run(sql, params);
      } else {
        // Add new student
        const placeholders = fields.map(() => '?').join(', ');
        const sql = `INSERT INTO students (${fields.join(', ')}) VALUES (${placeholders})`;
        const params = fields.map((field) => formData[field] || null);
        await window.electronAPI.db.run(sql, params);
      }
      fetchStudents(); // Refresh the list
      handleCloseModal();
    } catch (err) {
      console.error('Error saving student:', err);
      // Provide a more specific error if possible, e.g., from the backend
      setError(`فشل في حفظ بيانات الطالب: ${err.message}`);
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
      await window.electronAPI.db.run('DELETE FROM students WHERE id = ?', [studentToDelete.id]);
      fetchStudents(); // Refresh the list
    } catch (err) {
      console.error('Error deleting student:', err);
      setError('فشل في حذف الطالب.');
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
        <h1>إدارة الطلاب</h1>
        <Button variant="primary" onClick={handleShowAddModal}>
          <i className="fas fa-plus ms-2"></i> إضافة طالب جديد
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
            type="number"
            placeholder="أدنى عمر"
            value={minAgeFilter}
            onChange={(e) => setMinAgeFilter(e.target.value)}
            className="age-filter-input"
          />
          <Form.Control
            type="number"
            placeholder="أقصى عمر"
            value={maxAgeFilter}
            onChange={(e) => setMaxAgeFilter(e.target.value)}
            className="age-filter-input"
          />
        </div>
      </div>

      {error && <Alert variant="danger">{error}</Alert>}

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
              <th>الاسم الكامل</th>
              <th>العمر</th>
              <th>تاريخ التسجيل</th>
              <th>الحالة</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {filteredStudents.length > 0 ? (
              filteredStudents.map((student, index) => (
                <tr key={student.id}>
                  <td>{index + 1}</td>
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
                      <i className="fas fa-eye"></i> عرض
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
                  {students.length > 0
                    ? 'لم يتم العثور على طلاب مطابقين للبحث.'
                    : 'لم يتم العثور على طلاب.'}
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
        title="تأكيد الحذف"
        body={`هل أنت متأكد من رغبتك في حذف الطالب "${studentToDelete?.name}"؟ لا يمكن التراجع عن هذا الإجراء.`}
        confirmVariant="danger"
        confirmText="نعم، قم بالحذف"
      />
    </div>
  );
}

export default StudentsPage;
