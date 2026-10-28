// The platform console (/platform): platform administrators create and manage branches and
// invite each branch's first Superadmin. They never see a branch's own data.

import React, { useCallback, useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Alert, Button, Form, Spinner } from 'react-bootstrap';
import { ToastContainer } from 'react-toastify';
import { apiJson } from '@web/http';
import { AuthCard } from '@web/common/MessagePage';
import PasswordInput from '@renderer/components/PasswordInput';
import BranchesView from './BranchesView';
import BranchDetail from './BranchDetail';
import AdminsView from './AdminsView';
import AuditView from './AuditView';
import AccountView from './AccountView';

const API = '/api/platform';

function useHashRoute() {
  const read = () => window.location.hash.replace(/^#\/?/, '') || 'branches';
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onChange = () => setRoute(read());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

function LoginView({ onLoggedIn }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { admin } = await apiJson(`${API}/auth/login`, {
        method: 'POST',
        body: { email, password },
      });
      onLoggedIn(admin);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthCard title="إدارة المنصة" subtitle="إنشاء الفروع وإدارتها">
      <Form onSubmit={submit}>
        <Form.Group className="mb-3">
          <Form.Label htmlFor="platform-email">البريد الإلكتروني</Form.Label>
          <Form.Control
            id="platform-email"
            type="email"
            dir="ltr"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Form.Group>
        <PasswordInput
          name="platform-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
        {error && <Alert variant="danger">{error}</Alert>}
        <Button type="submit" className="w-100 mt-2" disabled={loading}>
          {loading ? <Spinner size="sm" /> : 'تسجيل الدخول'}
        </Button>
      </Form>
    </AuthCard>
  );
}

function PlatformApp() {
  const [state, setState] = useState({ loading: true, admin: null, mailConfigured: false });
  const route = useHashRoute();

  const refreshMe = useCallback(async () => {
    try {
      const me = await apiJson(`${API}/auth/me`);
      setState({ loading: false, admin: me.admin, mailConfigured: me.mailConfigured });
    } catch {
      setState({ loading: false, admin: null, mailConfigured: false });
    }
  }, []);

  useEffect(() => {
    refreshMe();
  }, [refreshMe]);

  // Any 401 from the API: back to the login form.
  const onUnauthorized = useCallback(() => setState((s) => ({ ...s, admin: null })), []);

  const logout = async () => {
    await apiJson(`${API}/auth/logout`, { method: 'POST' }).catch(() => {});
    setState((s) => ({ ...s, admin: null }));
  };

  if (state.loading) {
    return (
      <div className="web-auth-page">
        <Spinner variant="light" />
      </div>
    );
  }
  if (!state.admin) return <LoginView onLoggedIn={() => refreshMe()} />;

  const [section, id] = route.split('/');
  const nav = [
    ['branches', 'الفروع'],
    ['admins', 'مدراء المنصة'],
    ['audit', 'سجل النشاط'],
    ['account', 'حسابي'],
  ];
  const common = {
    api: API,
    onUnauthorized,
    mailConfigured: state.mailConfigured,
    admin: state.admin,
  };

  return (
    <div className="platform-shell">
      <header className="platform-topbar">
        <div className="brand">
          <img src="/g247.png" alt="" aria-hidden="true" />
          <span>إدارة منصة الجمعيات القرآنية</span>
        </div>
        <nav className="d-flex flex-wrap gap-1">
          {nav.map(([key, label]) => (
            <a
              key={key}
              href={`#/${key}`}
              className={`nav-link${section === key ? ' active' : ''}`}
            >
              {label}
            </a>
          ))}
        </nav>
        <div className="d-flex align-items-center gap-2 small">
          <span>{state.admin.name}</span>
          <Button size="sm" variant="outline-light" onClick={logout}>
            خروج
          </Button>
        </div>
      </header>
      <main className="platform-main">
        {section === 'branches' && !id && <BranchesView {...common} />}
        {section === 'branches' && id && (
          <BranchDetail {...common} branchId={parseInt(id, 10)} isNew={id.includes('new=1')} />
        )}
        {section === 'admins' && <AdminsView {...common} />}
        {section === 'audit' && <AuditView {...common} />}
        {section === 'account' && <AccountView {...common} />}
      </main>
    </div>
  );
}

export function start() {
  document.title = 'إدارة المنصة — الجمعيات القرآنية';
  ReactDOM.createRoot(document.getElementById('root')).render(
    <>
      <PlatformApp />
      <ToastContainer position="top-right" autoClose={6000} newestOnTop rtl theme="colored" />
    </>,
  );
}
