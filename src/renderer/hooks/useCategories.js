import { useState, useEffect, useCallback } from 'react';
import { error as logError } from '@renderer/utils/logger';
import { showErrorToast } from '@renderer/utils/toast';

/**
 * Custom hook for managing categories
 * @param {string} type - Category type ('INCOME', 'EXPENSE', or null for all)
 * @returns {Object} - categories, loading, error, refresh function
 */
export function useCategories(type = null) {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    try {
      const data = await window.electronAPI.getCategories(type);
      setCategories(data || []);
      setError(null);
    } catch (err) {
      logError('Error fetching categories:', err);
      setCategories([]);
      setError(err);
      showErrorToast('فشل في تحميل التصنيفات.');
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  return {
    categories,
    loading,
    error,
    refresh: fetchCategories,
  };
}
