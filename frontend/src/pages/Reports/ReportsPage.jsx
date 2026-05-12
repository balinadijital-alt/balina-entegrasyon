import { useEffect, useMemo, useState } from 'react';
import { RefreshCcw } from 'lucide-react';
import { api } from '../../api/client.js';
import { ErrorState } from '../../components/ErrorState.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { DashboardPage } from '../Dashboard/DashboardPage.jsx';

const labels = {
  new: 'Yeni',
  pending: 'Bekliyor',
  processing: 'Hazirlaniyor',
  preparing: 'Hazirlaniyor',
  ready_to_ship: 'Kargoya hazir',
  shipped: 'Kargoda',
  delivered: 'Teslim edildi',
  cancelled: 'Iptal',
  active: 'Aktif',
  draft: 'Taslak',
  passive: 'Pasif',
  queued: 'Bekliyor',
  created: 'Olustu',
  in_transit: 'Yolda',
  failed: 'Hatali',
  completed: 'Tamamlandi',
};

function maxValue(series = []) {
  return Math.max(1, ...series.map((item) => Number(item.value || 0)));
}

function TrendBars({ series, tone = 'primary' }) {
  const max = maxValue(series);

  return (
    <div className="trend-bars">
      {series.map((item) => (
        <div className="trend-item" key={item.label}>
          <span style={{ height: `${Math.max(8, (Number(item.value || 0) / max) * 100)}%` }} className={tone} />
          <small>{item.label}</small>
        </div>
      ))}
    </div>
  );
}

function Breakdown({ title, items }) {
  const total = Math.max(1, items.reduce((sum, item) => sum + Number(item.value || 0), 0));

  return (
    <section className="panel compact-panel">
      <h2>{title}</h2>
      {items.length === 0 ? (
        <div className="soft-empty">Bu alanda henuz veri yok. Islemler basladikca raporlar burada dolacak.</div>
      ) : items.map((item) => (
        <div className="breakdown-row" key={item.label}>
          <div>
            <strong>{labels[item.label] || item.label}</strong>
            <span>{item.value} kayit</span>
          </div>
          <div className="progress inline-progress">
            <span style={{ width: `${(Number(item.value || 0) / total) * 100}%` }} />
          </div>
        </div>
      ))}
    </section>
  );
}

export function ReportsPage() {
  return <DashboardPage title="Raporlar" />;
}

export function CustomerReportsPage() {
  const { loading, error, run } = useAsync();
  const [report, setReport] = useState(null);

  const load = async () => {
    await run(async () => {
      setReport(await api.dashboard.report());
    });
  };

  useEffect(() => {
    load();
  }, []);

  const totals = useMemo(() => {
    if (!report) return { orders: 0, products: 0, shipments: 0 };

    return {
      orders: report.breakdowns.orders.reduce((sum, item) => sum + Number(item.value || 0), 0),
      products: report.breakdowns.products.reduce((sum, item) => sum + Number(item.value || 0), 0),
      shipments: report.breakdowns.shipping.reduce((sum, item) => sum + Number(item.value || 0), 0),
    };
  }, [report]);

  return (
    <>
      <PageHeader
        title="Raporlar"
        description="Satis, siparis, kargo ve urun durumlarinizi sade grafiklerle takip edin."
        actions={<button type="button" onClick={load} disabled={loading}><RefreshCcw size={16} /> Yenile</button>}
      />
      {error && <ErrorState message={error} onRetry={load} />}
      {loading && !report ? <LoadingState /> : null}
      {report && (
        <>
          <section className="customer-kpis">
            <div className="kpi-card"><span>Toplam Siparis</span><strong>{totals.orders}</strong><small>Tum siparisler</small></div>
            <div className="kpi-card"><span>Toplam Urun</span><strong>{totals.products}</strong><small>Katalog kaydi</small></div>
            <div className="kpi-card"><span>Kargo Kaydi</span><strong>{totals.shipments}</strong><small>Hazirlanan gonderiler</small></div>
            <div className="kpi-card"><span>Son 7 Gun Siparis</span><strong>{report.charts.orders.reduce((sum, item) => sum + Number(item.value || 0), 0)}</strong><small>Haftalik hareket</small></div>
          </section>

          <div className="split">
            <section className="panel">
              <h2>7 Gunluk Satis</h2>
              <TrendBars series={report.charts.sales} />
            </section>
            <section className="panel">
              <h2>7 Gunluk Siparis</h2>
              <TrendBars series={report.charts.orders} tone="secondary" />
            </section>
          </div>

          <div className="dashboard-grid">
            <Breakdown title="Siparis Durumu" items={report.breakdowns.orders} />
            <Breakdown title="Kargo Durumu" items={report.breakdowns.shipping} />
            <Breakdown title="Urun Durumu" items={report.breakdowns.products} />
          </div>
        </>
      )}
    </>
  );
}
