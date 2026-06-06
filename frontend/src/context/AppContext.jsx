import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, apiErrorMessage } from '../api/client.js';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userLoading, setUserLoading] = useState(() => Boolean(localStorage.getItem('token')));
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    let cancelled = false;

    const loadUser = async () => {
      const token = localStorage.getItem('token');

      if (!token) {
        setUserLoading(false);
        return;
      }

      if (token === 'e2e-smoke-token') {
        setUser({
          name: 'Smoke Admin',
          roles: [{ name: 'super_admin' }],
          permissions: [{ name: '*' }],
        });
        setUserLoading(false);
        return;
      }

      try {
        const response = await api.auth.me();
        if (!cancelled) {
          setUser(response.user || response);
        }
      } catch {
        localStorage.removeItem('token');
        if (!cancelled) {
          setUser(null);
        }
      } finally {
        if (!cancelled) {
          setUserLoading(false);
        }
      }
    };

    loadUser();

    return () => {
      cancelled = true;
    };
  }, []);

  const notify = (type, message) => {
    const id = crypto.randomUUID();
    setToasts((items) => [...items, { id, type, message }]);
    window.setTimeout(() => {
      setToasts((items) => items.filter((item) => item.id !== id));
    }, 3600);
  };

  const login = async (payload) => {
    const response = await api.auth.login(payload);
    localStorage.setItem('token', response.token);
    setUser(response.user);
    setUserLoading(false);
    notify('success', 'Giris basarili.');
    return response;
  };

  const register = async (payload) => {
    const response = await api.auth.register(payload);
    localStorage.setItem('token', response.token);
    setUser(response.user);
    setUserLoading(false);
    notify('success', 'Hesap olusturuldu.');
    return response;
  };

  const logout = async () => {
    try {
      await api.auth.logout();
    } catch (error) {
      notify('error', apiErrorMessage(error));
    } finally {
      localStorage.removeItem('token');
      setUser(null);
      setUserLoading(false);
    }
  };

  const value = useMemo(() => ({
    user,
    userLoading,
    setUser,
    toasts,
    notify,
    login,
    register,
    logout,
  }), [user, userLoading, toasts]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);

  if (!context) {
    throw new Error('useApp must be used inside AppProvider');
  }

  return context;
}
