import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Circle,
  ClipboardList,
  Database,
  Gauge,
  Layers3,
  Link2,
  Package,
  PackagePlus,
  RadioTower,
  RefreshCcw,
  Send,
  ShoppingBag,
  Truck,
  UploadCloud,
  Workflow,
} from 'lucide-react';
import { api, asArray, asObject, http } from '../../api/client.js';
import { ActivityTimeline } from '../../components/ActivityTimeline.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { OperationAlertList } from '../../components/OperationAlertList.jsx';
import { OperationStatCard } from '../../components/OperationStatCard.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { ReferenceModuleNav } from '../../components/ReferenceModuleNav.jsx';
import { useAsync } from '../../hooks/useAsync.js';

const setupSteps = [
  { key: 'company', title: 'Firma bilgilerini tamamla', text: 'Fatura, kargo ve pazaryeri islemleri icin firma bilgilerini kontrol edin.', to: '/app/settings' },
  { key: 'marketplace', title: 'Pazaryeri hesabi bagla', text: 'Trendyol veya Hepsiburada hesap bilgilerinizi ekleyin.', to: '/app/marketplaces' },
  { key: 'mapping', title: 'Kategori eslestirme yap', text: 'Kendi kategorilerinizi pazaryeri kategorileriyle eslestirin.', to: '/app/marketplace-mapping/categories' },
  { key: 'products', title: 'Urun ekle veya toplu yukle', text: 'Urunleri tek tek ekleyin veya Excel/XML ile toplu yukleyin.', to: '/app/products/new' },
  { key: 'queue', title: 'Urunleri aktarim listesine ekle', text: 'Hazir urunleri pazaryerine gondermeden once listeye alin.', to: '/app/products/publish-queue' },
  { key: 'sync', title: 'Stok/fiyat senkronunu baslat', text: 'Fiyat ve stok bilgilerinin pazaryerlerinde guncellenmesini saglayin.', to: '/app/products/publish' },
  { key: 'orders', title: 'Siparisleri takip et', text: 'Yeni siparisleri, kargo ve fatura sureclerini izleyin.', to: '/app/orders' },
];

function settledValue(result, fallback = null) {
  if (result.status === 'fulfilled') return result.value;
  return result.reason?.response?.data || fallback;
}

const emptyDashboardReport = {
  summary: [],
  breakdowns: {},
  charts: { sales: [], orders: [] },
  empty_states: { company_count: 0, order_count: 0 },
  recent_activity: { orders: [], api_logs: [] },
};

function normalizeDashboardReport(report) {
  return {
    ...emptyDashboardReport,
    ...(report || {}),
    summary: Array.isArray(report?.summary) ? report.summary : [],
    breakdowns: report?.breakdowns || {},
    charts: {
      ...emptyDashboardReport.charts,
      ...(report?.charts || {}),
      sales: Array.isArray(report?.charts?.sales) ? report.charts.sales : [],
      orders: Array.isArray(report?.charts?.orders) ? report.charts.orders : [],
    },
    empty_states: {
      ...emptyDashboardReport.empty_states,
      ...(report?.empty_states || {}),
    },
    recent_activity: {
      ...emptyDashboardReport.recent_activity,
      ...(report?.recent_activity || {}),
      orders: Array.isArray(report?.recent_activity?.orders) ? report.recent_activity.orders : [],
      api_logs: Array.isArray(report?.recent_activity?.api_logs) ? report.recent_activity.api_logs : [],
    },
  };
}

function metric(report, label) {
  return report?.summary?.find((item) => item.label === label)?.value || 0;
}

function statusCount(report, group, keys) {
  return (report?.breakdowns?.[group] || [])
    .filter((item) => keys.includes(item.label))
    .reduce((sum, item) => sum + Number(item.value || 0), 0);
}

function todayOrders(report) {
  const series = report?.charts?.orders || [];
  const last = series[series.length - 1];

  return Number(last?.value || 0);
}

function formatMoney(value) {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function latest(items = [], field = 'created_at') {
  return [...items].filter((item) => item?.[field]).sort((a, b) => new Date(b[field]) - new Date(a[field]))[0] || null;
}

function serviceName(log) {
  return log?.marketplace_code || log?.provider_code || 'Platform API';
}

function successRate(logs = []) {
  if (logs.length === 0) return 100;
  const success = logs.filter((log) => Number(log.status_code || 0) < 400).length;
  return Math.round((success / logs.length) * 100);
}

function maxSeriesValue(series = []) {
  return Math.max(1, ...series.map((item) => Number(item.value || 0)));
}

function MiniTrend({ series = [] }) {
  const max = maxSeriesValue(series);
  return (
    <div className="dashboard-mini-trend">
      {series.map((item) => <span key={item.label} style={{ height: `${Math.max(8, (Number(item.value || 0) / max) * 100)}%` }} />)}
    </div>
  );
}

function MarketplaceOverviewCard({ code, name, account, products, logs, queueStats }) {
  const failures = logs.filter((log) => String(log.marketplace_code || '').toLowerCase() === code && Number(log.status_code || 0) >= 400);
  const readyProducts = products.filter((product) => product.marketplace_readiness?.[code]?.ready || product.marketplace_ready).length;
  const missingProducts = Math.max(0, products.length - readyProducts);
  const connected = Boolean(account) && !account.last_error && account.connection_status !== 'failed';
  const lastSync = account?.last_product_sync_at || account?.last_order_sync_at || account?.updated_at;

  return (
    <article className="dashboard-marketplace-card">
      <div className="dashboard-card-heading">
        <div>
          <span>{name}</span>
          <strong>{connected ? 'Baglanti aktif' : account ? 'Kontrol gerekli' : 'Hesap yok'}</strong>
        </div>
        <span className={connected ? 'status-pill ready' : 'status-pill blocked'}>{connected ? 'Stabil' : 'Eksik'}</span>
      </div>
      <div className="marketplace-metric-row">
        <div><small>Son senkron</small><b>{formatDate(lastSync)}</b></div>
        <div><small>Hazir urun</small><b>{readyProducts}</b></div>
        <div><small>Eksik urun</small><b>{missingProducts}</b></div>
        <div><small>Gonderim kuyrugu</small><b>{queueStats.queued || 0}</b></div>
        <div><small>Hata</small><b>{failures.length + (account?.last_error ? 1 : 0)}</b></div>
      </div>
      <Link className="button-link secondary-link" to={`/app/marketplaces/${code}`}>Yonet</Link>
    </article>
  );
}

function buildAlerts({ products, queue, logs, imports, marketplaces, health }) {
  const alerts = [];
  const failedJobs = Number(queue?.stats?.failed_jobs || 0);
  const trendyolMissingCategory = products.filter((product) => {
    const missing = asArray(product.marketplace_readiness?.trendyol?.missing_fields);
    return missing.includes('category_mapping') || missing.includes('marketplace_category');
  }).length;
  const criticalLog = logs.find((log) => Number(log.status_code || 0) >= 500) || logs.find((log) => Number(log.status_code || 0) >= 400);
  const failedImport = imports.find((run) => run.status === 'failed' || Number(run.error_count || 0) > 0);
  const hepsiburada = marketplaces.find((item) => item.code === 'hepsiburada');

  if (trendyolMissingCategory > 0) {
    alerts.push({ title: `${trendyolMissingCategory} urun Trendyol icin kategori bekliyor`, message: 'Kategori eslestirme ekranindan eksikleri tamamlayin.', tone: 'warning' });
  }
  if (failedJobs > 0) {
    alerts.push({ title: `${failedJobs} failed queue job mevcut`, message: 'Operasyon Merkezi veya Queue ekranindan tekrar deneyin.', tone: 'danger' });
  }
  if (hepsiburada && !hepsiburada.last_product_sync_at && !hepsiburada.last_order_sync_at) {
    alerts.push({ title: 'Hepsiburada baglantisi test bekliyor', message: 'Pazaryeri ekranindan baglanti testini calistirin.', tone: 'warning' });
  }
  if (failedImport) {
    alerts.push({ title: 'XML/Excel importunda hata var', message: `${failedImport.error_count || 0} hatali satir kontrol edilmeli.`, tone: 'warning' });
  }
  if (criticalLog) {
    alerts.push({ title: `${serviceName(criticalLog)} API hatasi`, message: `${criticalLog.endpoint || 'API'} HTTP ${criticalLog.status_code}`, tone: 'danger' });
  }
  if (health?.status && health.status !== 'healthy') {
    alerts.push({ title: 'Sistem sagligi kontrol istiyor', message: 'Health check bir veya daha fazla serviste uyari verdi.', tone: 'warning' });
  }

  return alerts.slice(0, 5);
}

export function CustomerDashboardPage() {
  const { loading, error, run } = useAsync();
  const [data, setData] = useState({
    report: null,
    health: null,
    queue: null,
    logs: [],
    marketplaces: [],
    products: [],
    imports: [],
  });

  const load = async () => {
    await run(async () => {
      const [dashboard, health, queue, logs, marketplaceResponse, productResponse, imports] = await Promise.allSettled([
        api.dashboard.report(),
        http.get('/health').then((response) => response.data),
        api.queue.status(),
        api.logs.list(),
        api.marketplaces.list(),
        api.products.list(),
        api.imports.runs(),
      ]);
      setData({
        report: normalizeDashboardReport(settledValue(dashboard)),
        health: asObject(settledValue(health), { status: 'degraded', checks: {}, checked_at: null }),
        queue: asObject(settledValue(queue), { stats: {}, recent_runs: [], failed_jobs: [] }),
        logs: asArray(settledValue(logs, { data: [] })),
        marketplaces: asArray(settledValue(marketplaceResponse, { data: [] })),
        products: asArray(settledValue(productResponse, { data: [] })),
        imports: asArray(settledValue(imports, { data: [] })),
      });
    });
  };

  useEffect(() => {
    load();
  }, []);

  const { report, health, queue, logs, marketplaces, products, imports } = data;
  const queueStats = asObject(queue?.stats);
  const failedLogs = logs.filter((log) => Number(log.status_code || 0) >= 400);
  const activeProducts = products.filter((product) => product.status === 'active').length;
  const readyProducts = products.filter((product) => product.marketplace_ready).length;
  const missingProducts = Math.max(0, products.length - readyProducts);
  const lowStockProducts = products.filter((product) => Number(product.stock || 0) <= Number(product.critical_stock || 0)).length;
  const lastImport = latest(imports);
  const lastSync = latest(marketplaces, 'last_product_sync_at') || latest(marketplaces, 'last_order_sync_at') || latest(imports, 'created_at') || latest(logs);
  const successPercentage = successRate(logs);
  const completedSteps = {
    company: report?.empty_states?.company_count > 0,
    marketplace: marketplaces.length > 0,
    mapping: products.some((product) => product.marketplace_ready),
    products: products.length > 0,
    queue: readyProducts > 0,
    sync: logs.length > 0 || imports.length > 0,
    orders: report?.empty_states?.order_count > 0,
  };
  const setupProgress = useMemo(() => {
    const completed = Object.values(completedSteps).filter(Boolean).length;
    return Math.round((completed / setupSteps.length) * 100);
  }, [completedSteps]);
  const alerts = useMemo(() => buildAlerts({ products, queue, logs, imports, marketplaces, health }), [products, queue, logs, imports, marketplaces, health]);
  const recentTimeline = [
    ...(imports || []).slice(0, 4).map((item) => ({
      id: `import-${item.id}`,
      title: `${sourceLabel(item.source_type)} import`,
      description: `${item.supplier_name || 'Tedarikci yok'} · ${item.status || '-'}`,
      time: formatDate(item.created_at),
      sortTime: item.created_at,
    })),
    ...(report?.recent_activity?.orders || []).map((order) => ({
      id: `order-${order.id}`,
      title: `Siparis ${order.marketplace_order_id}`,
      description: `${order.customer_name || 'Musteri'} · ${formatMoney(order.total_amount)}`,
      time: formatDate(order.created_at),
      sortTime: order.created_at,
    })),
    ...logs.slice(0, 5).map((log) => ({
      id: `log-${log.id}`,
      title: `${serviceName(log)} ${Number(log.status_code || 0) >= 400 ? 'hatasi' : 'cagrisi'}`,
      description: `${log.endpoint || '-'} · HTTP ${log.status_code || '-'}`,
      time: formatDate(log.created_at),
      sortTime: log.created_at,
    })),
  ].sort((a, b) => new Date(b.sortTime) - new Date(a.sortTime)).slice(0, 8);

  return (
    <>
      <PageHeader
        title="Baslangic"
        description="Satis, pazaryeri, import, queue ve API sagligini tek operasyon panelinde takip edin."
        actions={<button type="button" onClick={load} disabled={loading}><RefreshCcw size={16} /> Yenile</button>}
      />
      <ReferenceModuleNav section="marketplace" />
      {error && <ErrorState message={error} onRetry={load} />}
      {loading && !report ? <LoadingState /> : null}

      {report && (
        <div className="premium-dashboard-page">
          <section className="premium-dashboard-hero">
            <div className="premium-hero-copy">
              <span className="eyebrow"><RadioTower size={15} /> Balina Entegrasyon Live</span>
              <h2>Operasyonlariniz tek merkezden canli izleniyor.</h2>
              <p>Urun, pazaryeri, siparis, import ve queue akislarini ayni ekranda takip ederek gunluk e-ticaret operasyonunu hizlandirin.</p>
              <div className="premium-hero-actions">
                <Link className="button-link" to="/app/products/new"><PackagePlus size={16} /> Urun ekle</Link>
                <Link className="button-link secondary-link" to="/app/products/import"><UploadCloud size={16} /> XML import</Link>
                <Link className="button-link secondary-link" to="/app/marketplaces/onboarding"><Link2 size={16} /> Pazaryeri bagla</Link>
                <Link className="button-link secondary-link" to="/app/operations"><Gauge size={16} /> Operasyon Merkezi</Link>
              </div>
            </div>
            <div className="premium-hero-status">
              <div className="system-health-badge">
                <span className={health?.status === 'healthy' ? 'health-dot online' : 'health-dot warning'} />
                <strong>{health?.status === 'healthy' ? 'Sistem saglikli' : 'Sistem kontrol istiyor'}</strong>
              </div>
              <div className="hero-status-grid">
                <div><span>Firma</span><strong>{report.empty_states.company_count || 0}</strong></div>
                <div><span>Marketplace</span><strong>{marketplaces.length}</strong></div>
                <div><span>Bugunku siparis</span><strong>{todayOrders(report)}</strong></div>
                <div><span>Queue</span><strong>{queueStats.queued || 0}</strong></div>
              </div>
              <small>Son senkron: {formatDate(lastSync?.last_product_sync_at || lastSync?.last_order_sync_at || lastSync?.created_at || lastSync?.updated_at)}</small>
            </div>
          </section>

          <section className="premium-dashboard-kpis">
            <OperationStatCard title="Toplam Satis" value={formatMoney(metric(report, 'Toplam Satis'))} subtitle="Tum siparis geliri" icon={BarChart3} tone="green" progress={successPercentage} />
            <OperationStatCard title="Bugunku Siparis" value={todayOrders(report)} subtitle={`${metric(report, 'Siparis')} toplam siparis`} icon={ClipboardList} tone="blue" />
            <OperationStatCard title="Aktif Urun" value={activeProducts} subtitle={`${readyProducts} hazir, ${missingProducts} eksik`} icon={Package} tone="purple" />
            <OperationStatCard title="Basarisiz Islemler" value={failedLogs.length + Number(queueStats.failed_jobs || 0)} subtitle="API ve queue hatalari" icon={AlertTriangle} tone={failedLogs.length ? 'red' : 'green'} />
            <OperationStatCard title="Bekleyen Queue" value={queueStats.queued || 0} subtitle={`${queueStats.running || 0} calisan job`} icon={Workflow} tone="orange" />
            <OperationStatCard title="API Hata Sayisi" value={failedLogs.length} subtitle={`${logs.length} API kaydi icinde`} icon={Activity} tone={failedLogs.length ? 'red' : 'green'} />
            <OperationStatCard title="Basari Orani" value={`${successPercentage}%`} subtitle="API islem basarisi" icon={CheckCircle2} tone="green" progress={successPercentage} />
            <article className="operation-stat-card blue">
              <div className="operation-stat-top"><span><BarChart3 size={19} /></span><small>7 gun</small></div>
              <strong>{report.charts.orders.reduce((sum, item) => sum + Number(item.value || 0), 0)}</strong>
              <p>Son 7 Gun Trendi</p>
              <MiniTrend series={report.charts.orders} />
            </article>
          </section>

          <section className="dashboard-main-grid">
            <section className="panel dashboard-marketplace-section">
              <div className="section-title-row">
                <h2>Pazaryeri Durumu</h2>
                <Link className="button-link secondary-link" to="/app/marketplaces">Tum hesaplar</Link>
              </div>
              <div className="dashboard-marketplace-grid">
                <MarketplaceOverviewCard code="trendyol" name="Trendyol" account={marketplaces.find((item) => item.code === 'trendyol')} products={products} logs={logs} queueStats={queueStats} />
                <MarketplaceOverviewCard code="hepsiburada" name="Hepsiburada" account={marketplaces.find((item) => item.code === 'hepsiburada')} products={products} logs={logs} queueStats={queueStats} />
              </div>
            </section>

            <section className="panel dashboard-operation-summary">
              <div className="section-title-row">
                <h2>Operasyon Ozeti</h2>
                <Link className="button-link secondary-link" to="/app/operations">Detay</Link>
              </div>
              <div className="operation-summary-grid">
                <div><span>Queue durumu</span><strong>{queueStats.failed_jobs ? 'Kontrol gerekli' : 'Stabil'}</strong></div>
                <div><span>Import durumu</span><strong>{lastImport ? statusText(lastImport.status) : 'Kayit yok'}</strong></div>
                <div><span>API log ozeti</span><strong>{failedLogs.length ? `${failedLogs.length} hata` : 'Temiz'}</strong></div>
                <div><span>Failed jobs</span><strong>{queueStats.failed_jobs || 0}</strong></div>
              </div>
            </section>

            <OperationAlertList alerts={alerts} />
            <ActivityTimeline title="Canli Aktivite Akisi" items={recentTimeline} emptyText="Import, siparis veya API aktivitesi henuz yok." />

            <section className="panel onboarding-panel">
              <div className="section-title-row">
                <h2>Kurulum ve Hazirlik</h2>
                <span className="badge active">{setupProgress}%</span>
              </div>
              <div className="progress setup-progress-line"><span style={{ width: `${setupProgress}%` }} /></div>
              {setupSteps.map((step, index) => (
                <Link className={`onboarding-step ${completedSteps[step.key] ? 'completed' : ''}`} to={step.to} key={step.key}>
                  <span>{index + 1}</span>
                  <div>
                    <strong>{step.title}</strong>
                    <small>{step.text}</small>
                  </div>
                  {completedSteps[step.key] ? <CheckCircle2 size={17} /> : <Circle size={17} />}
                </Link>
              ))}
            </section>

            <section className="panel quick-action-panel-premium">
              <h2>Hizli Aksiyonlar</h2>
              <div className="quick-actions-grid">
                <Link to="/app/products/new"><PackagePlus size={18} /> Urun ekle</Link>
                <Link to="/app/products/import"><UploadCloud size={18} /> XML/Excel import</Link>
                <Link to="/app/marketplace-mapping/categories"><Layers3 size={18} /> Kategori eslestir</Link>
                <Link to="/app/products/publish-queue"><Send size={18} /> Aktarim listesi</Link>
                <Link to="/app/orders"><ClipboardList size={18} /> Siparisleri kontrol et</Link>
                <Link to="/app/shipping"><Truck size={18} /> Kargo hazirla</Link>
                <Link to="/app/api-logs"><AlertTriangle size={18} /> Hata Merkezi</Link>
                <Link to="/app/resources"><Database size={18} /> Developer Center</Link>
              </div>
            </section>
          </section>

          {products.length === 0 && (
            <section className="panel customer-empty-guide">
              <PackagePlus size={28} />
              <div>
                <h2>Ilk urununuzu ekleyin</h2>
                <p>Tek urun ekleyerek baslayabilir veya Excel/XML ile toplu katalog yukleyebilirsiniz. Urunler hazir oldugunda aktarim listesine alinabilir.</p>
              </div>
              <Link className="button-link" to="/app/products/new">Urun ekle</Link>
            </section>
          )}

          {lowStockProducts > 0 && (
            <section className="state-box workflow-warning">
              <AlertTriangle size={18} />
              <span>{lowStockProducts} urunde stok uyarisi var. Stok/fiyat guncelleme akisindan kontrol edin.</span>
            </section>
          )}
        </div>
      )}
    </>
  );
}

function sourceLabel(type) {
  return type === 'xml' ? 'XML' : 'Excel';
}

function statusText(status) {
  return {
    queued: 'Kuyrukta',
    running: 'Calisiyor',
    completed: 'Tamamlandi',
    completed_with_errors: 'Hata var',
    failed: 'Basarisiz',
  }[status] || status || '-';
}
