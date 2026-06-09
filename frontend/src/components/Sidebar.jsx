import { Bell, ChevronDown, ChevronsLeft, KeyRound, PanelLeft, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { navigationGroups as defaultNavigationGroups } from '../navigation.js';

export function Sidebar({ navigationGroups = defaultNavigationGroups, panelLabel = 'Operasyon Paneli' }) {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const [quickOpen, setQuickOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [openGroups, setOpenGroups] = useState(() => navigationGroups.reduce((acc, group, index) => ({ ...acc, [group.label]: index < 2 }), {}));

  const toggleGroup = (label) => setOpenGroups((current) => ({ ...current, [label]: !current[label] }));
  const normalizedSearch = search.trim().toLocaleLowerCase('tr-TR');
  const visibleGroups = normalizedSearch
    ? navigationGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => item.label.toLocaleLowerCase('tr-TR').includes(normalizedSearch)),
      }))
      .filter((group) => group.items.length > 0)
    : navigationGroups;
  const quickItems = navigationGroups
    .flatMap((group) => group.items)
    .filter((item) => /ekle|kurulum|paket|lisans|rapor/i.test(item.label))
    .slice(0, 6);

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
      <div className="quick-action-wrap">
        <button type="button" className="quick-action" onClick={() => setQuickOpen((value) => !value)}><Plus size={16} /><span>Hizli Islem</span></button>
        {quickOpen && (
          <div className="quick-action-menu">
            {quickItems.map((item) => (
              <Link key={`quick-${item.to}-${item.label}`} to={item.to} onClick={() => setQuickOpen(false)}>{item.label}</Link>
            ))}
          </div>
        )}
      </div>
      <div className="sidebar-search">
        <Search size={15} />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Modul ara" />
      </div>
      <div className="sidebar-status">
        <PanelLeft size={15} />
        <span>Operasyon Merkezi</span>
      </div>
      <nav className="sidebar-nav">
        {visibleGroups.map((group) => (
          <div className="nav-group" key={group.label}>
            <button type="button" className="nav-group-toggle" onClick={() => toggleGroup(group.label)}>
              <span>{group.label}</span>
              <ChevronDown size={14} className={openGroups[group.label] ? 'open' : ''} />
            </button>
            {(normalizedSearch || openGroups[group.label]) && group.items.map(({ to, label, icon: Icon, end }) => (
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
