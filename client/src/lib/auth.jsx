import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = cargando

  useEffect(() => {
    api
      .get('/auth/me')
      .then((d) => setUser(d.user))
      .catch(() => setUser(null));
    const onUnauthorized = () => setUser(null);
    window.addEventListener('kurapet:unauthorized', onUnauthorized);
    return () => window.removeEventListener('kurapet:unauthorized', onUnauthorized);
  }, []);

  const login = useCallback(async (email, password) => {
    const d = await api.post('/auth/login', { email, password });
    setUser(d.user);
  }, []);

  const register = useCallback(async (form) => {
    const d = await api.post('/auth/register', form);
    setUser({ ...d.user, isNew: true });
  }, []);

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => {});
    setUser(null);
  }, []);

  const deleteAccount = useCallback(async () => {
    await api.del('/auth/me');
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, login, register, logout, deleteAccount }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
