import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

const API_BASE = 'http://localhost:5000/api';

// Create an axios instance with auth header injection
export const api = axios.create({ baseURL: API_BASE });

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  // On mount, restore session from localStorage
  useEffect(() => {
    const storedToken = localStorage.getItem('accessToken');
    const storedUser = localStorage.getItem('user');
    if (storedToken && storedUser) {
      try {
        const parsedUser = JSON.parse(storedUser);
        setToken(storedToken);
        setUser(parsedUser);
        api.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;
      } catch {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
      }
    }
    setLoading(false);
  }, []);

  // Axios request interceptor — always attach latest token
  useEffect(() => {
    const reqInterceptor = api.interceptors.request.use((config) => {
      const t = localStorage.getItem('accessToken');
      if (t) config.headers['Authorization'] = `Bearer ${t}`;
      return config;
    });

    // Response interceptor — handle 401 by attempting refresh
    const resInterceptor = api.interceptors.response.use(
      (res) => res,
      async (error) => {
        const original = error.config;
        if (error.response?.status === 401 && !original._retry) {
          original._retry = true;
          try {
            const refreshToken = localStorage.getItem('refreshToken');
            if (!refreshToken) throw new Error('No refresh token');
            const { data } = await axios.post(`${API_BASE}/auth/refresh`, { refreshToken });
            localStorage.setItem('accessToken', data.accessToken);
            setToken(data.accessToken);
            if (data.user) {
              setUser(data.user);
              localStorage.setItem('user', JSON.stringify(data.user));
            }
            original.headers['Authorization'] = `Bearer ${data.accessToken}`;
            return api(original);
          } catch {
            // Refresh failed — log out
            _clearAuth();
            window.location.href = '/login';
            return Promise.reject(error);
          }
        }
        return Promise.reject(error);
      }
    );

    return () => {
      api.interceptors.request.eject(reqInterceptor);
      api.interceptors.response.eject(resInterceptor);
    };
  }, []);

  function _saveAuth(authData) {
    const { user: u, accessToken, refreshToken } = authData;
    setUser(u);
    setToken(accessToken);
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', refreshToken);
    localStorage.setItem('user', JSON.stringify(u));
    api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;
  }

  function _clearAuth() {
    setUser(null);
    setToken(null);
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    delete api.defaults.headers.common['Authorization'];
  }

  const register = useCallback(async (email, password, fullName, role = 'student') => {
    const { data } = await axios.post(`${API_BASE}/auth/register`, {
      email, password, fullName, role
    });
    _saveAuth(data);
    return data;
  }, []);

  const login = useCallback(async (email, password) => {
    const { data } = await axios.post(`${API_BASE}/auth/login`, { email, password });
    _saveAuth(data);
    return data;
  }, []);

  const logout = useCallback(async () => {
    try {
      const refreshToken = localStorage.getItem('refreshToken');
      if (refreshToken) {
        await axios.post(`${API_BASE}/auth/logout`, { refreshToken });
      }
    } catch {
      // ignore logout errors
    } finally {
      _clearAuth();
    }
  }, []);

  const updateUser = useCallback((updatedUser) => {
    setUser(updatedUser);
    localStorage.setItem('user', JSON.stringify(updatedUser));
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, register, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
