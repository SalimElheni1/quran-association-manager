import React, { useState, useEffect } from 'react';
import { Modal, Button, Form } from 'react-bootstrap';
import { error as logError } from '@renderer/utils/logger';

function PaymentFormModal({ show, onHide, onSave, payment }) {
  const [formData, setFormData] = useState({
    student_id: '',
    amount: '',
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'Cash',
    notes: '',
  });
  const [students, setStudents] = useState([]);

  const isEditMode = payment != null;

  useEffect(() => {
    // Fetch students for the dropdown
    const fetchStudents = async () => {
      try {
        const result = await window.electronAPI.getStudents(); // Assuming getStudents API exists
        setStudents(result);
      } catch (err) {
        logError('Failed to fetch students:', err);
      }
    };
    fetchStudents();
  }, []);

  useEffect(() => {
    if (isEditMode) {
      setFormData({
        ...payment,
        payment_date: new Date(payment.payment_date).toISOString().split('T')[0],
      });
    } else {
      setFormData({
        student_id: '',
        amount: '',
        payment_date: new Date().toISOString().split('T')[0],
        payment_method: 'Cash',
        notes: '',
      });
    }
  }, [payment, show]);

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
        <Modal.Title>{isEditMode ? 'تعديل دفعة' : 'إضافة دفعة جديدة'}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form onSubmit={handleSubmit}>
          <Form.Group className="mb-3" controlId="formPaymentStudent">
            <Form.Label>
              الطالب<span className="text-danger">*</span>
            </Form.Label>
            <Form.Control
              as="select"
              name="student_id"
              value={formData.student_id}
              onChange={handleChange}
              required
            >
              <option value="">اختر طالباً...</option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.name}
                </option>
              ))}
            </Form.Control>
          </Form.Group>
          <Form.Group className="mb-3" controlId="formPaymentAmount">
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
          <Form.Group className="mb-3" controlId="formPaymentMethod">
            <Form.Label>
              طريقة الدفع<span className="text-danger">*</span>
            </Form.Label>
            <Form.Control
              as="select"
              name="payment_method"
              value={formData.payment_method}
              onChange={handleChange}
              required
            >
              <option value="Cash">نقداً</option>
              <option value="Bank Transfer">تحويل بنكي</option>
              <option value="Online">عبر الإنترنت</option>
              <option value="Other">أخرى</option>
            </Form.Control>
          </Form.Group>
          <Form.Group className="mb-3" controlId="formPaymentDate">
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
          <Form.Group className="mb-3" controlId="formPaymentNotes">
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
              {isEditMode ? 'حفظ التعديلات' : 'إضافة الدفعة'}
            </Button>
          </div>
        </Form>
      </Modal.Body>
    </Modal>
  );
}

export default PaymentFormModal;
