import React, { createContext, useState, useContext, useEffect } from 'react';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(false);

  // Listen for a force-logout event from the main process (e.g., after DB import)
  // This is a safety net to ensure the frontend and backend are in sync.
  useEffect(() => {
    const removeListener = window.electronAPI.onForceLogout(() => {
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

  const login = async (username, password) => {
    const response = await window.electronAPI.login({ username, password });
    if (response.success) {
      // On successful login, persist the token and update state in one atomic step.
      localStorage.setItem('token', response.token);
      setToken(response.token);
      setUser(response.user);
    }
    return response;
  };

  const logout = () => {
    // 1. Clear the token from localStorage.
    localStorage.removeItem('token');
    // 2. Clear the token and user from state.
    setToken(null);
    setUser(null);
    // 3. Notify the main process to close the database connection.
    window.electronAPI.logout();
  };

  const value = { user, token, login, logout, isAuthenticated: !!user };

  return <AuthContext.Provider value={value}>{!loading && children}</AuthContext.Provider>;
}

export const useAuth = () => {
  return useContext(AuthContext);
};
