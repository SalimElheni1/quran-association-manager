import React, { useState, useEffect } from 'react';
import { Modal, Button, Form, Alert } from 'react-bootstrap';

const RECEIPT_TYPES = [
  { value: 'payment', label: 'رسوم دراسية' },
  { value: 'donation', label: 'تبرعات' },
  { value: 'expense', label: 'مصاريف' },
  { value: 'salary', label: 'رواتب' }
];

const STATUS_OPTIONS = [
  { value: 'active', label: 'نشط' },
  { value: 'completed', label: 'مكتمل' },
  { value: 'cancelled', label: 'ملغي' }
];

function ReceiptBookFormModal({ show, onHide, onSave, book }) {
  const [formData, setFormData] = useState({
    book_number: '',
    start_receipt_number: 1,
    end_receipt_number: 100,
    receipt_type: 'payment',
    issued_date: new Date().toISOString().split('T')[0],
    notes: '',
    status: 'active'
  });
  const [error, setError] = useState(null);

  useEffect(() => {
    if (book) {
      setFormData({
        id: book.id,
        book_number: book.book_number,
        start_receipt_number: book.start_receipt_number,
        end_receipt_number: book.end_receipt_number,
        receipt_type: book.receipt_type,
        issued_date: book.issued_date.split('T')[0],
        notes: book.notes || '',
        status: book.status
      });
    } else {
      setFormData({
        book_number: '',
        start_receipt_number: 1,
        end_receipt_number: 100,
        receipt_type: 'payment',
        issued_date: new Date().toISOString().split('T')[0],
        notes: '',
        status: 'active'
      });
    }
    setError(null);
  }, [book, show]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!formData.book_number.trim()) {
      setError('رقم الدفتر مطلوب');
      return;
    }

    if (parseInt(formData.start_receipt_number) >= parseInt(formData.end_receipt_number)) {
      setError('رقم الإيصال النهائي يجب أن يكون أكبر من رقم الإيصال الأولي');
      return;
    }

    try {
      await onSave(formData);
    } catch (err) {
      setError(err.message || 'حدث خطأ أثناء الحفظ');
    }
  };

  return (
    <Modal show={show} onHide={onHide} size="lg" centered>
      <Modal.Header closeButton>
        <Modal.Title>{book ? 'تعديل دفتر إيصالات' : 'إضافة دفتر إيصالات جديد'}</Modal.Title>
      </Modal.Header>
      <Form onSubmit={handleSubmit}>
        <Modal.Body>
          {error && <Alert variant="danger">{error}</Alert>}
          
          <Form.Group className="mb-3">
            <Form.Label>رقم الدفتر *</Form.Label>
            <Form.Control
              type="text"
              name="book_number"
              value={formData.book_number}
              onChange={handleChange}
              placeholder="مثال: BOOK-2025-001"
              required
            />
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>نوع الإيصالات *</Form.Label>
            <Form.Select
              name="receipt_type"
              value={formData.receipt_type}
              onChange={handleChange}
              required
            >
              {RECEIPT_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </Form.Select>
          </Form.Group>

          <div className="row">
            <div className="col-md-6">
              <Form.Group className="mb-3">
                <Form.Label>رقم الإيصال الأولي *</Form.Label>
                <Form.Control
                  type="number"
                  name="start_receipt_number"
                  value={formData.start_receipt_number}
                  onChange={handleChange}
                  min="1"
                  required
                />
              </Form.Group>
            </div>
            <div className="col-md-6">
              <Form.Group className="mb-3">
                <Form.Label>رقم الإيصال النهائي *</Form.Label>
                <Form.Control
                  type="number"
                  name="end_receipt_number"
                  value={formData.end_receipt_number}
                  onChange={handleChange}
                  min="1"
                  required
                />
              </Form.Group>
            </div>
          </div>

          <Form.Group className="mb-3">
            <Form.Label>تاريخ الإصدار *</Form.Label>
            <Form.Control
              type="date"
              name="issued_date"
              value={formData.issued_date}
              onChange={handleChange}
              required
            />
          </Form.Group>

          {book && (
            <Form.Group className="mb-3">
              <Form.Label>الحالة</Form.Label>
              <Form.Select
                name="status"
                value={formData.status}
                onChange={handleChange}
              >
                {STATUS_OPTIONS.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
          )}

          <Form.Group className="mb-3">
            <Form.Label>ملاحظات</Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              placeholder="ملاحظات إضافية..."
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onHide}>
            إلغاء
          </Button>
          <Button variant="primary" type="submit">
            {book ? 'تحديث' : 'إضافة'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}

export default ReceiptBookFormModal;
