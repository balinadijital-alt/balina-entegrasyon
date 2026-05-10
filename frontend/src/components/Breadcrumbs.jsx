import { Link, useLocation } from 'react-router-dom';
import { flatNavigation } from '../navigation.js';

const labelMap = flatNavigation.reduce((carry, item) => ({ ...carry, [item.to]: item.label }), {
  '/': 'Panel',
});

export function Breadcrumbs() {
  const location = useLocation();
  const segments = location.pathname.split('/').filter(Boolean);
  const crumbs = [{ to: '/', label: 'Panel' }];

  segments.forEach((_, index) => {
    const to = `/${segments.slice(0, index + 1).join('/')}`;
    crumbs.push({ to, label: labelMap[to] || segments[index] });
  });

  return (
    <div className="breadcrumbs">
      {crumbs.map((crumb, index) => (
        <span key={crumb.to}>
          {index < crumbs.length - 1 ? <Link to={crumb.to}>{crumb.label}</Link> : crumb.label}
        </span>
      ))}
    </div>
  );
}
