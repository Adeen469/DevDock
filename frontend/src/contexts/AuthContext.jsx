import React, { createContext, useState, useContext, useEffect } from 'react';
import apiClient from '../apiClient';

const AuthContext = createContext(null);
const USER_CACHE_KEY = 'auth_user';
const BACKEND_HEALTH_POLL_MS = 10000;

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return undefined;

    const healthTimer = setInterval(async () => {
      try {
        await apiClient.get('/health');
      } catch {
        // Keep session active during transient backend/network failures.
      }
    }, BACKEND_HEALTH_POLL_MS);

    return () => clearInterval(healthTimer);
  }, [isAuthenticated]);

  const checkAuth = async () => {
    const token = localStorage.getItem('token');
    const cachedUser = localStorage.getItem(USER_CACHE_KEY);

    if (token) {
      try {
        const response = await apiClient.get('/auth/me');
        if (response.data.success) {
          setUser(response.data.data);
          setIsAuthenticated(true);
          localStorage.setItem(USER_CACHE_KEY, JSON.stringify(response.data.data));
        } else {
          localStorage.removeItem('token');
          localStorage.removeItem(USER_CACHE_KEY);
          setUser(null);
          setIsAuthenticated(false);
        }
      } catch (error) {
        // Logout only on confirmed auth failure. Keep session for transient restarts/outages.
        if (error.response?.status === 401 || error.response?.status === 403) {
          localStorage.removeItem('token');
          localStorage.removeItem(USER_CACHE_KEY);
          setUser(null);
          setIsAuthenticated(false);
        } else {
          setIsAuthenticated(true);
          if (cachedUser) {
            try {
              setUser(JSON.parse(cachedUser));
            } catch {
              setUser(null);
            }
          }
        }
      }
    }
    setLoading(false);
  };

  const login = async (email, password) => {
    try {
      const response = await apiClient.post('/auth/login', {
        email,
        password
      });
      
      if (response.data.success) {
        const { user, token } = response.data.data;
        localStorage.setItem('token', token);
        localStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
        setUser(user);
        setIsAuthenticated(true);
        return { success: true };
      }
    } catch (error) {
      return { 
        success: false, 
        message: error.response?.data?.message || 'Login failed' 
      };
    }
  };

  const register = async (name, email, password) => {
    try {
      const response = await apiClient.post('/auth/register', {
        name,
        email,
        password
      });
      
      if (response.data.success) {
        const { user, token } = response.data.data;
        localStorage.setItem('token', token);
        localStorage.setItem(USER_CACHE_KEY, JSON.stringify(user));
        setUser(user);
        setIsAuthenticated(true);
        return { success: true };
      }
    } catch (error) {
      return { 
        success: false, 
        message: error.response?.data?.message || 'Registration failed' 
      };
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem(USER_CACHE_KEY);
    setUser(null);
    setIsAuthenticated(false);
  };

  const updateUser = (updatedUser) => {
    setUser(updatedUser);
    localStorage.setItem(USER_CACHE_KEY, JSON.stringify(updatedUser));
  };

  const value = {
    user,
    loading,
    isAuthenticated,
    login,
    register,
    logout,
    updateUser,
    checkAuth
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
