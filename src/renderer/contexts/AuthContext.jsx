import React, { createContext, useState, useContext, useEffect } from 'react';
import { jwtDecode } from 'jwt-decode';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // On app startup, we check for a token in localStorage.
    // If it exists, we decode it to get the user's info and check for expiration.
    // This re-hydrates the user session without needing a new login.
    if (token) {
      try {
        const decoded = jwtDecode(token);
        // Check if the token is expired
        if (decoded.exp * 1000 > Date.now()) {
          setUser({ id: decoded.id, username: decoded.username, role: decoded.role });
        } else {
          // Token is expired, clear it
          localStorage.removeItem('token');
          setToken(null);
        }
      } catch (error) {
        console.error('Failed to decode token:', error);
        // Invalid token, clear it
        localStorage.removeItem('token');
        setToken(null);
      }
    }
    setLoading(false);
  }, [token]);

  const login = async (username, password) => {
    const response = await window.electronAPI.login({ username, password });
    if (response.success) {
      localStorage.setItem('token', response.token);
      setToken(response.token);
      setUser(response.user);
    }
    return response;
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  const value = { user, login, logout, isAuthenticated: !!user };

  return <AuthContext.Provider value={value}>{!loading && children}</AuthContext.Provider>;
}

export const useAuth = () => {
  return useContext(AuthContext);
};
