import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Banknote,
  Building2,
  ClipboardList,
  CreditCard,
  FileText,
  Package,
  PackageCheck,
  RefreshCcw,
  Truck,
} from 'lucide-react';
import { api } from '../../api/client.js';
import { DataTable } from '../../components/DataTable.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { useAsync } from '../../hooks/useAsync.js';

const iconMap = {
  'Toplam Satis': Banknote,
  Siparis: ClipboardList,
  'Aktif Urun': Package,
  Kargo: Truck,
  'Basarili Odeme': CreditCard,
  'Kesilen Fatura': FileText,
  'Aktif Abonelik': Building2,
  'API Cagrisi': Activity,
};

const statusLabels = {
  new: 'Yeni',
  processing: 'Hazirlaniyor',
  shipped: 'Kargoda',
  delivered: 'Teslim',
  cancelled: 'Iptal',
  active: 'Aktif',
  draft: 'Taslak',
  passive: 'Pasif',
  queued: 'Kuyrukta',
  created: 'Olustu',
  in_transit: 'Yolda',
  paid: 'Odendi',
  failed: 'Basarisiz',
  pending: 'Bekliyor',
  issued: 'Kesildi',
  sent: 'Gonderildi',
  completed: 'Tamamlandi',
};

function formatValue(metric) {
  const value = Number(metric.value || 0);

  if (metric.prefix === 'TRY') {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(value);
  }

  return new Intl.NumberFormat('tr-TR').format(value);
}

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
        <div className="soft-empty">Bu modul icin henuz veri yok.</div>
      ) : items.map((item) => (
        <div className="breakdown-row" key={item.label}>
          <div>
            <strong>{statusLabels[item.label] || item.label}</strong>
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

export function DashboardPage() {
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

  const hasData = useMemo(() => {
    if (!report) {
      return true;
    }

    return report.empty_states.company_count > 0 || report.empty_states.product_count > 0 || report.empty_states.order_count > 0;
  }, [report]);

  return (
    <>
      <PageHeader
        title="Yonetim Paneli"
        actions={<button type="button" onClick={load} disabled={loading}><RefreshCcw size={16} /> Yenile</button>}
      />
      {error && <ErrorState message={error} onRetry={load} />}
      {loading && !report ? <LoadingState /> : null}

      {!loading && report && !hasData ? (
        <section className="panel empty-dashboard">
          <PackageCheck size={34} />
          <h2>Demo veri bekleniyor</h2>
          <p>Yerel gelistirme icin `php artisan db:seed --class=DemoSeeder` komutunu calistirarak dashboard raporlarini doldurabilirsiniz.</p>
        </section>
      ) : null}

      {report ? (
        <>
          <div className="stats-grid dashboard-stats">
            {report.summary.map((metric) => {
              const Icon = iconMap[metric.label] || Activity;
              const positive = Number(metric.change || 0) >= 0;

              return (
                <div className="stat-card metric-card" key={metric.label}>
                  <div className="metric-top">
                    <Icon size={20} />
                    {metric.change !== null && (
                      <span className={`trend-pill ${positive ? 'up' : 'down'}`}>
                        {positive ? '+' : ''}{metric.change}%
                      </span>
                    )}
                  </div>
                  <strong>{formatValue(metric)}</strong>
                  <span>{metric.label}</span>
                </div>
              );
            })}
          </div>

          <div className="split">
            <section className="panel">
              <h2>7 Gunluk Satis Trendi</h2>
              <TrendBars series={report.charts.sales} />
            </section>
            <section className="panel">
              <h2>7 Gunluk Siparis Trendi</h2>
              <TrendBars series={report.charts.orders} tone="secondary" />
            </section>
          </div>

          <div className="dashboard-grid">
            <Breakdown title="Siparis Durumu" items={report.breakdowns.orders} />
            <Breakdown title="Kargo Durumu" items={report.breakdowns.shipping} />
            <Breakdown title="Odeme Durumu" items={report.breakdowns.payments} />
            <Breakdown title="Fatura Durumu" items={report.breakdowns.invoices} />
          </div>

          <section className="panel">
            <h2>SaaS Kullanim Metrikleri</h2>
            <div className="usage-grid">
              {report.saas_usage.length === 0 ? (
                <div className="soft-empty">Abonelik kullanim verisi bulunmuyor.</div>
              ) : report.saas_usage.map((item) => (
                <div className="usage-item" key={item.metric}>
                  <div>
                    <strong>{item.metric}</strong>
                    <span>{item.used} / {item.limit || 'Limitsiz'}</span>
                  </div>
                  <div className="progress">
                    <span style={{ width: `${item.percentage ?? 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="panel">
            <h2>Son Siparisler</h2>
            <DataTable
              columns={[
                { key: 'marketplace_order_id', label: 'Siparis No' },
                { key: 'company', label: 'Firma', render: (row) => row.company?.name || '-' },
                { key: 'customer_name', label: 'Musteri' },
                { key: 'total_amount', label: 'Tutar', render: (row) => formatValue({ value: row.total_amount, prefix: 'TRY' }) },
                { key: 'status', label: 'Durum', render: (row) => <span className={`badge ${row.status}`}>{statusLabels[row.status] || row.status}</span> },
              ]}
              rows={report.recent_activity.orders}
              emptyTitle="Siparis yok"
              emptyText="Pazaryeri siparisleri cekildiginde burada gorunur."
            />
          </section>

          <section className="panel">
            <h2>Son API Cagrilari</h2>
            <DataTable
              columns={[
                { key: 'marketplace_code', label: 'Servis' },
                { key: 'method', label: 'Metot' },
                { key: 'endpoint', label: 'Endpoint' },
                { key: 'status_code', label: 'HTTP' },
                { key: 'duration_ms', label: 'Sure', render: (row) => `${row.duration_ms || 0} ms` },
              ]}
              rows={report.recent_activity.logs}
              emptyTitle="API log yok"
              emptyText="Entegrasyon servisleri calistikca istek kayitlari burada listelenir."
            />
          </section>
        </>
      ) : null}
    </>
  );
}
