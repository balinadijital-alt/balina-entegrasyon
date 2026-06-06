import { ShieldAlert } from 'lucide-react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar.jsx';
import { Topbar } from '../components/Topbar.jsx';
import { defaultRouteForUser } from '../auth/permissions.js';
import { useApp } from '../context/AppContext.jsx';
import { filterNavigationByPermissions } from '../navigation.js';

function withBasePath(navigationGroups, basePath) {
  if (!basePath) return navigationGroups;

  return navigationGroups.map((group) => ({
    ...group,
    items: group.items.map((item) => ({
      ...item,
      to: item.to === '/' ? basePath : `${basePath}${item.to}`,
    })),
  }));
}

function matchesItem(pathname, item) {
  if (item.end) return pathname === item.to;
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

function isBlockedNavigationRoute(pathname, allGroups, permittedGroups) {
  const allItems = allGroups.flatMap((group) => group.items);
  const permittedItems = permittedGroups.flatMap((group) => group.items);
  const knownRoute = allItems.some((item) => matchesItem(pathname, item));

  if (!knownRoute) return false;
  return !permittedItems.some((item) => matchesItem(pathname, item));
}

function UnauthorizedState({ to }) {
  return (
    <section className="unauthorized-state">
      <ShieldAlert size={36} />
      <h1>Bu alana erisim yetkiniz yok</h1>
      <p>Bu islem icin gerekli rol veya izin hesabinizda tanimli degil. Yetki gerekiyorsa firma yoneticinizle iletisime gecin.</p>
      <Link className="button-link" to={to}>Dashboard'a don</Link>
    </section>
  );
}

export function AppLayout({ navigationGroups, panelLabel, basePath = '' }) {
  const location = useLocation();
  const { user, userLoading } = useApp();
  const permittedNavigationGroups = filterNavigationByPermissions(navigationGroups, user);
  const navigationWithBasePath = withBasePath(navigationGroups, basePath);
  const permittedNavigationWithBasePath = withBasePath(permittedNavigationGroups, basePath);
  const blockedRoute = !userLoading && isBlockedNavigationRoute(location.pathname, navigationWithBasePath, permittedNavigationWithBasePath);

  return (
    <div className="shell">
      <Sidebar navigationGroups={userLoading ? [] : permittedNavigationWithBasePath} panelLabel={panelLabel} />
      <div className="main-shell">
        <Topbar />
        <main className="content">
          {userLoading ? (
            <section className="route-loading-shell">Yetkiler yukleniyor...</section>
          ) : blockedRoute ? (
            <UnauthorizedState to={defaultRouteForUser(user, basePath)} />
          ) : (
            <Outlet />
          )}
        </main>
      </div>
    </div>
  );
}
