import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@renderer/contexts/AuthContext';
import { error as logError } from '@renderer/utils/logger';
import { Form, Button, Card, Alert } from 'react-bootstrap';
import PasswordInput from '@renderer/components/PasswordInput';
import SuperadminSetupForm from '@renderer/components/SuperadminSetupForm';
import '@renderer/styles/LoginPage.css';

// The default logo is served from the public folder.
// Vite handles this automatically.
const defaultLogo = 'assets/logos/icon.png';

/**
 * Login page. Shows the first-run superadmin setup form when no Superadmin
 * exists yet (SEC-04), otherwise the login form. Existing installs that still
 * use the legacy default password are forced to change it before entering.
 *
 * @component
 * @param {Object} props - Component props
 * @param {boolean} props.needsSetup - True when the first superadmin must be created
 * @param {Function} props.onSetupComplete - Called after a successful setup
 * @returns {JSX.Element} The login page
 */
function LoginPage({ needsSetup }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [displayLogo, setDisplayLogo] = useState(defaultLogo);
  const [showSetup, setShowSetup] = useState(!!needsSetup);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [changePasswordData, setChangePasswordData] = useState({
    current: '',
    next: '',
    confirm: '',
  });
  const [changeLoading, setChangeLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchLogo = async () => {
      try {
        const response = await window.electronAPI.getLogo();
        if (response.success && response.path) {
          setDisplayLogo(response.path);
        }
      } catch (err) {
        logError('Failed to fetch logo:', err);
      }
    };
    fetchLogo();
  }, []);

  useEffect(() => {
    setShowSetup(!!needsSetup);
  }, [needsSetup]);

  const handleSetupComplete = (createdUsername) => {
    setShowSetup(false);
    setUsername(createdUsername);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username || !password) {
      setError('اسم المستخدم وكلمة المرور مطلوبان.');
      return;
    }
    setError('');
    setLoading(true);
    const response = await login(username, password);
    if (response.success) {
      if (response.mustChangePassword) {
        setMustChangePassword(true);
        setChangePasswordData((prev) => ({ ...prev, current: password }));
      } else {
        navigate('/');
      }
    } else {
      setError(response.message || 'فشل تسجيل الدخول');
    }
    setLoading(false);
  };

  const handleChangePasswordSubmit = async (e) => {
    e.preventDefault();
    if (!changePasswordData.next || !changePasswordData.confirm) {
      setError('جميع الحقول مطلوبة.');
      return;
    }
    if (changePasswordData.next !== changePasswordData.confirm) {
      setError('كلمتا المرور غير متطابقتين.');
      return;
    }
    if (changePasswordData.next.length < 6) {
      setError('كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل.');
      return;
    }
    setError('');
    setChangeLoading(true);
    try {
      const response = await window.electronAPI.updatePassword({
        passwordData: {
          current_password: changePasswordData.current,
          new_password: changePasswordData.next,
          confirm_new_password: changePasswordData.confirm,
        },
      });
      if (response.success) {
        navigate('/');
      } else {
        setError(response.message || 'فشل تغيير كلمة المرور.');
      }
    } catch (err) {
      setError('فشل الاتصال بالخادم. حاول مرة أخرى.');
    } finally {
      setChangeLoading(false);
    }
  };

  return (
    <div className="signin-container">
      {showSetup ? (
        <SuperadminSetupForm onSuccess={handleSetupComplete} />
      ) : (
        <Card className="signin-card">
          <Card.Body>
            <div className="signin-header">
              <img src={displayLogo} alt="Logo" className="signin-logo" />
              <h1>{mustChangePassword ? 'تغيير كلمة المرور' : 'تسجيل الدخول'}</h1>
              {!mustChangePassword && (
                <p className="signin-subtitle">الرابطة الوطنية للقرآن الكريم</p>
              )}
              <div className="weave-band" aria-hidden="true" />
            </div>
            {mustChangePassword && (
              <Alert variant="warning">
                كلمة المرور الحالية هي كلمة المرور الافتراضية. يجب تغييرها قبل متابعة استخدام
                التطبيق.
              </Alert>
            )}
            {error && <Alert variant="danger">{error}</Alert>}
            {mustChangePassword ? (
              <Form onSubmit={handleChangePasswordSubmit}>
                <Form.Group className="mb-3">
                  <Form.Label htmlFor="change-current-password">كلمة المرور الحالية</Form.Label>
                  <PasswordInput
                    name="change-current-password"
                    value={changePasswordData.current}
                    onChange={(e) =>
                      setChangePasswordData((prev) => ({ ...prev, current: e.target.value }))
                    }
                    placeholder="أدخل كلمة المرور الحالية"
                    required
                  />
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label htmlFor="change-new-password">كلمة المرور الجديدة</Form.Label>
                  <PasswordInput
                    name="change-new-password"
                    value={changePasswordData.next}
                    onChange={(e) =>
                      setChangePasswordData((prev) => ({ ...prev, next: e.target.value }))
                    }
                    placeholder="6 أحرف على الأقل"
                    required
                  />
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label htmlFor="change-confirm-password">
                    تأكيد كلمة المرور الجديدة
                  </Form.Label>
                  <PasswordInput
                    name="change-confirm-password"
                    value={changePasswordData.confirm}
                    onChange={(e) =>
                      setChangePasswordData((prev) => ({ ...prev, confirm: e.target.value }))
                    }
                    placeholder="أعد إدخال كلمة المرور الجديدة"
                    required
                  />
                </Form.Group>
                <Button variant="primary" type="submit" className="w-100" disabled={changeLoading}>
                  {changeLoading ? 'جاري الحفظ...' : 'حفظ كلمة المرور'}
                </Button>
              </Form>
            ) : (
              <Form onSubmit={handleSubmit}>
                <Form.Group className="mb-3">
                  <Form.Label htmlFor="username">اسم المستخدم</Form.Label>
                  <Form.Control
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                  />
                  <Form.Text className="text-muted">
                    (يجب أن يكون بالإنجليزية: حروف وأرقام فقط)
                  </Form.Text>
                </Form.Group>
                <PasswordInput
                  name="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="أدخل كلمة المرور"
                  required
                />
                <Button variant="primary" type="submit" className="w-100" disabled={loading}>
                  {loading ? 'جاري الدخول...' : 'تسجيل الدخول'}
                </Button>
              </Form>
            )}
          </Card.Body>
        </Card>
      )}
    </div>
  );
}

export default LoginPage;
