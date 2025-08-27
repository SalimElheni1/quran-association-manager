import React from 'react';
import { Modal, Button, Alert } from 'react-bootstrap';
import { toast } from 'react-toastify';

function InitialCredentialsModal({ show, handleClose, credentials }) {
  if (!credentials) return null;

  const handleCopyAndClose = () => {
    const textToCopy = `Username: ${credentials.username}\nPassword: ${credentials.password}`;
    navigator.clipboard.writeText(textToCopy);
    toast.success('تم نسخ البيانات بنجاح!');
    handleClose();
  };

  return (
    <Modal show={show} backdrop="static" keyboard={false} centered>
      <Modal.Header>
        <Modal.Title>تنبيه مهم: بيانات دخول رئيس الفرع</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Alert variant="warning">
          <Alert.Heading>الرجاء حفظ هذه المعلومات في مكان آمن.</Alert.Heading>
          <p>
            هذه كلمة مرور مؤقتة خُصّصت لرئيس الفرع، وستُستخدم لتسجيل الدخول لأول مرة.
            <br />
            <strong>
              ننصحك بتغيير كلمة المرور مباشرة بعد تسجيل الدخول حفاظًا على أمان الحساب.
            </strong>
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
        <Button variant="primary" onClick={handleCopyAndClose}>
          <i className="fas fa-copy me-2"></i>
          نسخ وإغلاق
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

export default InitialCredentialsModal;
