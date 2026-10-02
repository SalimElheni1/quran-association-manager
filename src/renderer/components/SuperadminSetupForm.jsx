import React, { useState } from 'react';
import { Form, Button, Card, Alert } from 'react-bootstrap';
import PasswordInput from '@renderer/components/PasswordInput';
import { checkPasswordRules, PASSWORD_RULES_HINT } from '@renderer/utils/passwordPolicy';
import { checkTransferKey, TRANSFER_KEY_HINT } from '@renderer/utils/transferKeyPolicy';

/**
 * First-run superadmin setup form (SEC-04).
 * Shown only when no Superadmin exists yet; there are no default credentials.
 * The backup protection key (association transfer key) is chosen here too, so no backup is ever
 * encrypted with this machine's own key only.
 *
 * @component
 * @param {Object} props - Component props
 * @param {Function} props.onSuccess - Called with the chosen username after successful setup
 * @returns {JSX.Element} The setup form
 */
function SuperadminSetupForm({ onSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [transferKey, setTransferKey] = useState('');
  const [confirmTransferKey, setConfirmTransferKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username || !password || !confirmPassword || !transferKey || !confirmTransferKey) {
      setError('جميع الحقول مطلوبة.');
      return;
    }
    if (password !== confirmPassword) {
      setError('كلمتا المرور غير متطابقتين.');
      return;
    }
    const passwordError = checkPasswordRules(password, { username });
    if (passwordError) {
      setError(passwordError);
      return;
    }
    const transferKeyError = checkTransferKey(transferKey, {
      confirmKey: confirmTransferKey,
      password,
    });
    if (transferKeyError) {
      setError(transferKeyError);
      return;
    }
    setError('');
    setLoading(true);
    try {
      const response = await window.electronAPI.setupSuperadmin({
        username,
        password,
        confirm_password: confirmPassword,
        transfer_key: transferKey,
        confirm_transfer_key: confirmTransferKey,
      });
      if (response.success) {
        onSuccess(response.username || username);
      } else {
        setError(response.message || 'فشل إنشاء مدير النظام.');
      }
    } catch (err) {
      setError('تعذر إنشاء مدير النظام. تحقق من البيانات وحاول مرة أخرى.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="signin-card">
      <Card.Body>
        <div className="signin-header">
          <h1>إنشاء مدير النظام</h1>
        </div>
        <Alert variant="info">
          هذا أول استخدام للتطبيق. أنشئ حساب مدير النظام الذي سيدير الفرع.
        </Alert>
        {error && <Alert variant="danger">{error}</Alert>}
        <Form onSubmit={handleSubmit}>
          <Form.Group className="mb-3">
            <Form.Label htmlFor="setup-username">اسم المستخدم</Form.Label>
            <Form.Control
              id="setup-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
            <Form.Text className="text-muted">(يجب أن يكون بالإنجليزية: حروف وأرقام فقط)</Form.Text>
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label htmlFor="setup-password">كلمة المرور</Form.Label>
            <PasswordInput
              name="setup-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="6 أحرف على الأقل"
              label={null}
              helpText={PASSWORD_RULES_HINT}
              required
            />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label htmlFor="setup-confirm-password">تأكيد كلمة المرور</Form.Label>
            <PasswordInput
              name="setup-confirm-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="أعد إدخال كلمة المرور"
              label={null}
              required
            />
          </Form.Group>
          <hr />
          <p className="small text-muted mb-2">
            <strong>رمز حماية النسخ الاحتياطية:</strong> رمز سرّي تُشفَّر به النسخ الاحتياطية، فيمكن
            استرجاعها على أي جهاز من أجهزة الجمعية. إذا كانت جمعيتك تستعمل رمزاً على جهاز آخر، أدخل
            نفس الرمز.
          </p>
          <Form.Group className="mb-3">
            <Form.Label htmlFor="setup-transfer-key">رمز حماية النسخ الاحتياطية</Form.Label>
            <PasswordInput
              name="setup-transfer-key"
              value={transferKey}
              onChange={(e) => setTransferKey(e.target.value)}
              placeholder="8 أحرف على الأقل"
              label={null}
              helpText={TRANSFER_KEY_HINT}
              autoComplete="off"
              required
            />
          </Form.Group>
          <Form.Group className="mb-3">
            <Form.Label htmlFor="setup-confirm-transfer-key">تأكيد رمز الحماية</Form.Label>
            <PasswordInput
              name="setup-confirm-transfer-key"
              value={confirmTransferKey}
              onChange={(e) => setConfirmTransferKey(e.target.value)}
              placeholder="أعد إدخال الرمز"
              label={null}
              autoComplete="off"
              required
            />
          </Form.Group>
          <Button variant="primary" type="submit" className="w-100" disabled={loading}>
            {loading ? 'جاري الإنشاء...' : 'إنشاء مدير النظام'}
          </Button>
        </Form>
      </Card.Body>
    </Card>
  );
}

export default SuperadminSetupForm;
