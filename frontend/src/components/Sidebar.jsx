import { KeyRound, PanelLeft } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { navigationGroups } from '../navigation.js';

export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="brand-mark"><KeyRound size={21} /></span>
        <div>
          <strong>Balina</strong>
          <small>Entegrasyon Paneli</small>
        </div>
      </div>
      <div className="sidebar-status">
        <PanelLeft size={15} />
        <span>Operasyon Merkezi</span>
      </div>
      <nav className="sidebar-nav">
        {navigationGroups.map((group) => (
          <div className="nav-group" key={group.label}>
            <span className="nav-group-label">{group.label}</span>
            {group.items.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end}>
                <Icon size={18} />
                <span>{label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}
