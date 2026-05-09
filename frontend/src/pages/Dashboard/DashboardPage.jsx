import { useEffect, useState } from 'react';
import { Activity, Building2, ClipboardList, Package } from 'lucide-react';
import { api } from '../../api/client.js';
import { ErrorState } from '../../components/ErrorState.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { useAsync } from '../../hooks/useAsync.js';

export function DashboardPage() {
  const { loading, error, run } = useAsync();
  const [stats, setStats] = useState([
    { label: 'Aktif Firma', value: '0', icon: Building2 },
    { label: 'Urun', value: '0', icon: Package },
    { label: 'Siparis', value: '0', icon: ClipboardList },
    { label: 'API Cagrisi', value: '0', icon: Activity },
  ]);

  const load = async () => {
    await run(async () => {
      const [companies, products, orders, logs] = await Promise.all([
        api.companies.list(),
        api.products.list(),
        api.orders.list(),
        api.logs.list(),
      ]);

      setStats([
        { label: 'Aktif Firma', value: String(companies.total ?? companies.data?.length ?? 0), icon: Building2 },
        { label: 'Urun', value: String(products.total ?? products.data?.length ?? 0), icon: Package },
        { label: 'Siparis', value: String(orders.total ?? orders.data?.length ?? 0), icon: ClipboardList },
        { label: 'API Cagrisi', value: String(logs.total ?? logs.data?.length ?? 0), icon: Activity },
      ]);
    });
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <>
      <PageHeader title="Yonetim Paneli" />
      {error && <ErrorState message={error} onRetry={load} />}
      {loading ? <LoadingState /> : null}
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
