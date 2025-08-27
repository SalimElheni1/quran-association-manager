import React from 'react';
import { Modal, Button, Alert } from 'react-bootstrap';
import { toast } from 'react-toastify';

function InitialCredentialsModal({ show, credentials }) {
  if (!credentials) return null;

  const handleCopy = () => {
    const textToCopy = `Username: ${credentials.username}\nPassword: ${credentials.password}`;
    navigator.clipboard.writeText(textToCopy);
    toast.success('تم نسخ بيانات الاعتماد بنجاح!');
  };

  return (
    <Modal show={show} backdrop="static" keyboard={false} centered>
      <Modal.Header>
        <Modal.Title>مهم: بيانات اعتماد المدير الخارق</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Alert variant="warning">
          <Alert.Heading>يرجى حفظ هذه المعلومات في مكان آمن!</Alert.Heading>
          <p>
            هذه هي كلمة المرور المؤقتة للمدير الخارق. ستحتاجها لتسجيل الدخول لأول مرة.
            <br />
            <strong>نوصي بشدة بتغيير كلمة المرور هذه بعد تسجيل الدخول.</strong>
          </p>
        </Alert>
        <div className="p-3 bg-light rounded">
          <p>
            <strong>اسم المستخدم:</strong> {credentials.username}
          </p>
          <p>
            <strong>كلمة المرور:</strong> {credentials.password}
          </p>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="primary" onClick={handleCopy}>
          <i className="fas fa-copy me-2"></i>
          نسخ بيانات الاعتماد
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

export default InitialCredentialsModal;
