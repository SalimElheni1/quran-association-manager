import React, { useState, useEffect } from 'react';
import { Card, Button, Alert, Badge } from 'react-bootstrap';
import { toast } from 'react-toastify';
import PasswordPromptModal from '@renderer/components/PasswordPromptModal';
import TransferKeyModal from '@renderer/components/settings/TransferKeyModal';

// How long a revealed key stays on screen before it is hidden again.
const REVEAL_SECONDS = 30;

/**
 * The backup protection key (association transfer key) in the backup tab. The key is never part
 * of the settings the window receives: the Superadmin reveals it, or changes it, with their
 * password, so a session left open does not show it. Other roles only see whether it is set.
 *
 * @param {Object} props
 * @param {string} props.label - The key's name, shared with the rest of the backup tab.
 * @param {boolean} props.hasKey - Whether a key is set.
 * @param {boolean} props.canManage - The user is the Superadmin.
 * @param {Function} props.onChanged - Called after the key was set or changed.
 * @returns {JSX.Element}
 */
function TransferKeyCard({ label, hasKey, canManage, onChanged }) {
  const [showRevealPrompt, setShowRevealPrompt] = useState(false);
  const [showChangeModal, setShowChangeModal] = useState(false);
  const [revealedKey, setRevealedKey] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (!revealedKey) return undefined;
    if (secondsLeft <= 0) {
      setRevealedKey('');
      return undefined;
    }
    const timer = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [revealedKey, secondsLeft]);

  const hideKey = () => {
    setRevealedKey('');
    setSecondsLeft(0);
  };

  const handleRevealConfirm = async (password) => {
    setShowRevealPrompt(false);
    if (!password) return;
    try {
      const result = await window.electronAPI.revealTransferKey({ password });
      if (result?.success) {
        setRevealedKey(result.key);
        setSecondsLeft(REVEAL_SECONDS);
      } else {
        toast.error(result?.message || 'تعذر عرض الرمز.');
      }
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleSaved = (message) => {
    setShowChangeModal(false);
    hideKey();
    toast.success(message || 'تم حفظ رمز حماية النسخ الاحتياطية.');
    onChanged();
  };

  return (
    <Card className="shadow-sm border mb-4" data-section="backup-key">
      <Card.Body>
        <h5 className="text-primary border-bottom pb-2 mb-2">{label}</h5>
        <p className="small text-muted">
          رمز سرّي مشترك بين أجهزة الجمعية. تُشفَّر به النسخ الاحتياطية، فيمكن استرجاعها على أي جهاز
          يعرف الرمز — مثلاً عند تعطّل هذا الجهاز. احفظه في مكان آمن: بدونه لا يمكن استرجاع النسخ
          على جهاز آخر.
        </p>

        <p className="mb-2">
          الحالة:{' '}
          {hasKey ? (
            <Badge bg="success" data-testid="transfer-key-status">
              تم تعيين الرمز
            </Badge>
          ) : (
            <Badge bg="warning" text="dark" data-testid="transfer-key-status">
              لم يتم تعيين الرمز
            </Badge>
          )}
        </p>

        {!hasKey && (
          <Alert variant="warning" className="small mb-2">
            لم يتم تعيين الرمز: النسخ الاحتياطية ستكون مشفّرة بمفتاح هذا الجهاز فقط، ولن يمكن
            استرجاعها على جهاز آخر إذا تعطّل هذا الجهاز.
            {!canManage && ' اطلب من مدير النظام تعيينه.'}
          </Alert>
        )}

        {revealedKey && (
          <Alert variant="info" className="d-flex justify-content-between align-items-center">
            <span>
              الرمز:{' '}
              <bdi dir="ltr" className="fw-bold user-select-all" data-testid="transfer-key-value">
                {revealedKey}
              </bdi>
              <span className="small text-muted ms-2">(يُخفى بعد {secondsLeft} ثانية)</span>
            </span>
            <Button variant="outline-secondary" size="sm" onClick={hideKey}>
              إخفاء
            </Button>
          </Alert>
        )}

        {canManage && (
          <div className="d-flex gap-2">
            {hasKey && !revealedKey && (
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={() => setShowRevealPrompt(true)}
              >
                عرض الرمز
              </Button>
            )}
            <Button variant="outline-primary" size="sm" onClick={() => setShowChangeModal(true)}>
              {hasKey ? 'تغيير الرمز' : 'تعيين الرمز'}
            </Button>
          </div>
        )}
      </Card.Body>

      <PasswordPromptModal
        show={showRevealPrompt}
        onHide={() => setShowRevealPrompt(false)}
        onConfirm={handleRevealConfirm}
        title="عرض رمز حماية النسخ الاحتياطية"
        body="لعرض الرمز، أدخل كلمة المرور الخاصة بك."
      />
      <TransferKeyModal
        show={showChangeModal}
        onHide={() => setShowChangeModal(false)}
        onSaved={handleSaved}
        hasKey={hasKey}
      />
    </Card>
  );
}

export default TransferKeyCard;
