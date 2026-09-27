import { useCallback, useEffect, useState } from 'react';
import { getAcademicYearString } from '@renderer/utils/academicYear';

/**
 * Loads the academic-year start month configured in the settings and the current academic
 * year, as the main process computes them for charges and payments. Until they load (or when
 * they can't be read), a September start is assumed.
 * @returns {{startMonth: number, academicYear: string, loaded: boolean, reload: Function}}
 */
export function useAcademicYear() {
  const [info, setInfo] = useState({
    startMonth: 9,
    academicYear: getAcademicYearString(),
    loaded: false,
  });

  const reload = useCallback(async () => {
    try {
      const result = await window.electronAPI.studentFeesGetAcademicYear();
      if (result && result.academicYear) {
        const next = {
          startMonth: Number(result.startMonth) || 9,
          academicYear: result.academicYear,
          loaded: true,
        };
        setInfo(next);
        return next;
      }
    } catch (err) {
      console.error('[useAcademicYear] Failed to load the academic year:', err);
    }
    setInfo((current) => ({ ...current, loaded: true }));
    return null;
  }, []);

  useEffect(() => {
    reload();
    const handleSettingsUpdated = () => reload();
    window.addEventListener('settings-updated', handleSettingsUpdated);
    return () => window.removeEventListener('settings-updated', handleSettingsUpdated);
  }, [reload]);

  return { ...info, reload };
}

export default useAcademicYear;
