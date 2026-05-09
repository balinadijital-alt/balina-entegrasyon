import { createContext, useContext, useMemo, useState } from 'react';
import { api, apiErrorMessage } from '../api/client.js';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [toasts, setToasts] = useState([]);

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
    notify('success', 'Giris basarili.');
    return response;
  };

  const register = async (payload) => {
    const response = await api.auth.register(payload);
    localStorage.setItem('token', response.token);
    setUser(response.user);
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
    }
  };

  const value = useMemo(() => ({
    user,
    setUser,
    toasts,
    notify,
    login,
    register,
    logout,
  }), [user, toasts]);

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);

  if (!context) {
    throw new Error('useApp must be used inside AppProvider');
  }

  return context;
}
