import {
  hasPermission,
  hasAnyPermission,
  canAccessModule,
  PERMISSIONS,
  ROLE_PERMISSIONS,
} from '@renderer/utils/permissions';

describe('Permissions Utility', () => {
  describe('hasPermission', () => {
    it('should return true when user has the required permission', () => {
      const result = hasPermission(['Superadmin'], PERMISSIONS.STUDENTS_VIEW);
      expect(result).toBe(true);
    });

    it('should return true when Administrator has student permissions', () => {
      expect(hasPermission(['Administrator'], PERMISSIONS.STUDENTS_VIEW)).toBe(true);
      expect(hasPermission(['Administrator'], PERMISSIONS.STUDENTS_CREATE)).toBe(true);
      expect(hasPermission(['Administrator'], PERMISSIONS.STUDENTS_EDIT)).toBe(true);
      expect(hasPermission(['Administrator'], PERMISSIONS.STUDENTS_DELETE)).toBe(true);
    });

    it('should return false when user does not have the required permission', () => {
      const result = hasPermission(['SessionSupervisor'], PERMISSIONS.USERS_CREATE);
      expect(result).toBe(false);
    });

    it('should return false when userRoles is null', () => {
      const result = hasPermission(null, PERMISSIONS.STUDENTS_VIEW);
      expect(result).toBe(false);
    });

    it('should return false when userRoles is undefined', () => {
      const result = hasPermission(undefined, PERMISSIONS.STUDENTS_VIEW);
      expect(result).toBe(false);
    });

    it('should return false when userRoles is not an array', () => {
      const result = hasPermission('Administrator', PERMISSIONS.STUDENTS_VIEW);
      expect(result).toBe(false);
    });

    it('should return false when userRoles is empty array', () => {
      const result = hasPermission([], PERMISSIONS.STUDENTS_VIEW);
      expect(result).toBe(false);
    });

    it('should return true when user has multiple roles and one has permission', () => {
      const result = hasPermission(['SessionSupervisor', 'Administrator'], PERMISSIONS.USERS_VIEW);
      expect(result).toBe(true);
    });

    it('should handle FinanceManager permissions correctly', () => {
      expect(hasPermission(['FinanceManager'], PERMISSIONS.FINANCIALS_VIEW)).toBe(true);
      expect(hasPermission(['FinanceManager'], PERMISSIONS.FINANCIALS_MANAGE)).toBe(true);
      expect(hasPermission(['FinanceManager'], PERMISSIONS.STUDENTS_VIEW)).toBe(true);
      expect(hasPermission(['FinanceManager'], PERMISSIONS.STUDENTS_EDIT)).toBe(false);
    });

    it('should handle SessionSupervisor permissions correctly', () => {
      expect(hasPermission(['SessionSupervisor'], PERMISSIONS.ATTENDANCE_VIEW)).toBe(true);
      expect(hasPermission(['SessionSupervisor'], PERMISSIONS.ATTENDANCE_MANAGE)).toBe(true);
      expect(hasPermission(['SessionSupervisor'], PERMISSIONS.STUDENTS_VIEW)).toBe(true);
      expect(hasPermission(['SessionSupervisor'], PERMISSIONS.CLASSES_VIEW)).toBe(true);
      expect(hasPermission(['SessionSupervisor'], PERMISSIONS.FINANCIALS_VIEW)).toBe(false);
    });
  });

  describe('hasAnyPermission', () => {
    it('should return true when user has at least one of the permissions', () => {
      const result = hasAnyPermission(
        ['Administrator'],
        [PERMISSIONS.STUDENTS_VIEW, PERMISSIONS.USERS_CREATE],
      );
      expect(result).toBe(true);
    });

    it('should return false when user has none of the permissions', () => {
      const result = hasAnyPermission(
        ['SessionSupervisor'],
        [PERMISSIONS.USERS_CREATE, PERMISSIONS.SETTINGS_EDIT],
      );
      expect(result).toBe(false);
    });

    it('should return true when user has all of the permissions', () => {
      const result = hasAnyPermission(
        ['Superadmin'],
        [PERMISSIONS.STUDENTS_VIEW, PERMISSIONS.USERS_CREATE],
      );
      expect(result).toBe(true);
    });

    it('should return false when permissions array is empty', () => {
      const result = hasAnyPermission(['Administrator'], []);
      expect(result).toBe(false);
    });

    it('should handle multiple roles checking multiple permissions', () => {
      const result = hasAnyPermission(
        ['FinanceManager', 'SessionSupervisor'],
        [PERMISSIONS.FINANCIALS_VIEW, PERMISSIONS.ATTENDANCE_VIEW],
      );
      expect(result).toBe(true);
    });
  });

  describe('canAccessModule', () => {
    it('should return true when user can access students module', () => {
      expect(canAccessModule(['Administrator'], 'students')).toBe(true);
      expect(canAccessModule(['FinanceManager'], 'students')).toBe(true);
      expect(canAccessModule(['SessionSupervisor'], 'students')).toBe(true);
    });

    it('should return true when user can access teachers module', () => {
      expect(canAccessModule(['Administrator'], 'teachers')).toBe(true);
      expect(canAccessModule(['Superadmin'], 'teachers')).toBe(true);
    });

    it('should return true when user can access classes module', () => {
      expect(canAccessModule(['Administrator'], 'classes')).toBe(true);
      expect(canAccessModule(['SessionSupervisor'], 'classes')).toBe(true);
    });

    it('should return true when user can access attendance module', () => {
      expect(canAccessModule(['SessionSupervisor'], 'attendance')).toBe(true);
      expect(canAccessModule(['Administrator'], 'attendance')).toBe(true);
    });

    it('should return true when user can access financials module', () => {
      expect(canAccessModule(['FinanceManager'], 'financials')).toBe(true);
      expect(canAccessModule(['Superadmin'], 'financials')).toBe(true);
    });

    it('should return true when user can access users module', () => {
      expect(canAccessModule(['Superadmin'], 'users')).toBe(true);
      expect(canAccessModule(['Administrator'], 'users')).toBe(true);
    });

    it('should return true when user can access settings module', () => {
      expect(canAccessModule(['Superadmin'], 'settings')).toBe(true);
    });

    it('should return false when user cannot access module', () => {
      expect(canAccessModule(['SessionSupervisor'], 'financials')).toBe(false);
      expect(canAccessModule(['FinanceManager'], 'users')).toBe(false);
    });

    it('should return false for unknown module', () => {
      expect(canAccessModule(['Superadmin'], 'unknown')).toBe(false);
    });

    it('should return false when userRoles is empty', () => {
      expect(canAccessModule([], 'students')).toBe(false);
    });
  });

  describe('ROLE_PERMISSIONS structure', () => {
    it('should have Superadmin with all permissions', () => {
      const allPermissions = Object.values(PERMISSIONS);
      expect(ROLE_PERMISSIONS.Superadmin).toEqual(allPermissions);
    });

    it('should have Administrator with limited permissions', () => {
      expect(ROLE_PERMISSIONS.Administrator).toContain(PERMISSIONS.STUDENTS_VIEW);
      expect(ROLE_PERMISSIONS.Administrator).toContain(PERMISSIONS.TEACHERS_VIEW);
      expect(ROLE_PERMISSIONS.Administrator).not.toContain(PERMISSIONS.SETTINGS_EDIT);
    });

    it('should have FinanceManager with financial permissions only', () => {
      expect(ROLE_PERMISSIONS.FinanceManager).toContain(PERMISSIONS.FINANCIALS_VIEW);
      expect(ROLE_PERMISSIONS.FinanceManager).toContain(PERMISSIONS.FINANCIALS_MANAGE);
      expect(ROLE_PERMISSIONS.FinanceManager).not.toContain(PERMISSIONS.USERS_CREATE);
    });

    it('should have SessionSupervisor with attendance permissions', () => {
      expect(ROLE_PERMISSIONS.SessionSupervisor).toContain(PERMISSIONS.ATTENDANCE_VIEW);
      expect(ROLE_PERMISSIONS.SessionSupervisor).toContain(PERMISSIONS.ATTENDANCE_MANAGE);
      expect(ROLE_PERMISSIONS.SessionSupervisor).not.toContain(PERMISSIONS.FINANCIALS_VIEW);
    });
  });
});
