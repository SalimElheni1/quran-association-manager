import { renderHook } from '@testing-library/react';
import { usePermissions } from '@renderer/hooks/usePermissions';
import { useAuth } from '@renderer/contexts/AuthContext';
import * as permissions from '@renderer/utils/permissions';

jest.mock('@renderer/contexts/AuthContext');
jest.mock('@renderer/utils/permissions');

describe('usePermissions Hook', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return permission functions and user roles', () => {
    const mockUser = { id: 1, username: 'admin', roles: ['Superadmin'] };
    useAuth.mockReturnValue({ user: mockUser });

    const { result } = renderHook(() => usePermissions());

    expect(result.current).toHaveProperty('hasPermission');
    expect(result.current).toHaveProperty('hasAnyPermission');
    expect(result.current).toHaveProperty('canAccessModule');
    expect(result.current.userRoles).toEqual(['Superadmin']);
  });

  it('should handle user with no roles', () => {
    const mockUser = { id: 2, username: 'user', roles: [] };
    useAuth.mockReturnValue({ user: mockUser });

    const { result } = renderHook(() => usePermissions());

    expect(result.current.userRoles).toEqual([]);
  });

  it('should handle null user', () => {
    useAuth.mockReturnValue({ user: null });

    const { result } = renderHook(() => usePermissions());

    expect(result.current.userRoles).toEqual([]);
  });

  it('should call hasPermission with correct arguments', () => {
    const mockUser = { id: 1, username: 'admin', roles: ['Administrator'] };
    useAuth.mockReturnValue({ user: mockUser });
    permissions.hasPermission.mockReturnValue(true);

    const { result } = renderHook(() => usePermissions());
    const hasStudentsView = result.current.hasPermission('students:view');

    expect(permissions.hasPermission).toHaveBeenCalledWith(['Administrator'], 'students:view');
    expect(hasStudentsView).toBe(true);
  });

  it('should call hasAnyPermission with correct arguments', () => {
    const mockUser = { id: 1, username: 'finance', roles: ['FinanceManager'] };
    useAuth.mockReturnValue({ user: mockUser });
    permissions.hasAnyPermission.mockReturnValue(true);

    const { result } = renderHook(() => usePermissions());
    const hasAny = result.current.hasAnyPermission(['students:view', 'financials:view']);

    expect(permissions.hasAnyPermission).toHaveBeenCalledWith(
      ['FinanceManager'],
      ['students:view', 'financials:view'],
    );
    expect(hasAny).toBe(true);
  });

  it('should call canAccessModule with correct arguments', () => {
    const mockUser = { id: 1, username: 'supervisor', roles: ['SessionSupervisor'] };
    useAuth.mockReturnValue({ user: mockUser });
    permissions.canAccessModule.mockReturnValue(true);

    const { result } = renderHook(() => usePermissions());
    const canAccess = result.current.canAccessModule('attendance');

    expect(permissions.canAccessModule).toHaveBeenCalledWith(['SessionSupervisor'], 'attendance');
    expect(canAccess).toBe(true);
  });
});
