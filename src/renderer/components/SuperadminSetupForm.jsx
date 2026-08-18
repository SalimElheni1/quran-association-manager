import React, { useState } from 'react';
import { Form, Button, Card, Alert } from 'react-bootstrap';
import PasswordInput from '@renderer/components/PasswordInput';

/**
 * First-run superadmin setup form (SEC-04).
 * Shown only when no Superadmin exists yet; there are no default credentials.
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
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username || !password || !confirmPassword) {
      setError('جميع الحقول مطلوبة.');
      return;
    }
    if (password !== confirmPassword) {
      setError('كلمتا المرور غير متطابقتين.');
      return;
    }
    if (password.length < 6) {
      setError('كلمة المرور يجب أن تكون 6 أحرف على الأقل.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const response = await window.electronAPI.setupSuperadmin({
        username,
        password,
        confirm_password: confirmPassword,
      });
      if (response.success) {
        onSuccess(response.username || username);
      } else {
        setError(response.message || 'فشل إنشاء مدير النظام.');
      }
    } catch (err) {
      setError('فشل الاتصال بالخادم. حاول مرة أخرى.');
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
