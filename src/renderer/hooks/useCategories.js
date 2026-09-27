import { useState, useEffect, useCallback } from 'react';
import { error as logError } from '@renderer/utils/logger';

/**
 * Custom hook for managing categories
 * @param {string} type - Category type ('INCOME', 'EXPENSE', or null for all)
 * @returns {Object} - categories, loading, refresh function
 */
export function useCategories(type = null) {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    try {
      const data = await window.electronAPI.getCategories(type);
      setCategories(data || []);
    } catch (err) {
      logError('Error fetching categories:', err);
      setCategories([]);
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
    refresh: fetchCategories,
  };
}
