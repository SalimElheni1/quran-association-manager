import React, { useState } from 'react';
import { Modal, Button, Form } from 'react-bootstrap';
import PasswordInput from '@renderer/components/PasswordInput';

const PasswordPromptModal = ({
  show,
  onHide,
  onConfirm,
  title,
  body,
  showBackupKeyField = false,
}) => {
  const [password, setPassword] = useState('');
  const [backupKey, setBackupKey] = useState('');

  const handleConfirm = () => {
    onConfirm(password, backupKey);
    setPassword('');
    setBackupKey('');
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
          {showBackupKeyField && (
            <Form.Control
              className="mt-2"
              type="password"
              value={backupKey}
              onChange={(e) => setBackupKey(e.target.value)}
              placeholder="رمز النسخة الاحتياطية (اتركه فارغاً إذا كان غير مطلوب)"
            />
          )}
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