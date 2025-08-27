import React, { useState, useEffect } from 'react';
import { Modal, Button, Form, Row, Col } from 'react-bootstrap';

function TeacherFormModal({ show, handleClose, onSave, teacher }) {
  const [formData, setFormData] = useState({});
  const isEditMode = !!teacher;

  useEffect(() => {
    const initialData = {
      name: '',
      national_id: '',
      contact_info: '',
      email: '',
      address: '',
      date_of_birth: '',
      gender: 'Male',
      educational_level: '',
      specialization: '',
      years_of_experience: '',
      availability: '',
      notes: '',
    };

    if (isEditMode && teacher) {
      setFormData({
        ...initialData,
        ...teacher,
        date_of_birth: teacher.date_of_birth ? teacher.date_of_birth.split('T')[0] : '',
      });
    } else {
      setFormData(initialData);
    }
  }, [teacher, show, isEditMode]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData, teacher ? teacher.id : null);
  };

  return (
    <Modal show={show} onHide={handleClose} centered size="lg">
      <Form onSubmit={handleSubmit}>
        <Modal.Header closeButton>
          <Modal.Title>{isEditMode ? 'تعديل بيانات المعلم' : 'إضافة معلم جديد'}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {isEditMode && (
            <Row>
              <Form.Group as={Col} className="mb-3">
                <Form.Label>الرقم التعريفي</Form.Label>
                <Form.Control type="text" value={formData.matricule || ''} readOnly disabled />
              </Form.Group>
            </Row>
          )}
          <h5 className="form-section-title">المعلومات الشخصية</h5>
          <Row>
            <Form.Group as={Col} md="6" className="mb-3">
              <Form.Label>
                الاسم الكامل<span className="text-danger">*</span>
              </Form.Label>
              <Form.Control
                type="text"
                name="name"
                value={formData.name || ''}
                onChange={handleChange}
                required
              />
            </Form.Group>
            <Form.Group as={Col} md="6" className="mb-3">
              <Form.Label>رقم الهوية الوطنية (CIN)</Form.Label>
              <Form.Control
                type="text"
                name="national_id"
                value={formData.national_id || ''}
                onChange={handleChange}
              />
            </Form.Group>
          </Row>
          <Row>
            <Form.Group as={Col} md="6" className="mb-3">
              <Form.Label>رقم الهاتف</Form.Label>
              <Form.Control
                type="text"
                name="contact_info"
                value={formData.contact_info || ''}
                onChange={handleChange}
              />
              <Form.Text className="text-muted">(مثال: +123456789)</Form.Text>
            </Form.Group>
            <Form.Group as={Col} md="6" className="mb-3">
              <Form.Label>
                البريد الإلكتروني<span className="text-danger">*</span>
              </Form.Label>
              <Form.Control
                type="email"
                name="email"
                value={formData.email || ''}
                onChange={handleChange}
              />
              <Form.Text className="text-muted">(مثال: user@example.com)</Form.Text>
            </Form.Group>
          </Row>
          <Row>
            <Form.Group as={Col} md="6" className="mb-3">
              <Form.Label>تاريخ الميلاد</Form.Label>
              <Form.Control
                type="date"
                name="date_of_birth"
                value={formData.date_of_birth || ''}
                onChange={handleChange}
              />
            </Form.Group>
            <Form.Group as={Col} md="6" className="mb-3">
              <Form.Label>الجنس</Form.Label>
              <Form.Select name="gender" value={formData.gender || 'Male'} onChange={handleChange}>
                <option value="Male">ذكر</option>
                <option value="Female">أنثى</option>
              </Form.Select>
            </Form.Group>
          </Row>
          <Form.Group className="mb-3">
            <Form.Label>العنوان</Form.Label>
            <Form.Control
              as="textarea"
              rows={2}
              name="address"
              value={formData.address || ''}
              onChange={handleChange}
            />
          </Form.Group>

          <hr />

          <h5 className="form-section-title">المعلومات المهنية</h5>
          <Row>
            <Form.Group as={Col} md="6" className="mb-3">
              <Form.Label>المستوى التعليمي</Form.Label>
              <Form.Control
                type="text"
                name="educational_level"
                value={formData.educational_level || ''}
                onChange={handleChange}
              />
            </Form.Group>
            <Form.Group as={Col} md="6" className="mb-3">
              <Form.Label>التخصص</Form.Label>
              <Form.Control
                type="text"
                name="specialization"
                value={formData.specialization || ''}
                onChange={handleChange}
                placeholder="مثال: تجويد، حفظ"
              />
            </Form.Group>
          </Row>
          <Row>
            <Form.Group as={Col} md="6" className="mb-3">
              <Form.Label>سنوات الخبرة</Form.Label>
              <Form.Control
                type="number"
                name="years_of_experience"
                value={formData.years_of_experience || ''}
                onChange={handleChange}
              />
            </Form.Group>
            <Form.Group as={Col} md="6" className="mb-3">
              <Form.Label>التفرغ</Form.Label>
              <Form.Control
                type="text"
                name="availability"
                value={formData.availability || ''}
                onChange={handleChange}
                placeholder="مثال: دوام كامل، صباحي فقط"
              />
            </Form.Group>
          </Row>
          <Form.Group className="mb-3">
            <Form.Label>ملاحظات</Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              name="notes"
              value={formData.notes || ''}
              onChange={handleChange}
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleClose}>
            إلغاء
          </Button>
          <Button variant="primary" type="submit">
            {isEditMode ? 'حفظ التعديلات' : 'إضافة المعلم'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}

export default TeacherFormModal;
