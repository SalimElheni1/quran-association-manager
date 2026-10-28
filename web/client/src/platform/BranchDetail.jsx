import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, Col, Form, Modal, Row, Spinner, Table } from 'react-bootstrap';
import { toast } from 'react-toastify';
import { apiJson } from '@web/http';
import InviteLinkBox from '@renderer/web/InviteLinkBox';
import { BranchFields } from './BranchesView';

const when = (value) => (value ? new Date(value).toLocaleString('ar-TN') : '—');
const STATUS = {
  pending: { label: 'بانتظار القبول', bg: 'warning' },
  accepted: { label: 'مقبولة', bg: 'success' },
  expired: { label: 'منتهية الصلاحية', bg: 'secondary' },
  revoked: { label: 'ملغاة', bg: 'dark' },
};

function SuspendModal({ branch, show, onHide, onConfirm }) {
  const [typed, setTyped] = useState('');
  useEffect(() => setTyped(''), [show]);
  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title>إيقاف الفرع</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <Alert variant="danger">
          يُمنع كل مستخدمي «{branch.name}» من الدخول فوراً وتُغلق جلساتهم المفتوحة. تبقى البيانات
          محفوظة كما هي، ويمكن إعادة تفعيل الفرع في أي وقت.
        </Alert>
        <Form.Label htmlFor="confirm-slug">
          للتأكيد اكتب رمز الفرع: <span className="branch-link">{branch.slug}</span>
        </Form.Label>
        <Form.Control
          id="confirm-slug"
          dir="ltr"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
        />
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          إلغاء
        </Button>
        <Button variant="danger" disabled={typed !== branch.slug} onClick={onConfirm}>
          إيقاف الفرع
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

function BranchDetail({ api, branchId, isNew, onUnauthorized, mailConfigured }) {
  const [branch, setBranch] = useState(null);
  const [form, setForm] = useState(null);
  const [invitations, setInvitations] = useState(null);
  const [invite, setInvite] = useState({ name: '', email: '' });
  const [created, setCreated] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showSuspend, setShowSuspend] = useState(false);
  const [error, setError] = useState('');

  const fail = useCallback(
    (err) => {
      if (err.status === 401) onUnauthorized();
      else toast.error(err.message);
    },
    [onUnauthorized],
  );

  const load = useCallback(async () => {
    try {
      const { branches } = await apiJson(`${api}/branches`);
      const found = branches.find((b) => b.id === branchId);
      if (!found) {
        setError('الفرع غير موجود.');
        return;
      }
      setBranch(found);
      setForm({
        name: found.name,
        region: found.region || '',
        contactName: found.contactName || '',
        contactPhone: found.contactPhone || '',
        contactEmail: found.contactEmail || '',
        notes: found.notes || '',
      });
      const inv = await apiJson(`${api}/branches/${branchId}/invitations`);
      setInvitations(inv.invitations);
    } catch (err) {
      fail(err);
    }
  }, [api, branchId, fail]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await apiJson(`${api}/branches/${branchId}`, { method: 'PATCH', body: form });
      toast.success('تم حفظ بيانات الفرع.');
      load();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (status) => {
    try {
      await apiJson(`${api}/branches/${branchId}/status`, { method: 'POST', body: { status } });
      toast.success(status === 'active' ? 'أُعيد تفعيل الفرع.' : 'تم إيقاف الفرع.');
      setShowSuspend(false);
      load();
    } catch (err) {
      fail(err);
    }
  };

  const createInvitation = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await apiJson(`${api}/branches/${branchId}/invitations`, {
        method: 'POST',
        body: invite,
      });
      setCreated(result);
      setInvite({ name: '', email: '' });
      load();
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id) => {
    try {
      const result = await apiJson(`${api}/branches/${branchId}/invitations/${id}/revoke`, {
        method: 'POST',
      });
      if (result.success) toast.success(result.message);
      else toast.error(result.message);
      load();
    } catch (err) {
      fail(err);
    }
  };

  if (error) return <Alert variant="danger">{error}</Alert>;
  if (!branch || !form) return <Spinner />;

  const branchUrl = `${window.location.origin}/b/${branch.slug}/`;

  return (
    <>
      <div className="mb-3">
        <a href="#/branches" className="small">
          → كل الفروع
        </a>
      </div>
      <div className="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
        <div>
          <h1 className="h3 mb-1">
            {branch.name}{' '}
            {branch.status === 'active' ? (
              <Badge bg="success">نشط</Badge>
            ) : (
              <Badge bg="danger">موقوف</Badge>
            )}
          </h1>
          <a
            href={branchUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="branch-link small"
          >
            {branchUrl}
          </a>
        </div>
        {branch.status === 'active' ? (
          <Button variant="outline-danger" onClick={() => setShowSuspend(true)}>
            إيقاف الفرع
          </Button>
        ) : (
          <Button variant="success" onClick={() => setStatus('active')}>
            إعادة تفعيل الفرع
          </Button>
        )}
      </div>

      {isNew && branch.superadmins === 0 && (
        <Alert variant="info">
          تم إنشاء الفرع. الخطوة التالية: أرسل دعوة لمدير النظام في الفرع.
        </Alert>
      )}

      <Row className="g-3">
        <Col lg={7}>
          <Card className="shadow-sm mb-3">
            <Card.Header className="fw-bold">مدير النظام في الفرع</Card.Header>
            <Card.Body>
              <p className="small text-muted">
                يُنشئ المدعو حسابه بنفسه ويصبح «مدير النظام» في الفرع، ثم يضيف هو بقية المستخدمين أو
                يدعوهم. لا يمنحك هذا أي اطلاع على بيانات الفرع.
                {!mailConfigured && ' (البريد الإلكتروني غير مفعّل على الخادم: شارك الرابط بنفسك.)'}
              </p>
              {branch.superadmins > 0 && (
                <Alert variant="success" className="small py-2">
                  للفرع {branch.superadmins} مدير نظام نشط. ادعُ مديراً آخر فقط عند الحاجة (مثلاً إن
                  فقد المدير الوحيد كلمة مروره)؛ تظهر هذه الدعوة لمديري الفرع.
                </Alert>
              )}
              <Form onSubmit={createInvitation}>
                <Row>
                  <Col md={6}>
                    <Form.Group className="mb-2">
                      <Form.Label htmlFor="invite-name">اسم المدير (اختياري)</Form.Label>
                      <Form.Control
                        id="invite-name"
                        value={invite.name}
                        onChange={(e) => setInvite({ ...invite, name: e.target.value })}
                        maxLength={150}
                      />
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group className="mb-2">
                      <Form.Label htmlFor="invite-email">البريد الإلكتروني (اختياري)</Form.Label>
                      <Form.Control
                        id="invite-email"
                        type="email"
                        dir="ltr"
                        value={invite.email}
                        onChange={(e) => setInvite({ ...invite, email: e.target.value })}
                        maxLength={200}
                      />
                    </Form.Group>
                  </Col>
                </Row>
                <Button
                  type="submit"
                  disabled={busy || branch.status !== 'active'}
                  data-testid="invite-superadmin"
                >
                  {busy ? <Spinner size="sm" /> : 'إنشاء دعوة لمدير النظام'}
                </Button>
              </Form>
              {created && (
                <div className="mt-3">
                  <InviteLinkBox
                    link={created.link}
                    emailed={created.emailed}
                    email={created.invitation.email}
                    branchName={branch.name}
                    roleLabel="مدير النظام"
                  />
                </div>
              )}
            </Card.Body>
          </Card>

          <Card className="shadow-sm">
            <Card.Header className="fw-bold">الدعوات</Card.Header>
            <Card.Body>
              {!invitations ? (
                <Spinner size="sm" />
              ) : invitations.length === 0 ? (
                <p className="text-muted small mb-0">لا توجد دعوات.</p>
              ) : (
                <Table size="sm" responsive className="mb-0">
                  <thead>
                    <tr>
                      <th>الدور</th>
                      <th>المدعو</th>
                      <th>أنشأها</th>
                      <th>التاريخ</th>
                      <th>الحالة</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {invitations.map((inv) => (
                      <tr key={inv.id}>
                        <td>{inv.roleLabel}</td>
                        <td>
                          {inv.name || '—'}
                          {inv.email && (
                            <div className="small text-muted" dir="ltr">
                              {inv.email}
                            </div>
                          )}
                        </td>
                        <td className="small">{inv.created_by_name || '—'}</td>
                        <td className="small">{when(inv.created_at)}</td>
                        <td>
                          <Badge bg={STATUS[inv.status]?.bg}>{STATUS[inv.status]?.label}</Badge>
                        </td>
                        <td>
                          {inv.status === 'pending' && inv.created_by_kind === 'platform' && (
                            <Button
                              size="sm"
                              variant="outline-danger"
                              onClick={() => revoke(inv.id)}
                            >
                              إلغاء
                            </Button>
                          )}
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
          <Card className="shadow-sm mb-3">
            <Card.Header className="fw-bold">أرقام الفرع</Card.Header>
            <Card.Body>
              <Table size="sm" className="mb-0">
                <tbody>
                  <tr>
                    <td>الطلاب</td>
                    <td>{branch.students}</td>
                  </tr>
                  <tr>
                    <td>المعلمون</td>
                    <td>{branch.teachers}</td>
                  </tr>
                  <tr>
                    <td>الحلقات</td>
                    <td>{branch.classes}</td>
                  </tr>
                  <tr>
                    <td>المستخدمون</td>
                    <td>{branch.users}</td>
                  </tr>
                  <tr>
                    <td>الجلسات المفتوحة</td>
                    <td>{branch.activeSessions}</td>
                  </tr>
                  <tr>
                    <td>تاريخ الإنشاء</td>
                    <td className="small">{when(branch.createdAt)}</td>
                  </tr>
                  <tr>
                    <td>آخر نشاط</td>
                    <td className="small">{when(branch.lastActivityAt)}</td>
                  </tr>
                </tbody>
              </Table>
            </Card.Body>
          </Card>
          <Card className="shadow-sm">
            <Card.Header className="fw-bold">بيانات الفرع</Card.Header>
            <Card.Body>
              <Form onSubmit={save}>
                <BranchFields value={form} onChange={setForm} />
                <Button type="submit" variant="outline-primary" disabled={busy}>
                  حفظ
                </Button>
              </Form>
            </Card.Body>
          </Card>
        </Col>
      </Row>
      <SuspendModal
        branch={branch}
        show={showSuspend}
        onHide={() => setShowSuspend(false)}
        onConfirm={() => setStatus('suspended')}
      />
    </>
  );
}

export default BranchDetail;
