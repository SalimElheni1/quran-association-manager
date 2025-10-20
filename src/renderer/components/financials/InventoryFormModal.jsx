import React, { useState, useEffect } from 'react';
import { Modal, Button, Form, Row, Col } from 'react-bootstrap';

const initialFormData = {
  item_name: '',
  category: '',
  quantity: 0,
  unit_value: 0,
  acquisition_date: new Date().toISOString().split('T')[0],
  acquisition_source: 'تبرع',
  condition_status: 'New',
  location: '',
  notes: '',
};

function InventoryFormModal({ show, onHide, onSave, item }) {
  const [formData, setFormData] = useState(initialFormData);
  const [categories, setCategories] = useState([]);

  const isEditMode = item != null;

  useEffect(() => {
    if (show) {
      window.electronAPI
        .getInKindCategories()
        .then(setCategories)
        .catch(() => {});
    }
  }, [show]);

  useEffect(() => {
    if (show) {
      if (isEditMode) {
        setFormData({
          ...initialFormData,
          ...item,
          acquisition_date: item.acquisition_date
            ? new Date(item.acquisition_date).toISOString().split('T')[0]
            : new Date().toISOString().split('T')[0],
        });
      } else {
        setFormData(initialFormData);
      }
    }
  }, [item, isEditMode, show]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
    onHide(); // Close modal on save
  };

  return (
    <Modal show={show} onHide={onHide} centered size="lg" backdrop="static">
      <Modal.Header closeButton>
        <Modal.Title>{isEditMode ? 'تعديل صنف' : 'إضافة صنف جديد'}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form onSubmit={handleSubmit}>
          {isEditMode && (
            <Form.Group as={Row} className="mb-3">
              <Form.Label column sm={3}>
                الرقم التعريفي
              </Form.Label>
              <Col sm={9}>
                <Form.Control type="text" readOnly defaultValue={item.matricule} />
              </Col>
            </Form.Group>
          )}

          <Form.Group as={Row} className="mb-3">
            <Form.Label column sm={3}>
              اسم الصنف<span className="text-danger">*</span>
            </Form.Label>
            <Col sm={9}>
              <Form.Control
                type="text"
                name="item_name"
                value={formData.item_name}
                onChange={handleChange}
                required
              />
            </Col>
          </Form.Group>

          <Row>
            <Col md={6}>
              <Form.Group className="mb-3">
                <Form.Label>
                  الفئة <span className="text-danger">*</span>
                </Form.Label>
                <Form.Control
                  as="select"
                  name="category"
                  value={formData.category}
                  onChange={handleChange}
                  required
                >
                  <option value="">اختر الفئة</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.name}>
                      {cat.name}
                    </option>
                  ))}
                </Form.Control>
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group className="mb-3">
                <Form.Label>الحالة</Form.Label>
                <Form.Control
                  as="select"
                  name="condition_status"
                  value={formData.condition_status}
                  onChange={handleChange}
                >
                  <option value="New">جديد</option>
                  <option value="Good">جيد</option>
                  <option value="Fair">مقبول</option>
                  <option value="Poor">رديء</option>
                </Form.Control>
              </Form.Group>
            </Col>
          </Row>

          <Row>
            <Col md={4}>
              <Form.Group className="mb-3">
                <Form.Label>الكمية</Form.Label>
                <Form.Control
                  type="number"
                  name="quantity"
                  value={formData.quantity}
                  onChange={handleChange}
                />
              </Form.Group>
            </Col>
            <Col md={4}>
              <Form.Group className="mb-3">
                <Form.Label>قيمة الوحدة (دينار)</Form.Label>
                <Form.Control
                  type="number"
                  step="0.001"
                  name="unit_value"
                  value={formData.unit_value}
                  onChange={handleChange}
                />
              </Form.Group>
            </Col>
            <Col md={4}>
              <Form.Group className="mb-3">
                <Form.Label>القيمة الإجمالية</Form.Label>
                <Form.Control
                  type="text"
                  value={(formData.quantity * formData.unit_value).toFixed(3) + ' د.ت'}
                  readOnly
                  disabled
                />
              </Form.Group>
            </Col>
          </Row>

          <Row>
            <Col md={6}>
              <Form.Group className="mb-3">
                <Form.Label>تاريخ الاقتناء</Form.Label>
                <Form.Control
                  type="date"
                  name="acquisition_date"
                  value={formData.acquisition_date}
                  onChange={handleChange}
                />
              </Form.Group>
            </Col>
            <Col md={6}>
              <Form.Group className="mb-3">
                <Form.Label>مصدر الاقتناء</Form.Label>
                <Form.Control
                  as="select"
                  name="acquisition_source"
                  value={formData.acquisition_source}
                  onChange={handleChange}
                >
                  <option value="تبرع">تبرع</option>
                  <option value="شراء">شراء</option>
                  <option value="أخرى">أخرى</option>
                </Form.Control>
              </Form.Group>
            </Col>
          </Row>

          <Form.Group className="mb-3">
            <Form.Label>موقع التخزين</Form.Label>
            <Form.Control
              type="text"
              name="location"
              value={formData.location}
              onChange={handleChange}
            />
          </Form.Group>

          <Form.Group className="mb-3">
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
              {isEditMode ? 'حفظ التعديلات' : 'إضافة الصنف'}
            </Button>
          </div>
        </Form>
      </Modal.Body>
    </Modal>
  );
}

export default InventoryFormModal;
