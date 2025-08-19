import React, { useState, useEffect } from 'react';
import { Table, Button, Spinner, Alert } from 'react-bootstrap';
import SalaryFormModal from './SalaryFormModal';

function SalariesTab() {
  const [salaries, setSalaries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingSalary, setEditingSalary] = useState(null);

  const fetchSalaries = async () => {
    try {
      setLoading(true);
      const result = await window.electronAPI.getSalaries();
      setSalaries(result);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch salaries:', err);
      setError(err.message || 'فشل في جلب قائمة الرواتب.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSalaries();
  }, []);

  const handleShowModal = (salary = null) => {
    setEditingSalary(salary);
    setShowModal(true);
  };

  const handleHideModal = () => {
    setShowModal(false);
    setEditingSalary(null);
  };

  const handleSave = async (formData) => {
    try {
      if (editingSalary) {
        const updatedSalary = await window.electronAPI.updateSalary(formData);
        setSalaries(salaries.map((s) => (s.id === updatedSalary.id ? updatedSalary : s)));
      } else {
        const newSalary = await window.electronAPI.addSalary(formData);
        setSalaries([newSalary, ...salaries]);
      }
      handleHideModal();
    } catch (err) {
      console.error('Failed to save salary:', err);
      setError(err.message || 'فشل في حفظ الراتب.');
    }
  };

  const handleDelete = async (salaryId) => {
    if (window.confirm('هل أنت متأكد من رغبتك في حذف هذا الراتب؟')) {
      try {
        await window.electronAPI.deleteSalary(salaryId);
        setSalaries(salaries.filter((s) => s.id !== salaryId));
      } catch (err) {
        console.error('Failed to delete salary:', err);
        setError(err.message || 'فشل في حذف الراتب.');
      }
    }
  };

  if (loading) {
    return (
      <div className="text-center">
        <Spinner animation="border" role="status">
          <span className="visually-hidden">Loading...</span>
        </Spinner>
      </div>
    );
  }

  return (
    <div>
      {error && <Alert variant="danger" onClose={() => setError(null)} dismissible>{error}</Alert>}
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4>قائمة الرواتب</h4>
        <Button variant="primary" onClick={() => handleShowModal()}>إضافة راتب جديد</Button>
      </div>
      <Table striped bordered hover responsive>
        <thead>
          <tr>
            <th>#</th>
            <th>المعلم</th>
            <th>المبلغ</th>
            <th>تاريخ الدفع</th>
            <th>ملاحظات</th>
            <th>الإجراءات</th>
          </tr>
        </thead>
        <tbody>
          {salaries.length > 0 ? (
            salaries.map((salary) => (
              <tr key={salary.id}>
                <td>{salary.id}</td>
                <td>{salary.teacher_name}</td>
                <td>{salary.amount.toFixed(2)}</td>
                <td>{new Date(salary.payment_date).toLocaleDateString()}</td>
                <td>{salary.notes}</td>
                <td>
                  <Button variant="outline-secondary" size="sm" className="me-2" onClick={() => handleShowModal(salary)}>
                    تعديل
                  </Button>
                  <Button variant="outline-danger" size="sm" onClick={() => handleDelete(salary.id)}>
                    حذف
                  </Button>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="6" className="text-center">
                لا توجد رواتب مسجلة حالياً.
              </td>
            </tr>
          )}
        </tbody>
      </Table>

      <SalaryFormModal
        show={showModal}
        onHide={handleHideModal}
        onSave={handleSave}
        salary={editingSalary}
      />
    </div>
  );
}

export default SalariesTab;
