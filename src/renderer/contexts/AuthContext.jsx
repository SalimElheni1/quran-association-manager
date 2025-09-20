/**
 * @fileoverview Authentication context provider for Quran Branch Manager.
 * Manages user authentication state, login/logout operations, and force logout handling.
 * 
 * This context provides centralized authentication state management across the application,
 * including token persistence, user session management, and secure logout procedures.
 * 
 * @author Quran Branch Manager Team
 * @version 1.0.2-beta
 * @requires react - React library for context and state management
 * @requires ../utils/logger - Application logging utilities
 */

import React, { createContext, useState, useContext, useEffect } from 'react';
import { log } from '../utils/logger';

/**
 * Authentication context for managing user authentication state.
 * Provides authentication status, user information, and auth operations.
 * 
 * @type {React.Context<Object|null>}
 */
const AuthContext = createContext(null);

/**
 * Authentication provider component that manages authentication state and operations.
 * 
 * Features:
 * - User session management with JWT tokens
 * - Persistent token storage in localStorage
 * - Force logout handling from main process
 * - Secure login/logout operations
 * - Authentication state synchronization
 * 
 * @component
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components to wrap with auth context
 * @returns {JSX.Element} AuthContext provider with authentication state
 */
export function AuthProvider({ children }) {
  /** @type {[Object|null, Function]} Current authenticated user object */
  const [user, setUser] = useState(null);
  
  /** @type {[string|null, Function]} JWT authentication token */
  const [token, setToken] = useState(null);
  
  /** @type {[boolean, Function]} Loading state for async operations */
  const [loading, setLoading] = useState(false);

  // Listen for a force-logout event from the main process (e.g., after DB import)
  // This is a safety net to ensure the frontend and backend are in sync.
  useEffect(() => {
    const removeListener = window.electronAPI.onForceLogout(() => {
      log('Received force-logout signal from main process. Logging out.');
      // Directly call the logout logic here to avoid any state dependencies
      localStorage.removeItem('token');
      setToken(null);
      setUser(null);
      window.electronAPI.logout(); // Notify main process
    });

    // Cleanup the listener when the component unmounts
    return () => {
      removeListener();
    };
  }, []); // Empty dependency array ensures this runs only once on mount

  /**
   * Authenticates a user with username and password.
   * On successful authentication, persists the token and updates the auth state.
   * 
   * @param {string} username - The username to authenticate
   * @param {string} password - The password to authenticate
   * @returns {Promise<Object>} Authentication response with success status and user data
   * @throws {Error} If authentication fails or network error occurs
   */
  const login = async (username, password) => {
    const response = await window.electronAPI.login({ username, password });
    if (response.success) {
      // On successful login, persist the token and update state in one atomic step
      localStorage.setItem('token', response.token);
      setToken(response.token);
      setUser(response.user);
    }
    return response;
  };

  /**
   * Logs out the current user and cleans up authentication state.
   * Performs a complete logout including:
   * - Clearing localStorage token
   * - Resetting authentication state
   * - Notifying main process to close database connections
   * 
   * @returns {void}
   */
  const logout = () => {
    // 1. Clear the token from localStorage
    localStorage.removeItem('token');
    // 2. Clear the token and user from state
    setToken(null);
    setUser(null);
    // 3. Notify the main process to close the database connection
    window.electronAPI.logout();
  };

  const value = { user, token, login, logout, isAuthenticated: !!user };

  return <AuthContext.Provider value={value}>{!loading && children}</AuthContext.Provider>;
}

/**
 * Custom hook to access the authentication context.
 * Provides access to authentication state and operations throughout the application.
 * 
 * @returns {Object} Authentication context value
 * @returns {Object|null} returns.user - Current authenticated user object
 * @returns {string|null} returns.token - JWT authentication token
 * @returns {Function} returns.login - Login function
 * @returns {Function} returns.logout - Logout function
 * @returns {boolean} returns.isAuthenticated - Authentication status
 * 
 * @throws {Error} If used outside of AuthProvider
 * 
 * @example
 * const { user, isAuthenticated, login, logout } = useAuth();
 * 
 * if (isAuthenticated) {
 *   console.log('Current user:', user.username);
 * }
 */
export const useAuth = () => {
  const context = useContext(AuthContext);
  
  if (context === null) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  
  return context;
};
