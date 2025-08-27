import React, { useState, useEffect } from 'react';
import { Modal, Button, Form } from 'react-bootstrap';

function ExpenseFormModal({ show, onHide, onSave, expense }) {
  const [formData, setFormData] = useState({
    category: '',
    amount: '',
    expense_date: new Date().toISOString().split('T')[0], // Default to today
    responsible_person: '',
    description: '',
  });

  const isEditMode = expense != null;

  useEffect(() => {
    if (isEditMode) {
      setFormData({
        ...expense,
        expense_date: new Date(expense.expense_date).toISOString().split('T')[0],
      });
    } else {
      // Reset form for add mode
      setFormData({
        category: '',
        amount: '',
        expense_date: new Date().toISOString().split('T')[0],
        responsible_person: '',
        description: '',
      });
    }
  }, [expense, show]);

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
        <Modal.Title>{isEditMode ? 'تعديل مصروف' : 'إضافة مصروف جديد'}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form onSubmit={handleSubmit}>
          <Form.Group className="mb-3" controlId="formExpenseCategory">
            <Form.Label>
              الفئة<span className="text-danger">*</span>
            </Form.Label>
            <Form.Control
              type="text"
              name="category"
              value={formData.category}
              onChange={handleChange}
              required
            />
          </Form.Group>
          <Form.Group className="mb-3" controlId="formExpenseAmount">
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
          <Form.Group className="mb-3" controlId="formExpenseDate">
            <Form.Label>
              تاريخ الصرف<span className="text-danger">*</span>
            </Form.Label>
            <Form.Control
              type="date"
              name="expense_date"
              value={formData.expense_date}
              onChange={handleChange}
              required
            />
          </Form.Group>
          <Form.Group className="mb-3" controlId="formExpenseResponsible">
            <Form.Label>المسؤول</Form.Label>
            <Form.Control
              type="text"
              name="responsible_person"
              value={formData.responsible_person}
              onChange={handleChange}
            />
          </Form.Group>
          <Form.Group className="mb-3" controlId="formExpenseDescription">
            <Form.Label>الوصف</Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              name="description"
              value={formData.description}
              onChange={handleChange}
            />
          </Form.Group>
          <div className="d-grid">
            <Button variant="primary" type="submit">
              {isEditMode ? 'حفظ التعديلات' : 'إضافة المصروف'}
            </Button>
          </div>
        </Form>
      </Modal.Body>
    </Modal>
  );
}

export default ExpenseFormModal;
