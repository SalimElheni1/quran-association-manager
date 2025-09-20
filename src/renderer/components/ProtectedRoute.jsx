/**
 * @fileoverview Protected route component for authentication-required pages.
 * Redirects unauthenticated users to the login page while preserving the intended destination.
 * 
 * @author Quran Branch Manager Team
 * @version 1.0.2-beta
 * @requires react - React library
 * @requires react-router-dom - Client-side routing
 * @requires @renderer/contexts/AuthContext - Authentication context
 */

import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@renderer/contexts/AuthContext';

/**
 * A wrapper component that protects routes requiring authentication.
 * 
 * This component checks the user's authentication status and either:
 * - Renders the protected content if the user is authenticated
 * - Redirects to the login page if the user is not authenticated
 * 
 * The `replace` prop ensures that the login redirect doesn't create
 * a new history entry, allowing proper back navigation after login.
 * 
 * @component
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - The protected content to render
 * @returns {React.ReactElement} Either the protected content or a redirect to login
 * 
 * @example
 * <ProtectedRoute>
 *   <DashboardPage />
 * </ProtectedRoute>
 */
function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth();

  // Redirect to login if not authenticated
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Render protected content if authenticated
  return children;
}

export default ProtectedRoute;
