import React, { useState } from 'react';
import { Modal, Button, Form } from 'react-bootstrap';
import PasswordInput from '@renderer/components/PasswordInput';

const PasswordPromptModal = ({ show, onHide, onConfirm, title, body }) => {
  const [password, setPassword] = useState('');

  const handleConfirm = () => {
    onConfirm(password);
    setPassword('');
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && password) {
      handleConfirm();
    }
  };

  return (
    <Modal show={show} onHide={onHide} centered onKeyPress={handleKeyPress} backdrop="static">
      <Modal.Header closeButton>
        <Modal.Title>{title}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>{body}</p>
        <Form>
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="أدخل كلمة المرور الخاصة بك"
            required
            autoFocus
          />
        </Form>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          إلغاء
        </Button>
        <Button variant="primary" onClick={handleConfirm} disabled={!password}>
          تأكيد
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default PasswordPromptModal;
