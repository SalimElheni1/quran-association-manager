import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { Form, Button, Container, Card, Alert } from 'react-bootstrap';
import PasswordInput from '../components/PasswordInput';
import '../styles/LoginPage.css';
import defaultLogo from '../assets/logos/g247.png';

function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const { settings, logo } = useSettings();

  console.log('LoginPage settings:', settings);
  console.log('LoginPage logo:', logo);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
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
      <Card className="signin-card">
        <Card.Body>
          <div className="signin-header">
            <img
              src={logo && logo.startsWith('safe-image://') ? logo : defaultLogo}
              alt="Logo"
              className="signin-logo"
            />
            <div className="association-names-login">
              <h1>{settings.national_association_name || 'Quran Branch Manager'}</h1>
              {settings.regional_association_name && <h2>{settings.regional_association_name}</h2>}
              {settings.local_branch_name && <h3>{settings.local_branch_name}</h3>}
            </div>
          </div>
          {error && <Alert variant="danger">{error}</Alert>}
          <Form onSubmit={handleSubmit}>
            <Form.Group className="mb-3" controlId="username">
              <Form.Label>اسم المستخدم</Form.Label>
              <Form.Control
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
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
