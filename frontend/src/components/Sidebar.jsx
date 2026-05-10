import { KeyRound } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { navigationGroups } from '../navigation.js';

export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand">
        <KeyRound size={22} />
        <span>Balina Entegrasyon</span>
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
