import { Link } from 'react-router-dom';
import { FileText, ShieldCheck, Workflow } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader.jsx';

const cards = [
  { to: '/roles', title: 'Rol ve Yetkiler', text: 'Admin ve operator rollerini yonetin.', icon: ShieldCheck },
  { to: '/queue', title: 'Queue Durumu', text: 'Worker, failed job ve sync bildirimlerini izleyin.', icon: Workflow },
  { to: '/api-logs', title: 'API Loglari', text: 'Entegrasyon isteklerini ve hatalari inceleyin.', icon: FileText },
];

export function SettingsPage() {
  return (
    <>
      <PageHeader title="Ayarlar" />
      <div className="settings-grid">
        {cards.map(({ to, title, text, icon: Icon }) => (
          <Link className="settings-card" to={to} key={to}>
            <Icon size={22} />
            <strong>{title}</strong>
            <span>{text}</span>
          </Link>
        ))}
      </div>
    </>
  );
}
