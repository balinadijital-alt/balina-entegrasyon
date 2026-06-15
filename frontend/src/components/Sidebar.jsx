import { Bell, ChevronDown, Eye, HelpCircle, KeyRound, Plus, Search } from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { navigationGroups as defaultNavigationGroups } from '../navigation.js';

export function Sidebar({ navigationGroups = defaultNavigationGroups, panelLabel = 'Operasyon Paneli' }) {
  const location = useLocation();
  const [quickOpen, setQuickOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState('');
  const [search, setSearch] = useState('');
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
  const railItems = navigationGroups.map((group) => group.items[0]).filter(Boolean).slice(0, 7);
  const primaryLabels = ['Siparis Yonetimi', 'Urun Yonetimi', 'Entegrasyonlar', 'Operasyon', 'Genel'];
  const menuLabels = {
    'Siparis Yonetimi': 'Siparisler',
    'Urun Yonetimi': 'Urunler',
    Entegrasyonlar: 'Entegrasyonlar',
    Operasyon: 'Operasyon',
    Genel: 'Ayarlar',
    Diger: 'Diger',
  };
  const primaryGroups = visibleGroups.filter((group) => primaryLabels.includes(group.label));
  const secondaryGroups = visibleGroups.filter((group) => !primaryLabels.includes(group.label));
  const topGroups = secondaryGroups.length
    ? [...primaryGroups, { label: 'Diger', items: secondaryGroups.flatMap((group) => group.items.slice(0, 4)) }]
    : primaryGroups;

  const isGroupActive = (group) => group.items.some(({ to, end }) => {
    if (end) return location.pathname === to;
    return location.pathname === to || location.pathname.startsWith(`${to}/`);
  });

  const currentGroup = activeMenu ? topGroups.find((group) => group.label === activeMenu) : null;

  return (
    <>
      <aside className="sidebar reference-sidebar">
        <div className="reference-currency-pill">Doviz Kurlari</div>
        <div className="brand">
          <span className="brand-mark"><KeyRound size={21} /></span>
          <div>
            <strong>Balina</strong>
            <small>{panelLabel}</small>
          </div>
        </div>
        <nav className="reference-top-nav" aria-label="Ana modul menusu">
          {topGroups.map((group) => (
            <div className="reference-top-group" key={group.label} onMouseEnter={() => setActiveMenu(group.label)}>
              <button
                type="button"
                className={isGroupActive(group) || activeMenu === group.label ? 'active' : undefined}
                aria-label={group.label}
                onClick={() => setActiveMenu(group.label)}
              >
                {menuLabels[group.label] || group.label}
                <ChevronDown size={13} />
              </button>
            </div>
          ))}
          {currentGroup ? (
            <div className="reference-mega-menu" onMouseEnter={() => setActiveMenu(currentGroup.label)}>
              <div>
                <strong>{currentGroup.label}</strong>
                {currentGroup.items.slice(0, 8).map(({ to, label }) => (
                  <Link key={`${currentGroup.label}-${to}-${label}`} to={to}>{label}</Link>
                ))}
              </div>
              <div>
                <strong>Diger</strong>
                {currentGroup.items.slice(8, 16).map(({ to, label }) => (
                  <Link key={`${currentGroup.label}-more-${to}-${label}`} to={to}>{label}</Link>
                ))}
                {currentGroup.items.length <= 8 ? <span>Bu modulde tum islemler sol listede.</span> : null}
              </div>
            </div>
          ) : null}
        </nav>
        <div className="reference-top-actions">
          <div className="sidebar-search">
            <Search size={15} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Hizli Arama" />
          </div>
          <button type="button" className="reference-cache-button">JETCache</button>
          <Link className="reference-view-link" to="/"><Eye size={15} /> Siteyi Goruntule</Link>
          <Link className="reference-help-link" to="/help-center"><HelpCircle size={15} /> Yardim</Link>
          <div className="workspace-card">
            <div>
              <span>Hosgeldiniz,</span>
              <strong>ayaz</strong>
            </div>
            <button type="button" className="icon-button"><Bell size={14} /><small>3</small></button>
          </div>
        </div>
      </aside>
      <aside className="reference-rail" aria-label="Hizli modul ikonlari">
        <button type="button" className="quick-action" onClick={() => setQuickOpen((value) => !value)} aria-label="Hizli Islem"><Plus size={18} /></button>
        {quickOpen ? (
          <div className="quick-action-menu rail-menu">
            {quickItems.map((item) => <Link key={`quick-${item.to}-${item.label}`} to={item.to} onClick={() => setQuickOpen(false)}>{item.label}</Link>)}
          </div>
        ) : null}
        <nav className="sidebar-nav">
          {railItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={`rail-${to}-${label}`} to={to} end={end} title={label} className={({ isActive }) => {
              const current = isActive || (!end && location.pathname.startsWith(to));
              return current ? 'active' : undefined;
            }}>
              <Icon size={19} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  );
}
