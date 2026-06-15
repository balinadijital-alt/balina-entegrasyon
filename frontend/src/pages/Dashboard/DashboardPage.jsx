import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  AlertTriangle,
  Banknote,
  CheckCircle2,
  ClipboardList,
  Package,
  PackageCheck,
  RadioTower,
  RefreshCcw,
  ShieldCheck,
  Timer,
  TrendingUp,
  Truck,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import { DataTable } from '../../components/DataTable.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { ReferenceModuleNav } from '../../components/ReferenceModuleNav.jsx';
import { useAsync } from '../../hooks/useAsync.js';

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

function metricByLabel(report, labels, fallback) {
  return report.summary.find((metric) => labels.includes(metric.label)) || fallback;
}

function MarketplaceHealthCard({ name, status, pending, failed }) {
  const healthy = Number(failed || 0) === 0;

  return (
    <div className="market-health-card">
      <div>
        <span>{name}</span>
        <strong>{status}</strong>
      </div>
      <span className={`health-dot ${healthy ? 'online' : 'warning'}`} />
      <small>{pending} bekleyen sync · {failed} hata</small>
    </div>
  );
}

export function DashboardPage({ title = 'Yonetim Paneli' }) {
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

  const revenueMetric = report ? metricByLabel(report, ['Toplam Satis'], { label: 'Toplam Satis', value: 0, prefix: 'TRY' }) : null;
  const orderMetric = report ? metricByLabel(report, ['Siparis'], { label: 'Siparis', value: 0 }) : null;
  const shippingMetric = report ? metricByLabel(report, ['Kargo'], { label: 'Kargo', value: 0 }) : null;
  const apiMetric = report ? metricByLabel(report, ['API Cagrisi'], { label: 'API Cagrisi', value: 0 }) : null;
  const failedLogs = report?.recent_activity.logs.filter((log) => Number(log.status_code || 0) >= 400).slice(0, 4) || [];
  const pendingJobs = report?.breakdowns.orders.filter((item) => ['pending', 'queued', 'processing', 'preparing', 'new'].includes(item.label)) || [];

  return (
    <>
      <PageHeader
        title={title}
        actions={<button type="button" onClick={load} disabled={loading}><RefreshCcw size={16} /> Yenile</button>}
      />
      <ReferenceModuleNav section="admin" />
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
          <section className="dashboard-hero">
            <div className="hero-copy">
              <span className="eyebrow">Operasyon ana ekrani</span>
              <h2>Bugun hangi islem bekliyor, hangi servis saglikli, hangi siparis aksiyon istiyor?</h2>
              <p>Referans panel mantigiyla satis, siparis, kargo ve API durumunu tek akista okuyun; gereken ekrana dogrudan gecin.</p>
            </div>
            <div className="hero-health-grid">
              <div>
                <ShieldCheck size={18} />
                <span>API Health</span>
                <strong>{failedLogs.length === 0 ? 'Stabil' : 'Kontrol gerekli'}</strong>
              </div>
              <div>
                <Timer size={18} />
                <span>Sync Queue</span>
                <strong>{pendingJobs.reduce((sum, item) => sum + Number(item.value || 0), 0)} bekleyen</strong>
              </div>
            </div>
          </section>

          <div className="command-kpis">
            {[
              { metric: revenueMetric, icon: Banknote, note: 'Net satis gorunumu' },
              { metric: orderMetric, icon: ClipboardList, note: 'Siparis operasyonu' },
              { metric: shippingMetric, icon: Truck, note: 'Kargo aksiyonlari' },
              { metric: apiMetric, icon: RadioTower, note: 'Entegrasyon trafigi' },
            ].map(({ metric, icon: Icon, note }) => (
              <div className="command-kpi-card" key={metric.label}>
                <div className="metric-top">
                  <Icon size={19} />
                  <span className={`trend-pill ${Number(metric.change || 0) >= 0 ? 'up' : 'down'}`}>
                    <TrendingUp size={12} /> {Number(metric.change || 0) >= 0 ? '+' : ''}{metric.change || 0}%
                  </span>
                </div>
                <strong>{formatValue(metric)}</strong>
                <span>{metric.label}</span>
                <small>{note}</small>
              </div>
            ))}
          </div>

          <section className="dashboard-reference-strip">
            <div>
              <span className="eyebrow">Hizli is akisi</span>
              <strong>Once siparisleri, sonra urun ve entegrasyon hatalarini kontrol edin.</strong>
            </div>
            <div className="dashboard-reference-actions">
              <Link to="/orders"><ClipboardList size={16} /> Siparisleri Ac</Link>
              <Link to="/products"><Package size={16} /> Urunleri Ac</Link>
              <Link to="/marketplaces"><RadioTower size={16} /> Entegrasyonlar</Link>
              <Link to="/api-logs"><AlertTriangle size={16} /> Hata Merkezi</Link>
            </div>
          </section>

          <div className="dashboard-command-grid">
            <section className="panel chart-panel">
              <div className="panel-heading">
                <div>
                  <span>Gelir trendi</span>
                  <h2>7 Gunluk Satis</h2>
                </div>
                <span className="badge active">Canli</span>
              </div>
              <TrendBars series={report.charts.sales} />
            </section>
            <section className="panel chart-panel">
              <div className="panel-heading">
                <div>
                  <span>Siparis hacmi</span>
                  <h2>7 Gunluk Siparis</h2>
                </div>
                <span className="badge created">Trend</span>
              </div>
              <TrendBars series={report.charts.orders} tone="secondary" />
            </section>
            <section className="panel compact-panel">
              <div className="panel-heading">
                <div>
                  <span>Pazaryeri sagligi</span>
                  <h2>Marketplace Health</h2>
                </div>
                <CheckCircle2 size={18} />
              </div>
              <MarketplaceHealthCard name="Trendyol" status="Senkron izleniyor" pending={pendingJobs.length} failed={failedLogs.length} />
              <MarketplaceHealthCard name="Hepsiburada" status="Senkron izleniyor" pending={report.breakdowns.shipping.length} failed={0} />
            </section>
            <section className="panel compact-panel">
              <div className="panel-heading">
                <div>
                  <span>Kritik uyarilar</span>
                  <h2>Operasyon Riskleri</h2>
                </div>
                <AlertTriangle size={18} />
              </div>
              {failedLogs.length === 0 ? (
                <div className="soft-empty success-empty">Kritik API hatasi gorunmuyor.</div>
              ) : failedLogs.map((log) => (
                <div className="alert-row" key={log.id || `${log.endpoint}-${log.status_code}`}>
                  <strong>{log.marketplace_code || 'API'} · HTTP {log.status_code}</strong>
                  <span>{log.endpoint}</span>
                  <Link to="/api-logs">Loglari ac <ArrowRight size={13} /></Link>
                </div>
              ))}
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
