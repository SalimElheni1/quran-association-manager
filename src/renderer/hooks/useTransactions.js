import { useState, useEffect, useCallback } from 'react';
import { error as logError } from '@renderer/utils/logger';

/**
 * Custom hook for managing transactions with pagination support
 * @param {Object} filters - Filter criteria for transactions
 * @param {number} filters.page - Page number (optional, enables pagination)
 * @param {number} filters.limit - Items per page (optional, enables pagination)
 * @returns {Object} - transactions, loading, refresh function, pagination data
 */
export function useTransactions(filters = {}) {
  const [transactions, setTransactions] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await window.electronAPI.getTransactions(filters);

      // Check if pagination is enabled
      if (data && typeof data === 'object' && data.transactions) {
        setTransactions(data.transactions);
        setPagination({
          total: data.total,
          page: data.page,
          limit: data.limit,
          totalPages: data.totalPages,
        });
      } else {
        // Fallback for simple array response (backwards compatibility)
        setTransactions(Array.isArray(data) ? data : []);
        setPagination(null);
      }
    } catch (err) {
      logError('Error fetching transactions:', err);
      setTransactions([]);
      setPagination(null);
    } finally {
      setLoading(false);
    }
  }, [
    filters.type,
    filters.category,
    filters.startDate,
    filters.endDate,
    filters.accountId,
    filters.searchTerm,
    filters.page,
    filters.limit,
  ]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  return {
    transactions,
    pagination,
    loading,
    refresh: fetchTransactions,
  };
}
