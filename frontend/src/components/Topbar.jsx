import { LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext.jsx';
import { Breadcrumbs } from './Breadcrumbs.jsx';

export function Topbar() {
  const navigate = useNavigate();
  const { logout: logoutUser } = useApp();

  const logout = async () => {
    await logoutUser();
    navigate('/login');
  };

  return (
    <header className="topbar">
      <Breadcrumbs />
      <button className="ghost-button topbar-logout" onClick={logout}>
        <LogOut size={16} />
        Cikis
      </button>
    </header>
  );
}
