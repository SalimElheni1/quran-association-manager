import React from 'react';
import { Card, Button, Spinner, Alert } from 'react-bootstrap';

/**
 * The web version of «حفظ نسخة احتياطية»: a backup is a file the browser downloads. It is the
 * same encrypted .qdb file the desktop app makes, so it can also be restored there.
 */
function WebBackupCard({ hasKey, isBackingUp, onBackup, backupStatus }) {
  return (
    <Card className="shadow-sm border mb-4" data-section="make-backup">
      <Card.Body>
        <h5 className="text-primary border-bottom pb-2 mb-2">تنزيل نسخة احتياطية</h5>
        <p className="small text-muted">
          بيانات الفرع محفوظة على الخادم، وإدارة المنصة تحتفظ بنسخ احتياطية يومية. يمكنك أيضاً تنزيل
          نسخة كاملة من بيانات فرعك في أي وقت: ملف واحد (<bdi dir="ltr">.qdb</bdi>) مشفّر برمز حماية
          النسخ الاحتياطية، يُسترجع هنا أو في تطبيق سطح المكتب. احفظه في مكان آمن.
        </p>
        {!hasKey && (
          <Alert variant="warning" className="small">
            حدّد أولاً رمز حماية النسخ الاحتياطية أعلاه: به تُشفَّر النسخة ولا تُفتح إلا به.
          </Alert>
        )}
        <Button variant="success" onClick={onBackup} disabled={isBackingUp || !hasKey}>
          {isBackingUp ? <Spinner size="sm" /> : 'تنزيل نسخة احتياطية الآن'}
        </Button>
        <div className="mt-3 p-2 rounded border bg-light small" data-section="last-backup">
          {backupStatus ? (
            <>
              <strong>آخر نسخة احتياطية:</strong>{' '}
              {new Date(backupStatus.timestamp).toLocaleString()} —{' '}
              <span className={backupStatus.success ? 'text-success' : 'text-danger'}>
                {backupStatus.success ? 'ناجحة' : 'فاشلة'}
              </span>
              {backupStatus.success && backupStatus.filePath && (
                <div className="text-muted text-break" dir="ltr">
                  {backupStatus.filePath}
                </div>
              )}
              {!backupStatus.success && backupStatus.message && (
                <div className="text-danger">{backupStatus.message}</div>
              )}
            </>
          ) : (
            <span className="text-muted">لم تُنزَّل أي نسخة احتياطية بعد.</span>
          )}
        </div>
      </Card.Body>
    </Card>
  );
}

export default WebBackupCard;
