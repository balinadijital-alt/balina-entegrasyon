import { Bell, ChevronDown, ChevronsLeft, KeyRound, PanelLeft, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { navigationGroups as defaultNavigationGroups } from '../navigation.js';

export function Sidebar({ navigationGroups = defaultNavigationGroups, panelLabel = 'Operasyon Paneli' }) {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const [openGroups, setOpenGroups] = useState(() => navigationGroups.reduce((acc, group, index) => ({ ...acc, [group.label]: index < 2 }), {}));

  const toggleGroup = (label) => setOpenGroups((current) => ({ ...current, [label]: !current[label] }));

  return (
    <aside className={collapsed ? 'sidebar collapsed' : 'sidebar'}>
      <div className="brand">
        <span className="brand-mark"><KeyRound size={21} /></span>
        <div>
          <strong>Balina</strong>
          <small>{panelLabel}</small>
        </div>
        <button type="button" className="collapse-button" onClick={() => setCollapsed((value) => !value)}><ChevronsLeft size={15} /></button>
      </div>
      <div className="workspace-card">
        <div>
          <span>Workspace</span>
          <strong>Balina Dijital</strong>
        </div>
        <button type="button" className="icon-button"><Bell size={14} /><small>3</small></button>
      </div>
      <button type="button" className="quick-action"><Plus size={16} /><span>Hizli Islem</span></button>
      <div className="sidebar-search">
        <Search size={15} />
        <span>Modul ara</span>
      </div>
      <div className="sidebar-status">
        <PanelLeft size={15} />
        <span>Operasyon Merkezi</span>
      </div>
      <nav className="sidebar-nav">
        {navigationGroups.map((group) => (
          <div className="nav-group" key={group.label}>
            <button type="button" className="nav-group-toggle" onClick={() => toggleGroup(group.label)}>
              <span>{group.label}</span>
              <ChevronDown size={14} className={openGroups[group.label] ? 'open' : ''} />
            </button>
            {openGroups[group.label] && group.items.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={`${group.label}-${to}-${label}`} to={to} end={end} className={({ isActive }) => {
                const current = isActive || (!end && location.pathname.startsWith(to));
                return current ? 'active' : undefined;
              }}>
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
