import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, Col, Form, Row, Spinner, Table } from 'react-bootstrap';
import { toast } from 'react-toastify';
import { apiJson } from '@web/http';
import PasswordInput from '@renderer/components/PasswordInput';

const when = (value) => (value ? new Date(value).toLocaleString('ar-TN') : '—');

function AdminsView({ api, admin: me, onUnauthorized }) {
  const [admins, setAdmins] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setAdmins((await apiJson(`${api}/admins`)).admins);
    } catch (err) {
      if (err.status === 401) onUnauthorized();
      else toast.error(err.message);
    }
  }, [api, onUnauthorized]);

  useEffect(() => {
    load();
  }, [load]);

  const create = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiJson(`${api}/admins`, { method: 'POST', body: form });
      toast.success('تمت إضافة مدير المنصة.');
      setForm({ name: '', email: '', password: '' });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (id, status) => {
    try {
      await apiJson(`${api}/admins/${id}/status`, { method: 'POST', body: { status } });
      load();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <>
      <h1 className="h3 mb-3">مدراء المنصة</h1>
      <Row className="g-3">
        <Col lg={7}>
          <Card className="shadow-sm">
            <Card.Body>
              {!admins ? (
                <Spinner />
              ) : (
                <Table responsive className="mb-0 align-middle">
                  <thead>
                    <tr>
                      <th>الاسم</th>
                      <th>البريد</th>
                      <th>آخر دخول</th>
                      <th>الحالة</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {admins.map((a) => (
                      <tr key={a.id}>
                        <td>{a.name}</td>
                        <td dir="ltr" className="small">
                          {a.email}
                        </td>
                        <td className="small">{when(a.last_login_at)}</td>
                        <td>
                          {a.status === 'active' ? (
                            <Badge bg="success">نشط</Badge>
                          ) : (
                            <Badge bg="secondary">معطل</Badge>
                          )}
                        </td>
                        <td>
                          {a.id !== me.id &&
                            (a.status === 'active' ? (
                              <Button
                                size="sm"
                                variant="outline-danger"
                                onClick={() => setStatus(a.id, 'disabled')}
                              >
                                تعطيل
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline-success"
                                onClick={() => setStatus(a.id, 'active')}
                              >
                                تفعيل
                              </Button>
                            ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </Card.Body>
          </Card>
        </Col>
        <Col lg={5}>
          <Card className="shadow-sm">
            <Card.Header className="fw-bold">إضافة مدير منصة</Card.Header>
            <Card.Body>
              <Form onSubmit={create}>
                <Form.Group className="mb-2">
                  <Form.Label htmlFor="admin-name">الاسم</Form.Label>
                  <Form.Control
                    id="admin-name"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                  />
                </Form.Group>
                <Form.Group className="mb-2">
                  <Form.Label htmlFor="admin-email">البريد الإلكتروني</Form.Label>
                  <Form.Control
                    id="admin-email"
                    type="email"
                    dir="ltr"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    required
                  />
                </Form.Group>
                <PasswordInput
                  name="admin-password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  helpText="10 أحرف على الأقل. سلّمها للمدير الجديد بطريقة آمنة."
                  autoComplete="new-password"
                  required
                />
                {error && <Alert variant="danger">{error}</Alert>}
                <Button type="submit" disabled={saving}>
                  {saving ? <Spinner size="sm" /> : 'إضافة'}
                </Button>
              </Form>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </>
  );
}

export default AdminsView;
