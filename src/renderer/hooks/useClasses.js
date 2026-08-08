import { useState, useEffect, useCallback } from 'react';
import { error as logError } from '@renderer/utils/logger';
import { showErrorToast } from '@renderer/utils/toast';

/**
 * Custom hook for managing classes data
 * @param {Object} filters - Optional filters for classes
 * @returns {Object} - classes array, loading state, error, refresh function
 */
export function useClasses(filters = {}) {
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchClasses = useCallback(async () => {
    setLoading(true);
    try {
      const data = await window.electronAPI.getClasses(filters);
      if (data && Array.isArray(data)) {
        setClasses(data);
      } else {
        setClasses([]);
      }
      setError(null);
    } catch (err) {
      logError('Error fetching classes:', err);
      setClasses([]);
      setError(err);
      showErrorToast('فشل في تحميل الفصول.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClasses();
  }, [fetchClasses]);

  return {
    classes,
    loading,
    error,
    refresh: fetchClasses,
  };
}
