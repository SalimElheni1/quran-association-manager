// /invite/<token>: the invitee sees which branch and role they are invited to, chooses their
// username and password, and is signed in to the branch.

import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { Alert, Button, Col, Form, Row, Spinner } from 'react-bootstrap';
import PasswordInput from '@renderer/components/PasswordInput';
import { checkPasswordRules, PASSWORD_RULES_HINT } from '@renderer/utils/passwordPolicy';
import { apiJson } from '@web/http';
import { AuthCard } from '@web/common/MessagePage';

const STATUS_TEXT = {
  accepted: 'استُعملت هذه الدعوة من قبل. إن كان لك حساب فسجّل الدخول إلى فرعك.',
  expired: 'انتهت صلاحية هذه الدعوة. اطلب دعوة جديدة من الشخص الذي دعاك.',
  revoked: 'أُلغيت هذه الدعوة. اطلب دعوة جديدة من الشخص الذي دعاك.',
  suspended: 'هذا الفرع موقوف حالياً.',
};

function InvitePage({ token }) {
  const [invitation, setInvitation] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    username: '',
    national_id: '',
    phone_number: '',
    email: '',
    password: '',
    confirm_password: '',
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiJson(`/api/invitations/${encodeURIComponent(token)}`)
      .then(({ invitation: inv }) => {
        setInvitation(inv);
        const [first, ...rest] = (inv.name || '').trim().split(/\s+/);
        setForm((f) => ({
          ...f,
          email: inv.email || '',
          first_name: first || '',
          last_name: rest.join(' '),
        }));
      })
      .catch((err) => setLoadError(err.message));
  }, [token]);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!/^[A-Za-z0-9]{3,30}$/.test(form.username)) {
      setError('اسم المستخدم: من 3 إلى 30 حرفاً، حروف إنجليزية وأرقام فقط.');
      return;
    }
    if (!/^\d{8}$/.test(form.national_id)) {
      setError('رقم بطاقة التعريف يجب أن يتكون من 8 أرقام.');
      return;
    }
    if (!/^\d{8}$/.test(form.phone_number)) {
      setError('رقم الهاتف يجب أن يتكون من 8 أرقام.');
      return;
    }
    const passwordError = checkPasswordRules(form.password, { username: form.username });
    if (passwordError) {
      setError(passwordError);
      return;
    }
    if (form.password !== form.confirm_password) {
      setError('كلمتا المرور غير متطابقتين.');
      return;
    }
    setSaving(true);
    try {
      const result = await apiJson(`/api/invitations/${encodeURIComponent(token)}/accept`, {
        method: 'POST',
        body: form,
      });
      window.location.assign(`/b/${result.branchSlug}/#/`);
    } catch (err) {
      setError(err.message);
      setSaving(false);
    }
  };

  if (loadError) {
    return (
      <AuthCard title="دعوة غير صالحة">
        <Alert variant="danger" className="text-center mb-0">
          {loadError}
        </Alert>
      </AuthCard>
    );
  }
  if (!invitation) {
    return (
      <AuthCard title="جاري التحميل...">
        <div className="text-center">
          <Spinner />
        </div>
      </AuthCard>
    );
  }
  if (invitation.status !== 'pending') {
    return (
      <AuthCard title={invitation.branchName}>
        <Alert variant="warning" className="text-center">
          {STATUS_TEXT[invitation.status] || 'هذه الدعوة غير صالحة.'}
        </Alert>
        {invitation.status === 'accepted' && (
          <div className="text-center">
            <Button href={`/b/${invitation.branchSlug}/`}>تسجيل الدخول</Button>
          </div>
        )}
      </AuthCard>
    );
  }

  return (
    <AuthCard
      wide
      title={`دعوة للانضمام إلى ${invitation.branchName}`}
      subtitle={`بصفة: ${invitation.roleLabel}${invitation.invitedBy ? ` — من: ${invitation.invitedBy}` : ''}`}
    >
      <p className="small text-muted text-center">
        أنشئ حسابك. ستستعمل اسم المستخدم وكلمة المرور للدخول إلى الفرع على الرابط{' '}
        <span className="branch-link">/b/{invitation.branchSlug}/</span>
      </p>
      <Form onSubmit={submit} noValidate>
        <Row>
          <Col md={6}>
            <Form.Group className="mb-3">
              <Form.Label htmlFor="first_name">الاسم الأول</Form.Label>
              <Form.Control
                id="first_name"
                value={form.first_name}
                onChange={set('first_name')}
                required
                minLength={2}
                maxLength={50}
              />
            </Form.Group>
          </Col>
          <Col md={6}>
            <Form.Group className="mb-3">
              <Form.Label htmlFor="last_name">اللقب</Form.Label>
              <Form.Control
                id="last_name"
                value={form.last_name}
                onChange={set('last_name')}
                required
                minLength={2}
                maxLength={50}
              />
            </Form.Group>
          </Col>
          <Col md={6}>
            <Form.Group className="mb-3">
              <Form.Label htmlFor="national_id">رقم بطاقة التعريف</Form.Label>
              <Form.Control
                id="national_id"
                dir="ltr"
                inputMode="numeric"
                value={form.national_id}
                onChange={set('national_id')}
                maxLength={8}
                required
              />
            </Form.Group>
          </Col>
          <Col md={6}>
            <Form.Group className="mb-3">
              <Form.Label htmlFor="phone_number">رقم الهاتف</Form.Label>
              <Form.Control
                id="phone_number"
                dir="ltr"
                inputMode="tel"
                value={form.phone_number}
                onChange={set('phone_number')}
                maxLength={8}
                required
              />
            </Form.Group>
          </Col>
          <Col md={12}>
            <Form.Group className="mb-3">
              <Form.Label htmlFor="email">البريد الإلكتروني (اختياري)</Form.Label>
              <Form.Control
                id="email"
                type="email"
                dir="ltr"
                value={form.email}
                onChange={set('email')}
                maxLength={200}
              />
            </Form.Group>
          </Col>
          <Col md={12}>
            <Form.Group className="mb-3">
              <Form.Label htmlFor="username">اسم المستخدم</Form.Label>
              <Form.Control
                id="username"
                dir="ltr"
                autoCapitalize="none"
                autoComplete="username"
                value={form.username}
                onChange={set('username')}
                maxLength={30}
                required
              />
              <Form.Text className="text-muted">بالإنجليزية: حروف وأرقام فقط.</Form.Text>
            </Form.Group>
          </Col>
          <Col md={6}>
            <PasswordInput
              name="password"
              label="كلمة المرور"
              value={form.password}
              onChange={set('password')}
              helpText={PASSWORD_RULES_HINT}
              autoComplete="new-password"
              required
            />
          </Col>
          <Col md={6}>
            <PasswordInput
              name="confirm_password"
              label="تأكيد كلمة المرور"
              value={form.confirm_password}
              onChange={set('confirm_password')}
              autoComplete="new-password"
              required
            />
          </Col>
        </Row>
        {error && <Alert variant="danger">{error}</Alert>}
        <Button type="submit" className="w-100" disabled={saving}>
          {saving ? <Spinner size="sm" /> : 'إنشاء الحساب والدخول'}
        </Button>
      </Form>
    </AuthCard>
  );
}

export function start(token) {
  document.title = 'دعوة — منصة الجمعيات القرآنية';
  ReactDOM.createRoot(document.getElementById('root')).render(<InvitePage token={token} />);
}
