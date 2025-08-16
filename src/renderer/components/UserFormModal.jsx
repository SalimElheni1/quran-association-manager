import React, { useState } from 'react';
import { Modal, Button, Form } from 'react-bootstrap';
import { toast } from 'react-toastify';

function UserFormModal({ show, handleClose, onSaveSuccess }) {
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    role: 'Teacher', // Default role
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await window.electronAPI.addUser(formData);
      toast.success('تمت إضافة المستخدم بنجاح!');
      onSaveSuccess();
    } catch (err) {
      console.error('Error adding user:', err);
      const friendlyMessage = err.message.split('Error:').pop().trim();
      toast.error(friendlyMessage);
    }
  };

  return (
    <Modal show={show} onHide={handleClose} centered>
      <Form onSubmit={handleSubmit}>
        <Modal.Header closeButton>
          <Modal.Title>إضافة مستخدم جديد</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group className="mb-3">
            <Form.Label>اسم المستخدم</Form.Label>
            <Form.Control
              type="text"
              name="username"
              value={formData.username}
              onChange={handleChange}
              required
              minLength="3"
            />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>كلمة المرور</Form.Label>
            <Form.Control
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              required
              minLength="8"
            />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label>الدور</Form.Label>
            <Form.Select name="role" value={formData.role} onChange={handleChange}>
              <option value="Teacher">معلم</option>
              <option value="Branch Admin">مدير فرع</option>
            </Form.Select>
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleClose}>
            إلغاء
          </Button>
          <Button variant="primary" type="submit">
            إضافة المستخدم
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}

export default UserFormModal;
