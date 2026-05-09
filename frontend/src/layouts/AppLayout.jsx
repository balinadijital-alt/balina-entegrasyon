import { Building2, ClipboardList, FileText, Gauge, KeyRound, Link2, Package, ShieldCheck } from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';

const links = [
  { to: '/', label: 'Panel', icon: Gauge },
  { to: '/companies', label: 'Firmalar', icon: Building2 },
  { to: '/products', label: 'Urunler', icon: Package },
  { to: '/marketplaces', label: 'Entegrasyonlar', icon: Link2 },
  { to: '/orders', label: 'Siparisler', icon: ClipboardList },
  { to: '/api-logs', label: 'API Loglari', icon: FileText },
  { to: '/roles', label: 'Roller', icon: ShieldCheck },
];

export function AppLayout() {
  const navigate = useNavigate();

  const logout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <KeyRound size={22} />
          <span>Balina Entegrasyon</span>
        </div>
        <nav>
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'}>
              <Icon size={18} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <button className="ghost-button" onClick={logout}>
          Cikis Yap
        </button>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
