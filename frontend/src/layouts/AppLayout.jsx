import { Outlet } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar.jsx';
import { Topbar } from '../components/Topbar.jsx';

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

export function AppLayout({ navigationGroups, panelLabel, basePath = '' }) {
  return (
    <div className="shell">
      <Sidebar navigationGroups={withBasePath(navigationGroups, basePath)} panelLabel={panelLabel} />
      <div className="main-shell">
        <Topbar />
        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
