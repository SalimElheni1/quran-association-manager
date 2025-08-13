import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Spinner, Alert, Form, InputGroup, Badge } from 'react-bootstrap';
import ClassFormModal from '../components/ClassFormModal';
import ConfirmationModal from '../components/ConfirmationModal';
import '../styles/StudentsPage.css'; // Reuse styles

function ClassesPage() {
  const [classes, setClasses] = useState([]);
  const [filteredClasses, setFilteredClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingClass, setEditingClass] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [classToDelete, setClassToDelete] = useState(null);

  const fetchClasses = useCallback(async () => {
    try {
      setError(null);
      setLoading(true);
      // Use a LEFT JOIN to get the teacher's name. If a teacher is deleted,
      // the class will still show but with a null teacher name.
      const sql = `
        SELECT c.id, c.name, c.class_type, c.schedule, c.status,
               c.teacher_id, t.name as teacher_name
        FROM classes c
        LEFT JOIN teachers t ON c.teacher_id = t.id
        ORDER BY c.name ASC
      `;
      const fetchedClasses = await window.electronAPI.db.all(sql);
      setClasses(fetchedClasses);
    } catch (err) {
      console.error('Error fetching classes:', err);
      setError('فشل في تحميل بيانات الفصول الدراسية.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClasses();
  }, [fetchClasses]);

  useEffect(() => {
    const results = classes.filter((cls) =>
      cls.name.toLowerCase().includes(searchTerm.toLowerCase()),
    );
    setFilteredClasses(results);
  }, [searchTerm, classes]);

  const handleShowAddModal = () => {
    setEditingClass(null);
    setShowModal(true);
  };

  const handleShowEditModal = (classData) => {
    setEditingClass(classData);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingClass(null);
  };

  const handleSaveClass = async (formData, classId) => {
    const fields = [
      'name',
      'class_type',
      'teacher_id',
      'schedule',
      'start_date',
      'end_date',
      'status',
      'capacity',
    ];
    try {
      if (classId) {
        const setClauses = fields.map((field) => `${field} = ?`).join(', ');
        const sql = `UPDATE classes SET ${setClauses} WHERE id = ?`;
        const params = [...fields.map((field) => formData[field] || null), classId];
        await window.electronAPI.db.run(sql, params);
      } else {
        const placeholders = fields.map(() => '?').join(', ');
        const sql = `INSERT INTO classes (${fields.join(', ')}) VALUES (${placeholders})`;
        const params = fields.map((field) => formData[field] || null);
        await window.electronAPI.db.run(sql, params);
      }
      fetchClasses();
      handleCloseModal();
    } catch (err) {
      console.error('Error saving class:', err);
      setError(`فشل في حفظ بيانات الفصل: ${err.message}`);
    }
  };

  const handleDeleteRequest = (classData) => {
    setClassToDelete(classData);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!classToDelete) return;
    try {
      await window.electronAPI.db.run('DELETE FROM classes WHERE id = ?', [classToDelete.id]);
      fetchClasses();
    } catch (err) {
      console.error('Error deleting class:', err);
      setError('فشل في حذف الفصل.');
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
        <h1>إدارة الفصول الدراسية</h1>
        <Button variant="primary" onClick={handleShowAddModal}>
          <i className="fas fa-plus ms-2"></i> إضافة فصل جديد
        </Button>
      </div>
      <div className="filter-bar">
        <InputGroup className="search-input-group">
          <InputGroup.Text>
            <i className="fas fa-search"></i>
          </InputGroup.Text>
          <Form.Control
            type="search"
            placeholder="ابحث باسم الفصل..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </InputGroup>
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
              <th>اسم الفصل</th>
              <th>النوع</th>
              <th>المعلم</th>
              <th>الجدول</th>
              <th>الحالة</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {filteredClasses.length > 0 ? (
              filteredClasses.map((cls, index) => (
                <tr key={cls.id}>
                  <td>{index + 1}</td>
                  <td>{cls.name}</td>
                  <td>{cls.class_type || 'N/A'}</td>
                  <td>{cls.teacher_name || <span className="text-muted">غير محدد</span>}</td>
                  <td>{formatSchedule(cls.schedule)}</td>
                  <td>{renderStatusBadge(cls.status)}</td>
                  <td className="table-actions d-flex gap-2" style={{ minWidth: '120px' }}>
                    <Button
                      variant="outline-success"
                      size="sm"
                      onClick={() => handleShowEditModal(cls)}
                    >
                      <i className="fas fa-edit"></i> تعديل
                    </Button>
                    <Button
                      variant="outline-danger"
                      size="sm"
                      onClick={() => handleDeleteRequest(cls)}
                    >
                      <i className="fas fa-trash"></i> حذف
                    </Button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="7" className="text-center">
                  لم يتم العثور على فصول دراسية.
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
      <ConfirmationModal
        show={showDeleteModal}
        handleClose={() => setShowDeleteModal(false)}
        handleConfirm={confirmDelete}
        title="تأكيد الحذف"
        body={`هل أنت متأكد من رغبتك في حذف الفصل "${classToDelete?.name}"؟`}
        confirmVariant="danger"
        confirmText="نعم، قم بالحذف"
      />
    </div>
  );
}

export default ClassesPage;
