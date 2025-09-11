import React, { useState, useEffect } from 'react';
import { Modal, Button, Form } from 'react-bootstrap';
import { toast } from 'react-toastify';

function GroupFormModal({ show, handleClose, onSave, group }) {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: 'General', // Default value
    target_gender: 'All',
    min_age: '',
    max_age: '',
  });

  const isEditing = !!group;

  useEffect(() => {
    if (show) {
      if (isEditing) {
        setFormData({
          name: group.name || '',
          description: group.description || '',
          category: group.category || 'General',
          target_gender: group.target_gender || 'All',
          min_age: group.min_age || '',
          max_age: group.max_age || '',
        });
      } else {
        // Reset form for new group
        setFormData({
          name: '',
          description: '',
          category: 'General',
          target_gender: 'All',
          min_age: '',
          max_age: '',
        });
      }
    }
  }, [group, isEditing, show]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name || !formData.category) {
      toast.error('اسم المجموعة والفئة حقول إلزامية.');
      return;
    }
    onSave(formData, group?.id);
  };

  const groupCategories = ['Kids', 'Women', 'Men', 'Senior Women', 'General'];

  return (
    <Modal show={show} onHide={handleClose} centered>
      <Modal.Header closeButton>
        <Modal.Title>{isEditing ? 'تعديل مجموعة' : 'إضافة مجموعة جديدة'}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form onSubmit={handleSubmit}>
          <Form.Group className="mb-3" controlId="groupName">
            <Form.Label>اسم المجموعة</Form.Label>
            <Form.Control
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
            />
          </Form.Group>

          <Form.Group className="mb-3" controlId="groupDescription">
            <Form.Label>الوصف</Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              name="description"
              value={formData.description}
              onChange={handleChange}
            />
          </Form.Group>

          <Form.Group className="mb-3" controlId="groupCategory">
            <Form.Label>الفئة</Form.Label>
            <Form.Select
              name="category"
              value={formData.category}
              onChange={handleChange}
              required
            >
              {groupCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </Form.Select>
          </Form.Group>

          <Form.Group className="mb-3" controlId="groupTargetGender">
            <Form.Label>الجنس المستهدف</Form.Label>
            <Form.Select
              name="target_gender"
              value={formData.target_gender}
              onChange={handleChange}
            >
              <option value="All">الكل</option>
              <option value="Male">ذكور</option>
              <option value="Female">إناث</option>
            </Form.Select>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label>الفئة العمرية (اختياري)</Form.Label>
            <div className="d-flex gap-2">
              <Form.Control
                type="number"
                name="min_age"
                placeholder="العمر الأدنى"
                value={formData.min_age}
                onChange={handleChange}
              />
              <Form.Control
                type="number"
                name="max_age"
                placeholder="العمر الأقصى"
                value={formData.max_age}
                onChange={handleChange}
              />
            </div>
          </Form.Group>

          <Modal.Footer>
            <Button variant="secondary" onClick={handleClose}>
              إلغاء
            </Button>
            <Button variant="primary" type="submit">
              {isEditing ? 'حفظ التعديلات' : 'إضافة المجموعة'}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal.Body>
    </Modal>
  );
}

export default GroupFormModal;
