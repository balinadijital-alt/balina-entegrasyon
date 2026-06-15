import { Bell, CircleHelp, ExternalLink, LogOut, Search } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { primaryRoleLabel } from '../auth/permissions.js';
import { useApp } from '../context/AppContext.jsx';
import { Breadcrumbs } from './Breadcrumbs.jsx';

export function Topbar() {
  const navigate = useNavigate();
  const { logout: logoutUser, user } = useApp();
  const userName = user?.name || user?.username || user?.email || 'Kullanıcı';
  const companyName = user?.company?.name || user?.company_name || user?.tenant?.name || 'Aktif firma';

  const logout = async () => {
    await logoutUser();
    navigate('/login');
  };

  return (
    <header className="topbar balina-topbar">
      <div className="topbar-left">
        <Breadcrumbs />
        <label className="global-search">
          <Search size={16} />
          <input placeholder="Urun, siparis, firma veya API hatasi ara" />
        </label>
      </div>
      <div className="topbar-user">
        <div className="company-switcher static-company"><span>{companyName}</span></div>
        <Link className="topbar-link" to="/help-center"><CircleHelp size={16} /> Yardim</Link>
        <Link className="topbar-link" to="/"><ExternalLink size={16} /> Magazayi Ac</Link>
        <button type="button" className="icon-button topbar-notification" aria-label="Bildirimler">
          <Bell size={16} />
        </button>
        <div className="topbar-profile">
          <span className="role-badge">{primaryRoleLabel(user)}</span>
          <strong>{userName}</strong>
        </div>
        <button className="ghost-button topbar-logout" onClick={logout}>
          <LogOut size={16} />
          Cikis
        </button>
      </div>
    </header>
  );
}
