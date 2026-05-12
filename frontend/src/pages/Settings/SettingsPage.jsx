import { Link } from 'react-router-dom';
import { AlertTriangle, Building2, FileText, ShieldCheck, Store, Workflow } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader.jsx';

const adminCards = [
  { to: '/roles', title: 'Rol ve Yetkiler', text: 'Admin ve operator rollerini yonetin.', icon: ShieldCheck },
  { to: '/queue', title: 'Queue Durumu', text: 'Worker, failed job ve sync bildirimlerini izleyin.', icon: Workflow },
  { to: '/api-logs', title: 'API Loglari', text: 'Entegrasyon isteklerini ve hatalari inceleyin.', icon: FileText },
];

const customerCards = [
  { to: '/app/companies', title: 'Firma Bilgileri', text: 'Fatura ve kargo islemleri icin firma kaydinizi tamamlayin.', icon: Building2 },
  { to: '/app/marketplaces', title: 'Pazaryeri Hesaplari', text: 'Trendyol ve Hepsiburada baglantilarinizi yonetin.', icon: Store },
  { to: '/app/api-logs', title: 'Hata Merkezi', text: 'Pazaryeri aktarimlarinda aksiyon gerektiren hatalari kontrol edin.', icon: AlertTriangle },
];

export function SettingsPage({ audience = 'admin' }) {
  const cards = audience === 'customer' ? customerCards : adminCards;
  const description = audience === 'customer'
    ? 'Firma, pazaryeri ve hata takibi ayarlarinizi satisa baslamadan once tamamlayin.'
    : undefined;

  return (
    <>
      <PageHeader title="Ayarlar" description={description} />
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
