import React, { useCallback, useEffect, useState } from 'react';
import { Badge, Card, Spinner, Table } from 'react-bootstrap';
import { toast } from 'react-toastify';
import { apiJson } from '@web/http';

const when = (value) => (value ? new Date(value).toLocaleString('ar-TN') : '—');

const ACTIONS = {
  'login.success': 'تسجيل دخول إلى فرع',
  'login.failure': 'محاولة دخول فاشلة إلى فرع',
  'platform.login.success': 'دخول إلى إدارة المنصة',
  'platform.login.failure': 'محاولة دخول فاشلة إلى إدارة المنصة',
  'platform.password.change': 'تغيير كلمة مرور مدير منصة',
  'platform.admin.create': 'إضافة مدير منصة',
  'platform.admin.active': 'تفعيل مدير منصة',
  'platform.admin.disabled': 'تعطيل مدير منصة',
  'branch.create': 'إنشاء فرع',
  'branch.update': 'تعديل بيانات فرع',
  'branch.suspend': 'إيقاف فرع',
  'branch.reactivate': 'إعادة تفعيل فرع',
  'branch.export': 'تنزيل نسخة احتياطية',
  'branch.import': 'استرجاع نسخة احتياطية',
  'invitation.create': 'إنشاء دعوة',
  'invitation.revoke': 'إلغاء دعوة',
  'invitation.accept': 'قبول دعوة',
  'session.revoke': 'إنهاء جلسة',
};

const ACTOR = { platform: 'إدارة المنصة', branch: 'الفرع', system: 'النظام', anonymous: 'مجهول' };

function AuditView({ api, onUnauthorized }) {
  const [entries, setEntries] = useState(null);

  const load = useCallback(async () => {
    try {
      setEntries((await apiJson(`${api}/audit?limit=300`)).entries);
    } catch (err) {
      if (err.status === 401) onUnauthorized();
      else toast.error(err.message);
    }
  }, [api, onUnauthorized]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <h1 className="h3 mb-3">سجل النشاط</h1>
      <Card className="shadow-sm">
        <Card.Body>
          {!entries ? (
            <Spinner />
          ) : (
            <Table responsive size="sm" hover className="mb-0">
              <thead>
                <tr>
                  <th>التاريخ</th>
                  <th>العملية</th>
                  <th>الفرع</th>
                  <th>بواسطة</th>
                  <th>العنوان</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td className="small text-nowrap">{when(e.at)}</td>
                    <td>{ACTIONS[e.action] || e.action}</td>
                    <td>{e.branch_name || '—'}</td>
                    <td>
                      {e.actor_name || '—'}{' '}
                      <Badge bg="light" text="dark">
                        {ACTOR[e.actor_kind]}
                      </Badge>
                    </td>
                    <td className="small" dir="ltr">
                      {e.ip || ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card.Body>
      </Card>
    </>
  );
}

export default AuditView;
