import React, { useState, useEffect } from 'react';
import { Modal, Button, Form } from 'react-bootstrap';

function DonationFormModal({ show, onHide, onSave, donation }) {
  const [formData, setFormData] = useState({
    donor_name: '',
    amount: '',
    donation_date: new Date().toISOString().split('T')[0],
    donation_type: 'Cash',
    description: '',
    notes: '',
    quantity: '',
    category: '',
  });

  const isEditMode = donation != null;

  useEffect(() => {
    if (isEditMode) {
      setFormData({
        donor_name: donation.donor_name || '',
        amount: donation.amount || '',
        donation_date: new Date(donation.donation_date).toISOString().split('T')[0],
        donation_type: donation.donation_type || 'Cash',
        description: donation.description || '',
        notes: donation.notes || '',
        id: donation.id,
        quantity: donation.quantity || '',
        category: donation.category || '',
      });
    } else {
      setFormData({
        donor_name: '',
        amount: '',
        donation_date: new Date().toISOString().split('T')[0],
        donation_type: 'Cash',
        description: '',
        notes: '',
        quantity: '',
        category: '',
      });
    }
  }, [donation, show]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const dataToSave = { ...formData };
    if (dataToSave.donation_type === 'Cash') {
      dataToSave.description = null;
      dataToSave.quantity = null;
      dataToSave.category = null;
    } else {
      dataToSave.amount = null;
    }
    onSave(dataToSave);
  };

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title>{isEditMode ? 'تعديل تبرع' : 'إضافة تبرع جديد'}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form onSubmit={handleSubmit}>
          <Form.Group className="mb-3" controlId="formDonationDonor">
            <Form.Label>
              اسم المتبرع<span className="text-danger">*</span>
            </Form.Label>
            <Form.Control
              type="text"
              name="donor_name"
              value={formData.donor_name}
              onChange={handleChange}
              required
            />
          </Form.Group>

          <Form.Group className="mb-3" controlId="formDonationType">
            <Form.Label>
              نوع التبرع<span className="text-danger">*</span>
            </Form.Label>
            <Form.Control
              as="select"
              name="donation_type"
              value={formData.donation_type}
              onChange={handleChange}
            >
              <option value="Cash">نقدي</option>
              <option value="In-kind">عيني</option>
            </Form.Control>
          </Form.Group>

          {formData.donation_type === 'Cash' ? (
            <Form.Group className="mb-3" controlId="formDonationAmount">
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
          ) : (
            <>
              <Form.Group className="mb-3" controlId="formDonationDescription">
                <Form.Label>
                  وصف التبرع العيني<span className="text-danger">*</span>
                </Form.Label>
                <Form.Control
                  as="textarea"
                  rows={2}
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  required
                />
              </Form.Group>
              <Form.Group className="mb-3" controlId="formDonationQuantity">
                <Form.Label>الكمية</Form.Label>
                <Form.Control
                  type="number"
                  name="quantity"
                  value={formData.quantity}
                  onChange={handleChange}
                />
              </Form.Group>
              <Form.Group className="mb-3" controlId="formDonationCategory">
                <Form.Label>الصنف</Form.Label>
                <Form.Control
                  type="text"
                  name="category"
                  value={formData.category}
                  onChange={handleChange}
                />
              </Form.Group>
            </>
          )}

          <Form.Group className="mb-3" controlId="formDonationDate">
            <Form.Label>
              تاريخ التبرع<span className="text-danger">*</span>
            </Form.Label>
            <Form.Control
              type="date"
              name="donation_date"
              value={formData.donation_date}
              onChange={handleChange}
              required
            />
          </Form.Group>

          <Form.Group className="mb-3" controlId="formDonationNotes">
            <Form.Label>ملاحظات إضافية</Form.Label>
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
