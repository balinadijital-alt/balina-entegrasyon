import { Bell, ChevronDown, ChevronsLeft, KeyRound, Menu, Plus, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { navigationGroups as defaultNavigationGroups } from '../navigation.js';
import { useApp } from '../context/AppContext.jsx';

const quickActionLabels = [
  'Urun Ekle',
  'Toplu Urun Yukleme',
  'Tum Siparisler',
  'Pazaryeri Eslestirmeleri',
  'Hata Merkezi',
  'Kargoya Hazir',
];

const groupLabelMap = {
  'Baslangic': 'Başlangıç',
  'Urun Yonetimi': 'Ürün',
  'Siparis Yonetimi': 'Sipariş',
  Entegrasyonlar: 'Pazaryeri',
  Operasyon: 'Operasyon',
  Genel: 'Kaynaklar',
  'Balina Yonetimi': 'Yönetim',
  'Sistem Operasyonu': 'Sistem',
};

function isRouteActive(pathname, item) {
  if (item.end) return pathname === item.to;
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

function groupIsActive(pathname, group) {
  return group.items.some((item) => isRouteActive(pathname, item));
}

export function Sidebar({ navigationGroups = defaultNavigationGroups, panelLabel = 'Operasyon Paneli' }) {
  const location = useLocation();
  const { user } = useApp();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [openGroups, setOpenGroups] = useState({});

  const visibleGroups = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('tr-TR');

    if (!query) return navigationGroups;

    return navigationGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => item.label.toLocaleLowerCase('tr-TR').includes(query)),
      }))
      .filter((group) => group.items.length > 0);
  }, [navigationGroups, search]);

  useEffect(() => {
    setOpenGroups((current) => {
      const next = { ...current };
      visibleGroups.forEach((group, index) => {
        if (next[group.label] === undefined) {
          next[group.label] = index < 2 || groupIsActive(location.pathname, group);
        }
        if (groupIsActive(location.pathname, group)) {
          next[group.label] = true;
        }
      });
      return next;
    });
  }, [location.pathname, visibleGroups]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 1024px)');
    const handleChange = (event) => {
      setIsMobile(event.matches);
      if (event.matches) {
        setCollapsed(false);
      } else {
        setDrawerOpen(false);
      }
    };

    handleChange(mediaQuery);
    mediaQuery.addEventListener('change', handleChange);

    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  const quickItems = useMemo(() => {
    const allItems = navigationGroups.flatMap((group) => group.items);
    return quickActionLabels
      .map((label) => allItems.find((item) => item.label === label || item.label.includes(label)))
      .filter(Boolean)
      .slice(0, 6);
  }, [navigationGroups]);

  const userName = user?.name || user?.username || user?.email || 'Kullanıcı';
  const companyName = user?.company?.name || user?.company_name || user?.tenant?.name || 'Aktif çalışma alanı';
  const toggleGroup = (label) => setOpenGroups((current) => ({ ...current, [label]: !current[label] }));
  const effectiveCollapsed = !isMobile && collapsed;

  return (
    <>
      <button
        type="button"
        className={`mobile-menu-button ${drawerOpen ? 'is-hidden' : ''}`}
        onClick={() => {
          setCollapsed(false);
          setDrawerOpen(true);
        }}
        aria-label="Menuyu ac"
      >
        <Menu size={20} />
      </button>
      {drawerOpen ? <button type="button" className="sidebar-backdrop" onClick={() => setDrawerOpen(false)} aria-label="Menuyu kapat" /> : null}
      <aside className={`sidebar balina-sidebar ${effectiveCollapsed ? 'compact' : ''} ${drawerOpen ? 'drawer-open' : ''}`}>
        <div className="balina-brand">
          <span className="balina-brand-mark"><KeyRound size={21} /></span>
          <div>
            <strong>Balina</strong>
            <small>{panelLabel}</small>
          </div>
          {isMobile ? (
            <button type="button" className="sidebar-close" onClick={() => setDrawerOpen(false)} aria-label="Menuyu kapat">
              <X size={16} />
            </button>
          ) : (
            <button type="button" className="sidebar-collapse" onClick={() => setCollapsed((value) => !value)} aria-label="Menuyu daralt">
              <ChevronsLeft size={16} />
            </button>
          )}
        </div>

        <div className="balina-workspace">
          <div>
            <span>Çalışma Alanı</span>
            <strong>{companyName}</strong>
          </div>
          <button type="button" className="notification-dot" aria-label="Bildirimler">
            <Bell size={15} />
          </button>
        </div>

        <div className="quick-action-wrap">
          <button type="button" className="quick-action balina-quick-action" onClick={() => setQuickOpen((value) => !value)}>
            <Plus size={17} />
            <span>Hizli Islem</span>
          </button>
          {quickOpen ? (
            <div className="quick-action-menu balina-quick-menu">
              {quickItems.map((item) => (
                <Link key={`quick-${item.to}-${item.label}`} to={item.to} onClick={() => setQuickOpen(false)}>
                  {item.label}
                </Link>
              ))}
            </div>
          ) : null}
        </div>

        <label className="balina-sidebar-search">
          <Search size={15} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Modul veya islem ara" />
        </label>

        <nav className="sidebar-nav balina-nav" aria-label="Panel modulleri">
          {visibleGroups.map((group) => {
            const active = groupIsActive(location.pathname, group);
            const open = openGroups[group.label];

            return (
              <div className={`balina-nav-group ${active ? 'active' : ''}`} key={group.label}>
                <button type="button" className="nav-group-toggle" aria-label={group.label} onClick={() => toggleGroup(group.label)}>
                  <span>{groupLabelMap[group.label] || group.label}</span>
                  <ChevronDown size={14} className={open ? 'open' : ''} />
                </button>
                {open ? (
                  <div className="balina-nav-items">
                    {group.items.map(({ to, label, icon: Icon, end }) => (
                      <NavLink
                        key={`${group.label}-${to}-${label}`}
                        to={to}
                        end={end}
                        title={label}
                        onClick={() => setDrawerOpen(false)}
                        className={({ isActive }) => (isActive || (!end && location.pathname.startsWith(to)) ? 'active' : undefined)}
                      >
                        <Icon size={18} />
                        <span>{label}</span>
                      </NavLink>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>

        <div className="balina-sidebar-footer">
          <span>{userName}</span>
          <small>Aktif oturum</small>
        </div>
      </aside>
    </>
  );
}
