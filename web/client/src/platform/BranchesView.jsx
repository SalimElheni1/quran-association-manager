import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, Col, Form, Modal, Row, Spinner, Table } from 'react-bootstrap';
import { apiJson } from '@web/http';

const when = (value) => (value ? new Date(value).toLocaleString('ar-TN') : '—');

export const EMPTY_BRANCH = {
  name: '',
  slug: '',
  region: '',
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  notes: '',
};

/** The branch fields (create and edit). */
export function BranchFields({ value, onChange, withSlug }) {
  const set = (key) => (e) => onChange({ ...value, [key]: e.target.value });
  return (
    <Row>
      <Col md={withSlug ? 7 : 12}>
        <Form.Group className="mb-3">
          <Form.Label htmlFor="branch-name">اسم الفرع</Form.Label>
          <Form.Control
            id="branch-name"
            value={value.name}
            onChange={set('name')}
            required
            maxLength={150}
            placeholder="فرع سوسة"
          />
        </Form.Group>
      </Col>
      {withSlug && (
        <Col md={5}>
          <Form.Group className="mb-3">
            <Form.Label htmlFor="branch-slug">رمز الفرع (في الرابط)</Form.Label>
            <Form.Control
              id="branch-slug"
              dir="ltr"
              value={value.slug}
              onChange={(e) =>
                onChange({
                  ...value,
                  slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''),
                })
              }
              required
              maxLength={40}
              placeholder="sousse"
            />
            <Form.Text className="text-muted">
              الرابط: <span className="branch-link">/b/{value.slug || 'رمز'}/</span> — لا يتغير بعد
              الإنشاء.
            </Form.Text>
          </Form.Group>
        </Col>
      )}
      <Col md={12}>
        <Form.Group className="mb-3">
          <Form.Label htmlFor="branch-region">الرابطة الجهوية (اختياري)</Form.Label>
          <Form.Control
            id="branch-region"
            value={value.region || ''}
            onChange={set('region')}
            maxLength={150}
          />
        </Form.Group>
      </Col>
      <Col md={4}>
        <Form.Group className="mb-3">
          <Form.Label htmlFor="branch-contact-name">المسؤول</Form.Label>
          <Form.Control
            id="branch-contact-name"
            value={value.contactName || ''}
            onChange={set('contactName')}
            maxLength={150}
          />
        </Form.Group>
      </Col>
      <Col md={4}>
        <Form.Group className="mb-3">
          <Form.Label htmlFor="branch-contact-phone">الهاتف</Form.Label>
          <Form.Control
            id="branch-contact-phone"
            dir="ltr"
            value={value.contactPhone || ''}
            onChange={set('contactPhone')}
            maxLength={40}
          />
        </Form.Group>
      </Col>
      <Col md={4}>
        <Form.Group className="mb-3">
          <Form.Label htmlFor="branch-contact-email">البريد الإلكتروني</Form.Label>
          <Form.Control
            id="branch-contact-email"
            type="email"
            dir="ltr"
            value={value.contactEmail || ''}
            onChange={set('contactEmail')}
            maxLength={200}
          />
        </Form.Group>
      </Col>
      <Col md={12}>
        <Form.Group className="mb-3">
          <Form.Label htmlFor="branch-notes">ملاحظات</Form.Label>
          <Form.Control
            id="branch-notes"
            as="textarea"
            rows={2}
            value={value.notes || ''}
            onChange={set('notes')}
            maxLength={2000}
          />
        </Form.Group>
      </Col>
    </Row>
  );
}

function CreateBranchModal({ show, onHide, api }) {
  const [form, setForm] = useState(EMPTY_BRANCH);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (show) {
      setForm(EMPTY_BRANCH);
      setError('');
    }
  }, [show]);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const { branch } = await apiJson(`${api}/branches`, { method: 'POST', body: form });
      window.location.hash = `#/branches/${branch.id}?new=1`;
      onHide();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal show={show} onHide={onHide} size="lg" centered>
      <Modal.Header closeButton>
        <Modal.Title>فرع جديد</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Form id="create-branch-form" onSubmit={submit}>
          <BranchFields value={form} onChange={setForm} withSlug />
        </Form>
        <p className="small text-muted mb-0">
          يُنشأ للفرع مخزن بيانات مستقل بالإعدادات الافتراضية (الفئات العمرية، فئات المداخيل
          والمصاريف، السور والأحزاب). بعد الإنشاء أرسل دعوة لمدير النظام في الفرع.
        </p>
        {error && (
          <Alert variant="danger" className="mt-3 mb-0">
            {error}
          </Alert>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          إلغاء
        </Button>
        <Button type="submit" form="create-branch-form" disabled={saving}>
          {saving ? <Spinner size="sm" /> : 'إنشاء الفرع'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

function BranchesView({ api, onUnauthorized }) {
  const [branches, setBranches] = useState(null);
  const [error, setError] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [filter, setFilter] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await apiJson(`${api}/branches`);
      setBranches(data.branches);
    } catch (err) {
      if (err.status === 401) onUnauthorized();
      else setError(err.message);
    }
  }, [api, onUnauthorized]);

  useEffect(() => {
    load();
  }, [load]);

  const shown = (branches || []).filter((b) => {
    const q = filter.trim().toLowerCase();
    return (
      !q ||
      b.name.toLowerCase().includes(q) ||
      b.slug.includes(q) ||
      (b.region || '').toLowerCase().includes(q)
    );
  });
  const totals = (branches || []).reduce(
    (t, b) => ({
      students: t.students + (b.students || 0),
      teachers: t.teachers + (b.teachers || 0),
      users: t.users + (b.users || 0),
      active: t.active + (b.status === 'active' ? 1 : 0),
    }),
    { students: 0, teachers: 0, users: 0, active: 0 },
  );

  return (
    <>
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
        <h1 className="h3 mb-0">الفروع</h1>
        <Button onClick={() => setShowCreate(true)}>+ فرع جديد</Button>
      </div>
      {error && <Alert variant="danger">{error}</Alert>}
      {branches && (
        <Row className="g-3 mb-3">
          {[
            ['الفروع النشطة', `${totals.active} / ${branches.length}`],
            ['الطلاب', totals.students],
            ['المعلمون', totals.teachers],
            ['المستخدمون', totals.users],
          ].map(([label, value]) => (
            <Col key={label} xs={6} md={3}>
              <Card className="text-center shadow-sm">
                <Card.Body className="py-3">
                  <div className="h4 mb-0">{value}</div>
                  <div className="small text-muted">{label}</div>
                </Card.Body>
              </Card>
            </Col>
          ))}
        </Row>
      )}
      <Card className="shadow-sm">
        <Card.Body>
          <Form.Control
            className="mb-3"
            placeholder="بحث بالاسم أو الرمز أو الجهة..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          {!branches ? (
            <Spinner />
          ) : shown.length === 0 ? (
            <p className="text-muted mb-0">
              {branches.length ? 'لا نتائج.' : 'لا توجد فروع بعد. أنشئ أول فرع.'}
            </p>
          ) : (
            <Table responsive hover className="align-middle mb-0">
              <thead>
                <tr>
                  <th>الفرع</th>
                  <th>الحالة</th>
                  <th>الطلاب</th>
                  <th>المعلمون</th>
                  <th>المستخدمون</th>
                  <th>آخر نشاط</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map((b) => (
                  <tr key={b.id}>
                    <td>
                      <a href={`#/branches/${b.id}`} className="fw-bold">
                        {b.name}
                      </a>
                      <div className="small text-muted">
                        <span className="branch-link">/b/{b.slug}/</span>
                        {b.region ? ` — ${b.region}` : ''}
                      </div>
                    </td>
                    <td>
                      {b.status === 'active' ? (
                        <Badge bg="success">نشط</Badge>
                      ) : (
                        <Badge bg="danger">موقوف</Badge>
                      )}
                      {b.superadmins === 0 && (
                        <Badge bg="warning" text="dark" className="ms-1">
                          {b.pendingInvitations ? 'دعوة المدير معلّقة' : 'بلا مدير نظام'}
                        </Badge>
                      )}
                    </td>
                    <td>
                      <span className="stat-pill">{b.students ?? '—'}</span>
                    </td>
                    <td>
                      <span className="stat-pill">{b.teachers ?? '—'}</span>
                    </td>
                    <td>
                      <span className="stat-pill">{b.users ?? '—'}</span>
                    </td>
                    <td className="small">{when(b.lastActivityAt)}</td>
                    <td>
                      <Button size="sm" variant="outline-primary" href={`#/branches/${b.id}`}>
                        إدارة
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card.Body>
      </Card>
      <CreateBranchModal show={showCreate} onHide={() => setShowCreate(false)} api={api} />
    </>
  );
}

export default BranchesView;
