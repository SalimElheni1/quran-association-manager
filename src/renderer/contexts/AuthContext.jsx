import React, { createContext, useState, useContext, useEffect } from 'react';
import { jwtDecode } from 'jwt-decode';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  // Always start with no user and no token.
  // The only way to get authenticated is to go through the login flow.
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  // The loading state is now only to prevent a flash of unstyled content,
  // as we no longer wait for token re-hydration.
  const [loading, setLoading] = useState(false);

  // This effect will run whenever the token state changes.
  useEffect(() => {
    if (token) {
      try {
        const decoded = jwtDecode(token);
        if (decoded.exp * 1000 > Date.now()) {
          setUser({ id: decoded.id, username: decoded.username, role: decoded.role });
        } else {
          // This case should ideally not be reached if login flow is correct,
          // but as a safeguard, we clear the state.
          localStorage.removeItem('token');
          setToken(null);
          setUser(null);
        }
      } catch (error) {
        console.error('Failed to decode token:', error);
        localStorage.removeItem('token');
        setToken(null);
        setUser(null);
      }
    } else {
      // If token is null, ensure user is also null.
      setUser(null);
    }
  }, [token]);


  // Listen for a force-logout event from the main process (e.g., after DB import)
  useEffect(() => {
    const removeListener = window.electronAPI.onForceLogout(() => {
      console.log('Received force-logout signal from main process. Logging out.');
      logout();
    });

    // Cleanup the listener when the component unmounts
    return () => {
      removeListener();
    };
  }, []); // Empty dependency array ensures this runs only once on mount

  const login = async (username, password) => {
    const response = await window.electronAPI.login({ username, password });
    if (response.success) {
      // On successful login, persist the token and update the state.
      localStorage.setItem('token', response.token);
      setToken(response.token);
      // The useEffect above will handle setting the user from the new token.
    }
    return response;
  };

  const logout = () => {
    // 1. Clear the token from localStorage.
    localStorage.removeItem('token');
    // 2. Clear the token from state, which will trigger the useEffect to clear the user.
    setToken(null);
    // 3. Notify the main process to close the database connection.
    window.electronAPI.logout();
  };

  const value = { user, token, login, logout, isAuthenticated: !!user };

  return <AuthContext.Provider value={value}>{!loading && children}</AuthContext.Provider>;
}

export const useAuth = () => {
  return useContext(AuthContext);
};
