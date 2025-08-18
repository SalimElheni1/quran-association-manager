import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

function ProtectedRoute({ children, allowedRoles }) {
  const { user, isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // If allowedRoles are specified, check if the user's role is included.
  if (allowedRoles && !allowedRoles.includes(user?.role)) {
    // For now, redirect to the dashboard if not authorized.
    // In the future, a dedicated "Not Authorized" page could be created.
    return <Navigate to="/" replace />;
  }

  return children;
}

export default ProtectedRoute;
