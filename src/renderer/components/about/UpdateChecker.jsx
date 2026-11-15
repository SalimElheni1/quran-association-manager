import React, { useEffect, useState } from 'react';
import { Alert, Button, ProgressBar, Spinner } from 'react-bootstrap';

// idle → checking → (upToDate | available) → downloading → ready → installing; error at any step.
const UpdateChecker = () => {
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const [newVersion, setNewVersion] = useState('');
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    const unsubscribe = window.electronAPI.onUpdateProgress?.((payload) => {
      setPercent(payload?.percent ?? 0);
    });
    return () => unsubscribe?.();
  }, []);

  const fail = (msg) => {
    setStatus('error');
    setMessage(msg || 'حدث خطأ غير متوقع.');
  };

  const check = async () => {
    setStatus('checking');
    setMessage('');
    try {
      const result = await window.electronAPI.checkForUpdate();
      if (!result?.success) return fail(result?.message);
      if (!result.available) return setStatus('upToDate');
      setNewVersion(result.version || '');
      setStatus(result.downloaded ? 'ready' : 'available');
    } catch {
      fail('تعذر التحقق من التحديثات.');
    }
  };

  const download = async () => {
    setStatus('downloading');
    setPercent(0);
    try {
      const result = await window.electronAPI.downloadUpdate();
      if (!result?.success) return fail(result?.message);
      setStatus('ready');
    } catch {
      fail('تعذر تنزيل التحديث.');
    }
  };

  const install = async () => {
    setStatus('installing');
    try {
      const result = await window.electronAPI.installUpdate();
      if (!result?.success) fail(result?.message);
    } catch {
      fail('تعذر تثبيت التحديث.');
    }
  };

  const busy = status === 'checking' || status === 'downloading' || status === 'installing';

  return (
    <div className="update-checker">
      {(status === 'idle' ||
        status === 'upToDate' ||
        status === 'error' ||
        status === 'checking') && (
        <Button variant="outline-primary" onClick={check} disabled={busy}>
          {status === 'checking' ? (
            <>
              <Spinner as="span" animation="border" size="sm" className="me-2" />
              جاري التحقق...
            </>
          ) : (
            'التحقق من وجود تحديث'
          )}
        </Button>
      )}

      {status === 'upToDate' && (
        <Alert variant="success" className="mt-3 mb-0">
          أنت تستخدم أحدث نسخة من التطبيق.
        </Alert>
      )}

      {status === 'error' && (
        <Alert variant="danger" className="mt-3 mb-0">
          {message}
        </Alert>
      )}

      {status === 'available' && (
        <Alert variant="info" className="mb-0">
          <p>
            تتوفر نسخة جديدة: <strong>{newVersion}</strong>
          </p>
          <Button variant="primary" onClick={download}>
            تنزيل التحديث
          </Button>
        </Alert>
      )}

      {status === 'downloading' && (
        <div>
          <p className="mb-2">جاري تنزيل النسخة {newVersion}...</p>
          <ProgressBar now={percent} label={`${percent}%`} animated />
        </div>
      )}

      {(status === 'ready' || status === 'installing') && (
        <Alert variant="success" className="mb-0">
          <p>
            تم تنزيل النسخة <strong>{newVersion}</strong>. سيتم إغلاق التطبيق وتثبيت التحديث ثم
            إعادة تشغيله.
          </p>
          <Button variant="success" onClick={install} disabled={status === 'installing'}>
            {status === 'installing' ? 'جاري الإغلاق...' : 'تثبيت التحديث الآن'}
          </Button>
        </Alert>
      )}
    </div>
  );
};

export default UpdateChecker;
