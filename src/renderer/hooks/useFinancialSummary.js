import { useState, useEffect, useCallback } from 'react';
import { error as logError } from '@renderer/utils/logger';

/**
 * Custom hook for financial summary data
 * @param {Object} period - Period with startDate and endDate
 * @returns {Object} - summary, loading, refresh function
 */
export function useFinancialSummary(period) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchSummary = useCallback(async () => {
    if (!period || !period.startDate || !period.endDate) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = await window.electronAPI.getFinancialSummary(period);
      setSummary(data);
    } catch (err) {
      logError('Failed to fetch financial summary:', err);
      setSummary({
        totalIncome: 0,
        totalExpenses: 0,
        balance: 0,
        transactionCount: 0,
        incomeByCategory: [],
        expensesByCategory: [],
        recentTransactions: [],
      });
    } finally {
      setLoading(false);
    }
  }, [period?.startDate, period?.endDate]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  return {
    summary,
    loading,
    refresh: fetchSummary,
  };
}
