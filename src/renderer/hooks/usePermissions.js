import { useAuth } from '@renderer/contexts/AuthContext';
import { hasPermission, hasAnyPermission, canAccessModule } from '@renderer/utils/permissions';

export const usePermissions = () => {
  const { user } = useAuth();
  const userRoles = user?.roles || [];

  return {
    hasPermission: (permission) => hasPermission(userRoles, permission),
    hasAnyPermission: (permissions) => hasAnyPermission(userRoles, permissions),
    canAccessModule: (module) => canAccessModule(userRoles, module),
    userRoles,
  };
};