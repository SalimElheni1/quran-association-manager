import React from 'react';
import { Navigate } from 'react-router-dom';
import { Alert } from 'react-bootstrap';
import { usePermissions } from '@renderer/hooks/usePermissions';

function ProtectedRoute({ children, requiredPermissions = [], requiredModule = null }) {
  const { hasAnyPermission, canAccessModule } = usePermissions();

  // Check module access if specified
  if (requiredModule && !canAccessModule(requiredModule)) {
    return (
      <div className="container mt-4">
        <Alert variant="warning">
          <Alert.Heading>غير مصرح لك بالوصول</Alert.Heading>
          <p>ليس لديك الصلاحيات اللازمة للوصول إلى هذه الصفحة.</p>
        </Alert>
      </div>
    );
  }

  // Check specific permissions if specified
  if (requiredPermissions.length > 0 && !hasAnyPermission(requiredPermissions)) {
    return (
      <div className="container mt-4">
        <Alert variant="warning">
          <Alert.Heading>غير مصرح لك بالوصول</Alert.Heading>
          <p>ليس لديك الصلاحيات اللازمة للوصول إلى هذه الصفحة.</p>
        </Alert>
      </div>
    );
  }

  return children;
}

export default ProtectedRoute;