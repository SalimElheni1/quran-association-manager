import { useState, useEffect, useCallback } from 'react';
import { error as logError } from '@renderer/utils/logger';

/**
 * Custom hook for managing transactions
 * @param {Object} filters - Filter criteria for transactions
 * @returns {Object} - transactions, loading, refresh function
 */
export function useTransactions(filters = {}) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await window.electronAPI.getTransactions(filters);
      setTransactions(data);
    } catch (err) {
      logError('Error fetching transactions:', err);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, [filters.type, filters.category, filters.startDate, filters.endDate, filters.accountId, filters.searchTerm]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  return {
    transactions,
    loading,
    refresh: fetchTransactions
  };
}
