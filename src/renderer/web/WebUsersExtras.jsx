import React, { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, Form, Modal, Spinner, Tab, Table, Tabs } from 'react-bootstrap';
import { toast } from 'react-toastify';
import InviteLinkBox from '@renderer/web/InviteLinkBox';
import { currentBranch } from '@renderer/utils/platform';

const ROLE_OPTIONS = [
  { value: 'Administrator', label: 'الهيئة المديرة' },
  { value: 'FinanceManager', label: 'مسؤول مالي' },
  { value: 'SessionSupervisor', label: 'مشرف حصص' },
  { value: 'Superadmin', label: 'مدير النظام' },
];
const ROLE_LABELS = Object.fromEntries(ROLE_OPTIONS.map((r) => [r.value, r.label]));

const STATUS = {
  pending: { label: 'بانتظار القبول', bg: 'warning' },
  accepted: { label: 'مقبولة', bg: 'success' },
  expired: { label: 'منتهية الصلاحية', bg: 'secondary' },
  revoked: { label: 'ملغاة', bg: 'dark' },
};

const ACTIONS = {
  'login.success': 'تسجيل دخول',
  'login.failure': 'محاولة دخول فاشلة',
  'invitation.create': 'إنشاء دعوة',
  'invitation.revoke': 'إلغاء دعوة',
  'invitation.accept': 'قبول دعوة',
  'session.revoke': 'إنهاء جلسة',
  'branch.export': 'تنزيل نسخة احتياطية',
  'branch.import': 'استرجاع نسخة احتياطية',
  'branch.create': 'إنشاء الفرع',
  'branch.update': 'تعديل بيانات الفرع',
  'branch.suspend': 'إيقاف الفرع',
  'branch.reactivate': 'إعادة تفعيل الفرع',
};

const when = (value) => (value ? new Date(value).toLocaleString('ar-TN') : '—');
const call = (channel, ...args) => window.electronAPI.webCall(channel, ...args);

function InviteUserModal({ show, onHide, onCreated }) {
  const [form, setForm] = useState({ role: 'Administrator', name: '', email: '' });
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState(null);

  useEffect(() => {
    if (show) {
      setForm({ role: 'Administrator', name: '', email: '' });
      setCreated(null);
    }
  }, [show]);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const result = await call('web:invitations:create', {
        role: form.role,
        name: form.name.trim(),
        email: form.email.trim(),
      });
      if (result.success) {
        setCreated(result);
        onCreated();
      } else {
        toast.error(result.message || 'تعذر إنشاء الدعوة.');
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal show={show} onHide={onHide} centered>
      <Modal.Header closeButton>
        <Modal.Title>دعوة مستخدم إلى الفرع</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {created ? (
          <InviteLinkBox
            link={created.link}
            emailed={created.emailed}
            email={created.invitation.email}
            branchName={currentBranch()?.name}
            roleLabel={ROLE_LABELS[created.invitation.role]}
          />
        ) : (
          <Form id="invite-user-form" onSubmit={submit}>
            <p className="small text-muted">
              يختار المدعو بنفسه اسم المستخدم وكلمة المرور عبر الرابط. الرابط صالح لمرة واحدة ولمدة
              محدودة، ويمكنك إلغاؤه قبل استعماله.
            </p>
            <Form.Group className="mb-3">
              <Form.Label>الدور</Form.Label>
              <Form.Select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>اسم المدعو (اختياري)</Form.Label>
              <Form.Control
                value={form.name}
                maxLength={150}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Form.Group>
            <Form.Group className="mb-1">
              <Form.Label>البريد الإلكتروني (اختياري)</Form.Label>
              <Form.Control
                type="email"
                dir="ltr"
                value={form.email}
                maxLength={200}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
              <Form.Text className="text-muted">
                إن أدخلته تُرسل الدعوة إليه (إذا كان البريد مفعّلاً على الخادم). في كل الحالات تحصل
                على رابط تشاركه بنفسك.
              </Form.Text>
            </Form.Group>
          </Form>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          {created ? 'إغلاق' : 'إلغاء'}
        </Button>
        {!created && (
          <Button type="submit" form="invite-user-form" disabled={saving}>
            {saving ? <Spinner size="sm" /> : 'إنشاء الدعوة'}
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  );
}

/**
 * The branch Superadmin's web tools under the users table: invitations, open sessions and the
 * activity log.
 */
function WebUsersExtras({ onUserJoined }) {
  const [tab, setTab] = useState('invitations');
  const [showInvite, setShowInvite] = useState(false);
  const [invitations, setInvitations] = useState(null);
  const [sessions, setSessions] = useState(null);
  const [entries, setEntries] = useState(null);

  const loadInvitations = useCallback(async () => {
    try {
      const result = await call('web:invitations:list');
      setInvitations(result.invitations || []);
    } catch (err) {
      toast.error(err.message);
    }
  }, []);
  const loadSessions = useCallback(async () => {
    try {
      const result = await call('web:sessions:list');
      setSessions(result.sessions || []);
    } catch (err) {
      toast.error(err.message);
    }
  }, []);
  const loadAudit = useCallback(async () => {
    try {
      const result = await call('web:audit:list', { limit: 200 });
      setEntries(result.entries || []);
    } catch (err) {
      toast.error(err.message);
    }
  }, []);

  useEffect(() => {
    if (tab === 'invitations') loadInvitations();
    if (tab === 'sessions') loadSessions();
    if (tab === 'audit') loadAudit();
  }, [tab, loadInvitations, loadSessions, loadAudit]);

  const revokeInvitation = async (id) => {
    const result = await call('web:invitations:revoke', { id });
    if (result.success) toast.success(result.message);
    else toast.error(result.message);
    loadInvitations();
  };

  const revokeSession = async (id) => {
    const result = await call('web:sessions:revoke', { id });
    if (result.success) toast.success(result.message);
    else toast.error(result.message);
    loadSessions();
  };

  const loading = <Spinner size="sm" className="m-3" />;

  return (
    <Card className="mt-4 shadow-sm" data-section="web-users-extras">
      <Card.Header className="d-flex justify-content-between align-items-center flex-wrap gap-2">
        <span className="fw-bold">الدعوات والأمان</span>
        <Button size="sm" onClick={() => setShowInvite(true)} data-testid="invite-user">
          دعوة مستخدم برابط
        </Button>
      </Card.Header>
      <Card.Body>
        <Tabs activeKey={tab} onSelect={(k) => setTab(k)} className="mb-3">
          <Tab eventKey="invitations" title="الدعوات">
            {!invitations ? (
              loading
            ) : invitations.length === 0 ? (
              <p className="text-muted small mb-0">لا توجد دعوات بعد.</p>
            ) : (
              <Table size="sm" responsive hover>
                <thead>
                  <tr>
                    <th>الدور</th>
                    <th>المدعو</th>
                    <th>أنشأها</th>
                    <th>التاريخ</th>
                    <th>الصلاحية</th>
                    <th>الحالة</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {invitations.map((inv) => (
                    <tr key={inv.id}>
                      <td>{ROLE_LABELS[inv.role] || inv.role}</td>
                      <td>
                        {inv.name || '—'}
                        {inv.email && (
                          <div className="small text-muted" dir="ltr">
                            {inv.email}
                          </div>
                        )}
                      </td>
                      <td>
                        {inv.created_by_name || '—'}
                        {inv.created_by_kind === 'platform' && (
                          <Badge bg="info" className="ms-1">
                            إدارة المنصة
                          </Badge>
                        )}
                      </td>
                      <td className="small">{when(inv.created_at)}</td>
                      <td className="small">{when(inv.expires_at)}</td>
                      <td>
                        <Badge bg={STATUS[inv.status]?.bg || 'secondary'}>
                          {STATUS[inv.status]?.label || inv.status}
                        </Badge>
                      </td>
                      <td>
                        {inv.status === 'pending' && (
                          <Button
                            size="sm"
                            variant="outline-danger"
                            onClick={() => revokeInvitation(inv.id)}
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
          </Tab>
          <Tab eventKey="sessions" title="الجلسات المفتوحة">
            {!sessions ? (
              loading
            ) : (
              <Table size="sm" responsive hover>
                <thead>
                  <tr>
                    <th>المستخدم</th>
                    <th>بداية الجلسة</th>
                    <th>آخر نشاط</th>
                    <th>العنوان</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => (
                    <tr key={s.id}>
                      <td>
                        {s.name || s.username}
                        <div className="small text-muted" dir="ltr">
                          {s.username}
                        </div>
                      </td>
                      <td className="small">{when(s.createdAt)}</td>
                      <td className="small">{when(s.lastSeenAt)}</td>
                      <td className="small" dir="ltr">
                        {s.ip}
                      </td>
                      <td>
                        {s.current ? (
                          <Badge bg="success">هذه الجلسة</Badge>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline-danger"
                            onClick={() => revokeSession(s.id)}
                          >
                            إنهاء
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Tab>
          <Tab eventKey="audit" title="سجل النشاط">
            {!entries ? (
              loading
            ) : entries.length === 0 ? (
              <p className="text-muted small mb-0">لا يوجد نشاط مسجل بعد.</p>
            ) : (
              <Table size="sm" responsive hover>
                <thead>
                  <tr>
                    <th>التاريخ</th>
                    <th>العملية</th>
                    <th>بواسطة</th>
                    <th>العنوان</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id}>
                      <td className="small">{when(e.at)}</td>
                      <td>{ACTIONS[e.action] || e.action}</td>
                      <td>
                        {e.actor_name || '—'}
                        {e.actor_kind === 'platform' && (
                          <Badge bg="info" className="ms-1">
                            إدارة المنصة
                          </Badge>
                        )}
                      </td>
                      <td className="small" dir="ltr">
                        {e.ip || ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Tab>
        </Tabs>
      </Card.Body>
      <InviteUserModal
        show={showInvite}
        onHide={() => {
          setShowInvite(false);
          loadInvitations();
          if (onUserJoined) onUserJoined();
        }}
        onCreated={loadInvitations}
      />
    </Card>
  );
}

export default WebUsersExtras;
