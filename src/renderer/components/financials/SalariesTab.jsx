import React, { useState, useEffect } from 'react';
import { Table, Button, Spinner, Alert } from 'react-bootstrap';
import SalaryFormModal from '@renderer/components/financials/SalaryFormModal';
import ConfirmationModal from '@renderer/components/common/ConfirmationModal';
import { error as logError } from '@renderer/utils/logger';

function SalariesTab() {
  const [salaries, setSalaries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingSalary, setEditingSalary] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [salaryToDelete, setSalaryToDelete] = useState(null);

  const fetchSalaries = async () => {
    try {
      setLoading(true);
      const result = await window.electronAPI.getSalaries();
      setSalaries(result);
      setError(null);
    } catch (err) {
      logError('Failed to fetch salaries:', err);
      setError(err.message || 'فشل جلب قائمة الرواتب.');
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
      logError('Failed to save salary:', err);
      setError(err.message || 'فشل حفظ الراتب.');
    }
  };

  const handleDeleteRequest = (salary) => {
    setSalaryToDelete(salary);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!salaryToDelete) return;
    try {
      await window.electronAPI.deleteSalary(salaryToDelete.id);
      setSalaries(salaries.filter((s) => s.id !== salaryToDelete.id));
    } catch (err) {
      logError('Failed to delete salary:', err);
      setError(err.message || 'فشل حذف الراتب.');
    } finally {
      setShowDeleteModal(false);
      setSalaryToDelete(null);
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
      {error && (
        <Alert variant="danger" onClose={() => setError(null)} dismissible>
          {error}
        </Alert>
      )}
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h4>سجل الرواتب والأجور</h4>
        <Button variant="primary" onClick={() => handleShowModal()}>
          إضافة راتب
        </Button>
      </div>
      <Table striped bordered hover responsive>
        <thead>
          <tr>
            <th>#</th>
            <th>اسم الموظف</th>
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
                <td>{salary.employee_name}</td>
                <td className="text-start">{salary.amount.toFixed(2)}</td>
                <td>{new Date(salary.payment_date).toLocaleDateString()}</td>
                <td>{salary.notes}</td>
                <td>
                  <Button
                    variant="outline-secondary"
                    size="sm"
                    className="me-2"
                    onClick={() => handleShowModal(salary)}
                  >
                    تعديل
                  </Button>
                  <Button
                    variant="outline-danger"
                    size="sm"
                    onClick={() => handleDeleteRequest(salary)}
                  >
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
      <ConfirmationModal
        show={showDeleteModal}
        handleClose={() => setShowDeleteModal(false)}
        handleConfirm={confirmDelete}
        title="تأكيد حذف الراتب"
        body={`هل أنت متأكد من رغبتك في حذف هذا الراتب؟ لا يمكن التراجع عن هذا الإجراء.`}
        confirmVariant="danger"
        confirmText="نعم، حذف"
      />
    </div>
  );
}

export default SalariesTab;
