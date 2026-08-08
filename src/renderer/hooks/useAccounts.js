import { useState, useEffect, useCallback } from 'react';
import { error as logError } from '@renderer/utils/logger';
import { showErrorToast } from '@renderer/utils/toast';

/**
 * Custom hook for managing accounts
 * @returns {Object} - accounts, loading, error, refresh function
 */
export function useAccounts() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await window.electronAPI.getAccounts();
      setAccounts(data);
      setError(null);
    } catch (err) {
      logError('Error fetching accounts:', err);
      setAccounts([]);
      setError(err);
      showErrorToast('فشل في تحميل الحسابات.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  return {
    accounts,
    loading,
    error,
    refresh: fetchAccounts,
  };
}
