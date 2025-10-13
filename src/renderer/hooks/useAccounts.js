import { useState, useEffect, useCallback } from 'react';
import { error as logError } from '@renderer/utils/logger';

/**
 * Custom hook for managing accounts
 * @returns {Object} - accounts, loading, refresh function
 */
export function useAccounts() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const data = await window.electronAPI.getAccounts();
      setAccounts(data);
    } catch (err) {
      logError('Error fetching accounts:', err);
      setAccounts([]);
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
    refresh: fetchAccounts,
  };
}
