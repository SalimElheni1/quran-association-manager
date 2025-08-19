import React, { useState, useEffect } from 'react';
import { Modal, Button, Form } from 'react-bootstrap';

function DonationFormModal({ show, onHide, onSave, donation }) {
  const [formData, setFormData] = useState({
    donor_name: '',
    amount: '',
    donation_date: new Date().toISOString().split('T')[0],
    notes: '',
  });

  const isEditMode = donation != null;

  useEffect(() => {
    if (isEditMode) {
      setFormData({
        ...donation,
        donation_date: new Date(donation.donation_date).toISOString().split('T')[0],
      });
    } else {
      setFormData({
        donor_name: '',
        amount: '',
        donation_date: new Date().toISOString().split('T')[0],
        notes: '',
      });
    }
  }, [donation, show]);

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
        <Modal.Title>{isEditMode ? 'تعديل تبرع' : 'إضافة تبرع جديد'}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form onSubmit={handleSubmit}>
          <Form.Group className="mb-3" controlId="formDonationDonor">
            <Form.Label>اسم المتبرع</Form.Label>
            <Form.Control
              type="text"
              name="donor_name"
              value={formData.donor_name}
              onChange={handleChange}
              required
            />
          </Form.Group>
          <Form.Group className="mb-3" controlId="formDonationAmount">
            <Form.Label>المبلغ</Form.Label>
            <Form.Control
              type="number"
              name="amount"
              value={formData.amount}
              onChange={handleChange}
              required
            />
          </Form.Group>
          <Form.Group className="mb-3" controlId="formDonationDate">
            <Form.Label>تاريخ التبرع</Form.Label>
            <Form.Control
              type="date"
              name="donation_date"
              value={formData.donation_date}
              onChange={handleChange}
              required
            />
          </Form.Group>
          <Form.Group className="mb-3" controlId="formDonationNotes">
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
              {isEditMode ? 'حفظ التعديلات' : 'إضافة التبرع'}
            </Button>
          </div>
        </Form>
      </Modal.Body>
    </Modal>
  );
}

export default DonationFormModal;
