import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@renderer/contexts/AuthContext';
import { error as logError } from '@renderer/utils/logger';
import { Form, Button, Card, Alert } from 'react-bootstrap';
import PasswordInput from '@renderer/components/PasswordInput';
import InitialCredentialsBanner from '@renderer/components/InitialCredentialsBanner';
import '@renderer/styles/LoginPage.css';

// The default logo is served from the public folder.
// Vite handles this automatically.
const defaultLogo = 'assets/logos/icon.png';

function LoginPage({ initialCredentials, onCloseBanner }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [displayLogo, setDisplayLogo] = useState(defaultLogo);
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
      navigate('/');
    } else {
      setError(response.message || 'فشل تسجيل الدخول');
    }
    setLoading(false);
  };

  return (
    <div className="signin-container">
      <InitialCredentialsBanner credentials={initialCredentials} onClose={onCloseBanner} />
      <Card className="signin-card">
              <Card.Body>
                <div className="signin-header">
                  <img src={displayLogo} alt="Logo" className="signin-logo" />
                  <h1>تسجيل الدخول</h1>
                </div>
                {error && <Alert variant="danger">{error}</Alert>}
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
              </Card.Body>
      </Card>
    </div>
  );
}

export default LoginPage;
