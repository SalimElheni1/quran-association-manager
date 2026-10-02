import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import { useAuth } from '@renderer/contexts/AuthContext';
import TransferKeyModal from '@renderer/components/settings/TransferKeyModal';

/**
 * New installs choose the backup protection key at first-run setup. Installs from before that
 * (or a restored database that had none) ask the Superadmin for it after login; the prompt
 * cannot be dismissed, since backups without it can only be restored on this machine.
 *
 * @returns {JSX.Element|null}
 */
function TransferKeyRequiredPrompt() {
  const { user } = useAuth();
  const isSuperadmin = !!user?.roles?.includes('Superadmin');
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isSuperadmin) {
      setShow(false);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const response = await window.electronAPI.getSettings();
        // Only an explicit "not set": an empty answer (database not open) asks nothing.
        if (!cancelled && response?.success && response.settings?.has_transfer_key === false) {
          setShow(true);
        }
      } catch {
        // The settings page still shows the missing key.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSuperadmin, user?.id]);

  if (!isSuperadmin) return null;

  return (
    <TransferKeyModal
      show={show}
      required
      onSaved={(message) => {
        setShow(false);
        toast.success(message || 'تم حفظ رمز حماية النسخ الاحتياطية.');
        window.dispatchEvent(new Event('settings-updated'));
      }}
    />
  );
}

export default TransferKeyRequiredPrompt;
