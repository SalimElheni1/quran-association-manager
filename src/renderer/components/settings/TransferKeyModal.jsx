import React, { useState } from 'react';
import { Modal, Button, Form, Alert, Spinner } from 'react-bootstrap';
import PasswordInput from '@renderer/components/PasswordInput';
import { checkTransferKey, TRANSFER_KEY_HINT } from '@renderer/utils/transferKeyPolicy';

/**
 * Sets or changes the backup protection key (association transfer key). The Superadmin confirms
 * with their password; the key is typed twice and never shown back.
 *
 * @param {Object} props
 * @param {boolean} props.show
 * @param {Function} [props.onHide] - Not called when `required` (the modal cannot be dismissed).
 * @param {Function} props.onSaved - Called after the key was saved.
 * @param {boolean} [props.required] - The install has no key yet: no cancel, no close button.
 * @param {boolean} [props.hasKey] - A key already exists (the change warns about older backups).
 * @returns {JSX.Element}
 */
function TransferKeyModal({ show, onHide, onSaved, required = false, hasKey = false }) {
  const [password, setPassword] = useState('');
  const [key, setKey] = useState('');
  const [confirmKey, setConfirmKey] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setPassword('');
    setKey('');
    setConfirmKey('');
    setError('');
  };

  const handleHide = () => {
    if (required || saving) return;
    reset();
    if (onHide) onHide();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // The settings page renders this inside its own form; React events cross the portal.
    e.stopPropagation();
    if (!password) {
      setError('أدخل كلمة المرور الخاصة بك.');
      return;
    }
    const keyError = checkTransferKey(key, { confirmKey, password });
    if (keyError) {
      setError(keyError);
      return;
    }
    setError('');
    setSaving(true);
    try {
      const result = await window.electronAPI.setTransferKey({ password, key, confirmKey });
      if (result?.success) {
        reset();
        onSaved(result.message);
      } else {
        setError(result?.message || 'تعذر حفظ رمز حماية النسخ الاحتياطية.');
      }
    } catch (err) {
      setError(err.message || 'تعذر حفظ رمز حماية النسخ الاحتياطية.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      show={show}
      onHide={handleHide}
      centered
      backdrop="static"
      keyboard={!required}
      data-testid="transfer-key-modal"
    >
      <Form onSubmit={handleSubmit}>
        <Modal.Header closeButton={!required}>
          <Modal.Title>
            {hasKey ? 'تغيير رمز حماية النسخ الاحتياطية' : 'تعيين رمز حماية النسخ الاحتياطية'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {required && (
            <Alert variant="warning" className="small">
              لم يتم تعيين رمز حماية النسخ الاحتياطية على هذا الجهاز. بدونه تُشفَّر النسخ الاحتياطية
              بمفتاح هذا الجهاز فقط، ولا يمكن استرجاعها على جهاز آخر إذا تعطّل.
            </Alert>
          )}
          <p className="small text-muted">
            رمز سرّي مشترك بين أجهزة الجمعية تُشفَّر به النسخ الاحتياطية. إذا كانت جمعيتك تستعمل
            رمزاً على جهاز آخر، أدخل نفس الرمز.
          </p>
          {hasKey && (
            <Alert variant="info" className="small">
              النسخ الاحتياطية القديمة تبقى مشفّرة بالرمز السابق: لاسترجاعها لاحقاً اكتب الرمز
              السابق في نافذة الاسترجاع.
            </Alert>
          )}
          {error && <Alert variant="danger">{error}</Alert>}
          <PasswordInput
            name="transfer-key-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            label="كلمة المرور الخاصة بك"
            autoComplete="current-password"
            autoFocus
            required
          />
          <PasswordInput
            name="transfer-key-new"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            label="رمز حماية النسخ الاحتياطية"
            helpText={TRANSFER_KEY_HINT}
            autoComplete="off"
            required
          />
          <PasswordInput
            name="transfer-key-confirm"
            value={confirmKey}
            onChange={(e) => setConfirmKey(e.target.value)}
            label="تأكيد الرمز"
            autoComplete="off"
            required
          />
        </Modal.Body>
        <Modal.Footer>
          {!required && (
            <Button variant="secondary" onClick={handleHide} disabled={saving}>
              إلغاء
            </Button>
          )}
          <Button variant="primary" type="submit" disabled={saving}>
            {saving ? <Spinner size="sm" /> : 'حفظ الرمز'}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
}

export default TransferKeyModal;
