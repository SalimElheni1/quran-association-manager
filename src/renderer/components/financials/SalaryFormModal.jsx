import React, { useState, useEffect } from 'react';
import { Modal, Button, Form } from 'react-bootstrap';

function SalaryFormModal({ show, onHide, onSave, salary }) {
  const [formData, setFormData] = useState({
    teacher_id: '',
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    notes: '',
  });
  const [teachers, setTeachers] = useState([]);

  const isEditMode = salary != null;

  useEffect(() => {
    // Fetch teachers for the dropdown
    const fetchTeachers = async () => {
      try {
        const result = await window.electronAPI.getTeachers(); // Assuming getTeachers API exists
        setTeachers(result);
      } catch (err) {
        console.error('Failed to fetch teachers:', err);
      }
    };
    fetchTeachers();
  }, []);

  useEffect(() => {
    if (isEditMode) {
      setFormData({
        ...salary,
        payment_date: new Date(salary.payment_date).toISOString().split('T')[0],
      });
    } else {
      setFormData({
        teacher_id: '',
        amount: '',
        payment_date: new Date().toISOString().split('T')[0],
        notes: '',
      });
    }
  }, [salary, show]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title>{isEditMode ? 'تعديل راتب' : 'إضافة راتب جديد'}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form onSubmit={handleSubmit}>
          <Form.Group className="mb-3" controlId="formSalaryTeacher">
            <Form.Label>
              المعلم<span className="text-danger">*</span>
            </Form.Label>
            <Form.Control
              as="select"
              name="teacher_id"
              value={formData.teacher_id}
              onChange={handleChange}
              required
            >
              <option value="">اختر معلماً...</option>
              {teachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.name}
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
