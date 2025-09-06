import React from 'react';
import { Alert, Button } from 'react-bootstrap';
import { toast } from 'react-toastify';

function InitialCredentialsBanner({ credentials, onClose }) {
  if (!credentials) {
    return null;
  }

  const handleCopyAndClose = () => {
    const textToCopy = `Username: ${credentials.username}\nPassword: ${credentials.password}`;
    navigator.clipboard.writeText(textToCopy);
    toast.success('تم نسخ البيانات بنجاح!');
    onClose();
  };

  return (
    <Alert variant="warning" onClose={onClose} dismissible className="initial-credentials-banner">
      <Alert.Heading>تنبيه مهم: بيانات دخول رئيس الفرع</Alert.Heading>
      <p>
        هذه كلمة مرور مؤقتة خُصّصت لرئيس الفرع، وستُستخدم لتسجيل الدخول لأول مرة.
        <br />
        <strong>
          ننصحك بتغيير كلمة المرور مباشرة بعد تسجيل الدخول حفاظًا على أمان الحساب.
        </strong>
      </p>
      <div className="p-3 bg-light rounded mb-3">
        <p className="mb-1">
          <strong>اسم المستخدم:</strong> {credentials.username}
        </p>
        <p className="mb-0">
          <strong>كلمة المرور:</strong> {credentials.password}
        </p>
      </div>
      <Button variant="primary" onClick={handleCopyAndClose}>
        <i className="fas fa-copy me-2"></i>
        نسخ وإغلاق
      </Button>
    </Alert>
  );
}

export default InitialCredentialsBanner;
