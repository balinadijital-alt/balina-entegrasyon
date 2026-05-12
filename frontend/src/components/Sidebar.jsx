import { Bell, Bolt, ChevronsLeft, KeyRound, PanelLeft, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { navigationGroups } from '../navigation.js';

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside className={collapsed ? 'sidebar collapsed' : 'sidebar'}>
      <div className="brand">
        <span className="brand-mark"><KeyRound size={21} /></span>
        <div>
          <strong>Balina</strong>
          <small>Entegrasyon Paneli</small>
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
            <span className="nav-group-label">{group.label}</span>
            {group.items.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={to} to={to} end={end}>
                <Icon size={18} />
                <span>{label}</span>
                {label === 'Queue' && <Bolt size={13} className="nav-bolt" />}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}
