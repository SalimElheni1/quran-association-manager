import { useState, useEffect, useCallback } from 'react';
import { error as logError } from '@renderer/utils/logger';

/**
 * Custom hook for managing students data
 * @param {Object} filters - Optional filters for students
 * @returns {Object} - students array, loading state, refresh function, search function
 */
export function useStudents(filters = {}) {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTimeout, setSearchTimeout] = useState(null);

  const fetchStudents = useCallback(
    async (searchFilters = {}) => {
      setLoading(true);
      try {
        const combinedFilters = { ...filters, ...searchFilters };
        const data = await window.electronAPI.getStudents(combinedFilters);
        if (data && data.students) {
          setStudents(data.students);
        } else {
          setStudents([]);
        }
      } catch (err) {
        logError('Error fetching students:', err);
        setStudents([]);
      } finally {
        setLoading(false);
      }
    },
    [filters.page, filters.limit],
  );

  const searchStudents = useCallback(
    (searchTerm, minCharacters = 2) => {
      // Clear previous timeout
      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }

      // Don't search if term is too short
      if (!searchTerm || searchTerm.length < minCharacters) {
        setStudents([]);
        setLoading(false);
        return;
      }

      // Set new timeout for debounced search
      const timeoutId = setTimeout(() => {
        fetchStudents({ searchTerm, limit: 15 }); // Limit results for better UX
      }, 300); // 300ms debounce

      setSearchTimeout(timeoutId);
      setLoading(searchTerm.length >= minCharacters); // Show loading only after min characters
    },
    [fetchStudents],
  );

  // Load all students initially if no search term and no specific filters
  useEffect(() => {
    if (!filters.searchTerm && !filters.page && !filters.limit) {
      // Don't auto-load all students - wait for search
    } else {
      fetchStudents();
    }
  }, [fetchStudents, filters]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }
    };
  }, [searchTimeout]);

  return {
    students,
    loading,
    searchStudents,
    refresh: fetchStudents,
  };
}
