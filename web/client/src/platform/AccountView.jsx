import React, { useState } from 'react';
import { Alert, Button, Card, Form, Spinner } from 'react-bootstrap';
import { toast } from 'react-toastify';
import { apiJson } from '@web/http';
import PasswordInput from '@renderer/components/PasswordInput';

function AccountView({ api, admin }) {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (form.newPassword !== form.confirm) {
      setError('كلمتا المرور غير متطابقتين.');
      return;
    }
    setSaving(true);
    try {
      await apiJson(`${api}/auth/password`, {
        method: 'POST',
        body: { currentPassword: form.currentPassword, newPassword: form.newPassword },
      });
      toast.success('تم تغيير كلمة المرور. أُغلقت جلساتك الأخرى.');
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <h1 className="h3 mb-3">حسابي</h1>
      <Card className="shadow-sm" style={{ maxWidth: 520 }}>
        <Card.Body>
          <p>
            {admin.name} — <span dir="ltr">{admin.email}</span>
          </p>
          <Form onSubmit={submit}>
            <PasswordInput
              name="current-password"
              label="كلمة المرور الحالية"
              value={form.currentPassword}
              onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
              autoComplete="current-password"
              required
            />
            <PasswordInput
              name="new-password"
              label="كلمة المرور الجديدة"
              value={form.newPassword}
              onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
              helpText="10 أحرف على الأقل."
              autoComplete="new-password"
              required
            />
            <PasswordInput
              name="confirm-password"
              label="تأكيد كلمة المرور الجديدة"
              value={form.confirm}
              onChange={(e) => setForm({ ...form, confirm: e.target.value })}
              autoComplete="new-password"
              required
            />
            {error && <Alert variant="danger">{error}</Alert>}
            <Button type="submit" disabled={saving}>
              {saving ? <Spinner size="sm" /> : 'تغيير كلمة المرور'}
            </Button>
          </Form>
        </Card.Body>
      </Card>
    </>
  );
}

export default AccountView;
