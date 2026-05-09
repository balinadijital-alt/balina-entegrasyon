import { Activity, Building2, ClipboardList, Package } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader.jsx';

const stats = [
  { label: 'Aktif Firma', value: '0', icon: Building2 },
  { label: 'Urun', value: '0', icon: Package },
  { label: 'Siparis', value: '0', icon: ClipboardList },
  { label: 'API Cagrisi', value: '0', icon: Activity },
];

export function DashboardPage() {
  return (
    <>
      <PageHeader title="Yonetim Paneli" />
      <div className="stats-grid">
        {stats.map(({ label, value, icon: Icon }) => (
          <div className="stat-card" key={label}>
            <Icon size={22} />
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <section className="panel">
        <h2>Entegrasyon Durumu</h2>
        <div className="status-list">
          <div><span className="dot success" /> Trendyol servis altyapisi hazir</div>
          <div><span className="dot success" /> Hepsiburada servis altyapisi hazir</div>
          <div><span className="dot warning" /> API anahtarlari firma bazinda girilmeli</div>
        </div>
      </section>
    </>
  );
}
