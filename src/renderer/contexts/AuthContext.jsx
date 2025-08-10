import React, { createContext, useState, useContext, useEffect } from "react";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem("token"));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Here you would typically verify the token with the backend
    // For our local app, we'll just decode it to get user info
    if (token) {
      // In a real app, you'd call an IPC handler to verify the token
      // For now, we'll assume the token is valid if it exists
      // This is a simplification for our desktop app context.
      // A more robust solution would involve JWT decoding and verification.
      setUser({ token }); // Simplified user object
    }
    setLoading(false);
  }, [token]);

  const login = async (username, password) => {
    const response = await window.electronAPI.login({ username, password });
    if (response.success) {
      localStorage.setItem("token", response.token);
      setToken(response.token);
      setUser(response.user);
    }
    return response;
  };

  const logout = () => {
    localStorage.removeItem("token");
    setToken(null);
    setUser(null);
  };

  const value = { user, token, login, logout, isAuthenticated: !!token };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  return useContext(AuthContext);
};
