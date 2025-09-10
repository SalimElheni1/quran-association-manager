import React, { useState, useEffect } from 'react';
import { Modal, Button, Form } from 'react-bootstrap';
import { error as logError } from '@renderer/utils/logger';

function SalaryFormModal({ show, onHide, onSave, salary }) {
  const [formData, setFormData] = useState({
    employee: '', // Combined field for user_id and user_type
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    notes: '',
  });
  const [employees, setEmployees] = useState([]);

  const isEditMode = salary != null;

  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        const [teachers, users] = await Promise.all([
          window.electronAPI.getTeachers(),
          window.electronAPI.getUsers({ roleFilter: 'all', statusFilter: 'active' }),
        ]);

        const teacherOptions = teachers.map((t) => ({
          value: `teacher-${t.id}`,
          label: `${t.name} (معلم)`,
        }));

        const adminOptions = users.map((u) => ({
          value: `admin-${u.id}`,
          label: `${u.first_name} ${u.last_name} (إداري)`,
        }));

        setEmployees([...teacherOptions, ...adminOptions]);
      } catch (err) {
        logError('Failed to fetch employees:', err);
      }
    };
    fetchEmployees();
  }, []);

  useEffect(() => {
    if (show) {
      if (isEditMode && salary) {
        setFormData({
          employee: `${salary.user_type}-${salary.user_id}`,
          amount: salary.amount,
          payment_date: new Date(salary.payment_date).toISOString().split('T')[0],
          notes: salary.notes || '',
        });
      } else {
        setFormData({
          employee: '',
          amount: '',
          payment_date: new Date().toISOString().split('T')[0],
          notes: '',
        });
      }
    }
  }, [salary, isEditMode, show]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const [user_type, user_id] = formData.employee.split('-');
    const submissionData = {
      ...formData,
      user_id: parseInt(user_id, 10),
      user_type,
    };
    delete submissionData.employee; // Clean up the combined field
    onSave(submissionData);
  };

  return (
    <Modal show={show} onHide={onHide} centered backdrop="static">
      <Modal.Header closeButton>
        <Modal.Title>{isEditMode ? 'تعديل راتب' : 'إضافة راتب جديد'}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form onSubmit={handleSubmit}>
          <Form.Group className="mb-3" controlId="formSalaryEmployee">
            <Form.Label>
              الموظف<span className="text-danger">*</span>
            </Form.Label>
            <Form.Control
              as="select"
              name="employee"
              value={formData.employee}
              onChange={handleChange}
              required
              disabled={isEditMode} // Prevent changing the employee when editing
            >
              <option value="">اختر موظفاً...</option>
              {employees.map((emp) => (
                <option key={emp.value} value={emp.value}>
                  {emp.label}
                </option>
              ))}
            </Form.Control>
          </Form.Group>
          <Form.Group className="mb-3" controlId="formSalaryAmount">
            <Form.Label>
              المبلغ<span className="text-danger">*</span>
            </Form.Label>
            <Form.Control
              type="number"
              name="amount"
              value={formData.amount}
              onChange={handleChange}
              required
            />
          </Form.Group>
          <Form.Group className="mb-3" controlId="formSalaryDate">
            <Form.Label>
              تاريخ الدفع<span className="text-danger">*</span>
            </Form.Label>
            <Form.Control
              type="date"
              name="payment_date"
              value={formData.payment_date}
              onChange={handleChange}
              required
            />
          </Form.Group>
          <Form.Group className="mb-3" controlId="formSalaryNotes">
            <Form.Label>ملاحظات</Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              name="notes"
              value={formData.notes}
              onChange={handleChange}
            />
          </Form.Group>
          <div className="d-grid">
            <Button variant="primary" type="submit">
              {isEditMode ? 'حفظ التعديلات' : 'إضافة الراتب'}
            </Button>
          </div>
        </Form>
      </Modal.Body>
    </Modal>
  );
}

export default SalaryFormModal;
