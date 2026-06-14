import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, Boxes, Clock3, Database, FileWarning, Gauge, PackageCheck, RadioTower, RefreshCcw, ServerCog, ShoppingBag, Truck, UploadCloud, Workflow } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, asArray, asObject, http } from '../../api/client.js';
import { ActivityTimeline } from '../../components/ActivityTimeline.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { HealthStatusCard } from '../../components/HealthStatusCard.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { MarketplaceHealthCard } from '../../components/MarketplaceHealthCard.jsx';
import { OperationAlertList } from '../../components/OperationAlertList.jsx';
import { OperationStatCard } from '../../components/OperationStatCard.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { QueueOverviewCard } from '../../components/QueueOverviewCard.jsx';
import { ReferenceModuleNav } from '../../components/ReferenceModuleNav.jsx';
import { useAsync } from '../../hooks/useAsync.js';

function settledValue(result, fallback = null) {
  if (result.status === 'fulfilled') return result.value;
  return result.reason?.response?.data || fallback;
}

function sumStatus(items = [], keys = []) {
  return items.filter((item) => keys.includes(item.label)).reduce((sum, item) => sum + Number(item.value || 0), 0);
}

function metric(report, label) {
  return report?.summary?.find((item) => item.label === label)?.value || 0;
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

function buildAlerts({ health, queue, logs, imports, marketplaces }) {
  const alerts = [];
  const failedJobs = Number(queue?.stats?.failed_jobs || 0);
  const criticalLog = logs.find((log) => Number(log.status_code || 0) >= 500) || logs.find((log) => Number(log.status_code || 0) >= 400);
  const failedImport = imports.find((run) => Number(run.failed_rows || run.error_count || 0) > 0 || run.status === 'failed');
  const failedMarketplace = marketplaces.find((account) => account.last_error || account.connection_status === 'failed');

  if (health?.status === 'degraded') {
    alerts.push({ title: 'Sistem sagligi degraded', message: 'Health check bir veya daha fazla serviste uyari verdi.', tone: 'danger' });
  }
  if (failedJobs > 0) {
    alerts.push({ title: `${failedJobs} failed queue job mevcut`, message: 'Queue ekranindan failed joblari kontrol edin.', tone: 'danger' });
  }
  if (criticalLog) {
    alerts.push({ title: `${serviceName(criticalLog)} API hatasi`, message: `${criticalLog.endpoint || 'API'} HTTP ${criticalLog.status_code}`, tone: 'warning' });
  }
  if (failedImport) {
    alerts.push({ title: 'Import islemi kontrol istiyor', message: `${failedImport.name || failedImport.file_name || 'Son import'} kaydinda hatali satir olabilir.`, tone: 'warning' });
  }
  if (failedMarketplace) {
    alerts.push({ title: `${failedMarketplace.name || failedMarketplace.code} baglantisi sorunlu`, message: failedMarketplace.last_error || 'Pazaryeri baglantisi basarisiz gorunuyor.', tone: 'warning' });
  }

  return alerts;
}

export function OperationsCenterPage() {
  const { loading, error, run } = useAsync();
  const [data, setData] = useState({
    dashboard: null,
    health: null,
    queue: null,
    logs: [],
    marketplaces: [],
    imports: [],
    xmlSources: [],
  });

  const load = async () => {
    await run(async () => {
      const [dashboard, health, queue, logs, marketplaces, imports, xmlSources] = await Promise.allSettled([
        api.dashboard.report(),
        http.get('/health').then((response) => response.data),
        api.queue.status(),
        api.logs.list(),
        api.marketplaces.list(),
        api.imports.runs(),
        api.xmlSources.list(),
      ]);

      setData({
        dashboard: asObject(settledValue(dashboard), { summary: [], breakdowns: {}, recent_activity: {} }),
        health: asObject(settledValue(health), { status: 'degraded', checks: {}, checked_at: null }),
        queue: asObject(settledValue(queue), { stats: {}, redis: { connected: false }, recent_runs: [], failed_jobs: [], notifications: [] }),
        logs: asArray(settledValue(logs, { data: [] })),
        marketplaces: asArray(settledValue(marketplaces, { data: [] })),
        imports: asArray(settledValue(imports, { data: [] })),
        xmlSources: asArray(settledValue(xmlSources, { data: [] })),
      });
    });
  };

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 30000);
    return () => window.clearInterval(timer);
  }, []);

  const failedLogs = data.logs.filter((log) => Number(log.status_code || 0) >= 400);
  const successLogs = data.logs.filter((log) => Number(log.status_code || 0) < 400);
  const queueStats = asObject(data.queue?.stats);
  const orderBreakdown = asArray(data.dashboard?.breakdowns?.orders);
  const paymentBreakdown = asArray(data.dashboard?.breakdowns?.payments);
  const shippingBreakdown = asArray(data.dashboard?.breakdowns?.shipping);
  const lastImport = latest(data.imports);
  const lastXml = latest(data.xmlSources, 'updated_at') || latest(data.xmlSources);
  const alerts = useMemo(() => buildAlerts({
    health: data.health,
    queue: data.queue,
    logs: data.logs,
    imports: data.imports,
    marketplaces: data.marketplaces,
  }), [data]);
  const topErrorService = useMemo(() => {
    const counts = failedLogs.reduce((carry, log) => ({ ...carry, [serviceName(log)]: (carry[serviceName(log)] || 0) + 1 }), {});
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  }, [failedLogs]);
  const failedJobCount = Number(queueStats.failed_jobs || queueStats.failed || 0);
  const runningJobCount = Number(queueStats.running || 0);
  const pendingQueueCount = Number(queueStats.queued || 0);
  const operationSteps = [
    { number: 1, title: 'Sistem Sagligi', value: data.health?.status === 'healthy' ? 'Saglikli' : 'Kontrol', text: 'API, Redis ve servis kontrolu' },
    { number: 2, title: 'Pazaryeri', value: `${data.marketplaces.length} hesap`, text: 'Baglanti ve sync durumu' },
    { number: 3, title: 'Queue', value: `${pendingQueueCount + runningJobCount} islem`, text: 'Bekleyen ve calisan joblar' },
    { number: 4, title: 'Hata Merkezi', value: `${failedLogs.length + failedJobCount} uyari`, text: 'Mudahale bekleyen hatalar' },
    { number: 5, title: 'Modul Gecisi', value: 'Yonlendir', text: 'Ilgili ekranda tamamla' },
  ];

  const recentTimeline = [
    ...asArray(data.dashboard?.recent_activity?.orders).map((order) => ({
      id: `order-${order.id}`,
      title: `Siparis ${order.marketplace_order_id}`,
      description: `${order.customer_name || 'Musteri'} · ${order.status}`,
      time: formatDate(order.created_at),
    })),
    ...data.logs.slice(0, 5).map((log) => ({
      id: `log-${log.id}`,
      title: `${serviceName(log)} ${log.method || 'API'}`,
      description: `${log.endpoint || '-'} · HTTP ${log.status_code || '-'}`,
      time: formatDate(log.created_at),
    })),
  ].slice(0, 8);

  return (
    <div className="operations-page">
      <PageHeader
        title="Operasyon Merkezi"
        description="Entegrasyon sagligi, queue islemleri, API hatalari, import surecleri ve siparis akislarini tek komuta ekraninda izleyin."
        actions={<button type="button" onClick={load} disabled={loading}><RefreshCcw size={16} /> Yenile</button>}
      />
      <ReferenceModuleNav section="operations" />
      {error && <ErrorState message={error} onRetry={load} />}
      {loading && !data.dashboard ? <LoadingState /> : null}

      <section className="operations-hero reference-flow-hero">
        <div>
          <span className="eyebrow"><RadioTower size={15} /> Operasyon Akisi</span>
          <h2>Once durumu gorun, sonra ilgili ekrana gecin.</h2>
          <p>Bu ekran pazaryeri, import, queue, siparis ve API hata sinyallerini sirali bir is akisi gibi ozetler. Sorun varsa hangi module gitmeniz gerektigini hemen gosterir.</p>
        </div>
        <div className="operations-hero-status">
          <span>Genel durum</span>
          <strong>{alerts.length === 0 ? 'Aksiyon yok' : `${alerts.length} aksiyon`}</strong>
          <small>Son kontrol: {formatDate(data.health?.checked_at)}</small>
          <div className="operation-progress"><span style={{ width: data.health?.status === 'healthy' ? '100%' : '62%' }} /></div>
        </div>
      </section>

      <section className="operations-reference-flow" aria-label="Operasyon akis ozeti">
        {operationSteps.map((step) => (
          <div key={step.title}>
            <em>{step.number}</em>
            <strong>{step.title}</strong>
            <span>{step.value}</span>
            <small>{step.text}</small>
          </div>
        ))}
      </section>

      <section className={`operations-command-row ${alerts.length > 0 ? 'needs-action' : 'is-clear'}`}>
        <div>
          <span>{alerts.length > 0 ? 'Mudahale gerekli' : 'Bugun ne yapmaliyim?'}</span>
          <strong>{alerts.length > 0 ? alerts[0].title : 'Operasyon akisinda kritik bir uyari yok.'}</strong>
          <small>{alerts.length > 0 ? alerts[0].message : 'Siparis, queue, pazaryeri ve API sinyalleri normal gorunuyor; yine de son aktiviteleri kontrol edebilirsiniz.'}</small>
        </div>
        <div>
          <Link to="/api-logs" className="button-link secondary-link"><FileWarning size={16} /> Hata Merkezi</Link>
          <Link to="/queue" className="button-link secondary-link"><ServerCog size={16} /> Queue Merkezi</Link>
          <Link to="/marketplaces" className="button-link"><RadioTower size={16} /> Pazaryerleri</Link>
        </div>
      </section>

      <section className="operations-stat-grid">
        <OperationStatCard title="API Cagrisi" value={metric(data.dashboard, 'API Cagrisi')} subtitle="Toplam kayitli API logu" icon={Activity} tone="blue" />
        <OperationStatCard title="Bekleyen Queue" value={queueStats.queued || 0} subtitle={`${queueStats.running || 0} calisan job`} icon={Workflow} tone="purple" />
        <OperationStatCard title="Basarisiz API" value={failedLogs.length} subtitle={topErrorService ? `${topErrorService[0]} en cok hata verdi` : 'Kritik hata yok'} icon={FileWarning} tone={failedLogs.length ? 'red' : 'green'} />
        <OperationStatCard title="Son 24 Saat Siparis" value={sumStatus(orderBreakdown, ['new', 'pending', 'processing', 'preparing', 'ready_to_ship'])} subtitle={`${metric(data.dashboard, 'Siparis')} toplam siparis`} icon={ShoppingBag} tone="green" />
        <OperationStatCard title="Import Kaydi" value={data.imports.length} subtitle={lastImport ? `Son import ${formatDate(lastImport.created_at)}` : 'Import kaydi yok'} icon={UploadCloud} tone="orange" />
      </section>

      <section className="operations-grid">
        <section className="panel operations-dark-panel">
          <div className="section-title-row">
            <h2>Sistem Sagligi</h2>
            <span className={data.health?.status === 'healthy' ? 'badge active' : 'badge failed'}>{data.health?.status || 'unknown'}</span>
          </div>
          <div className="health-status-grid">
            {Object.entries(asObject(data.health?.checks)).map(([name, status]) => <HealthStatusCard name={name} status={status} key={name} />)}
            <HealthStatusCard name="redis" status={data.queue?.redis?.connected} detail={data.queue?.redis?.message} />
          </div>
        </section>

        <QueueOverviewCard stats={queueStats} redis={data.queue?.redis} />

        <section className="panel marketplace-health-section">
          <div className="section-title-row">
            <h2>Pazaryeri Operasyonlari</h2>
            <Link to="/marketplaces" className="button-link secondary-link">Hesaplari Ac</Link>
          </div>
          <div className="marketplace-health-grid">
            <MarketplaceHealthCard name="trendyol" account={data.marketplaces.find((item) => item.code === 'trendyol')} logs={data.logs} runs={asArray(data.queue?.recent_runs)} />
            <MarketplaceHealthCard name="hepsiburada" account={data.marketplaces.find((item) => item.code === 'hepsiburada')} logs={data.logs} runs={asArray(data.queue?.recent_runs)} />
          </div>
        </section>

        <section className="panel">
          <div className="section-title-row">
            <h2>Siparis Akisi</h2>
            <Link to="/orders" className="button-link secondary-link">Siparisler</Link>
          </div>
          <div className="order-flow-grid">
            <div><span>Bekleyen</span><strong>{sumStatus(orderBreakdown, ['new', 'pending'])}</strong></div>
            <div><span>Kargoya hazir</span><strong>{sumStatus(orderBreakdown, ['ready_to_ship']) || sumStatus(shippingBreakdown, ['queued', 'created'])}</strong></div>
            <div><span>Iade bekleyen</span><strong>{sumStatus(orderBreakdown, ['returned', 'cancel_returned', 'refunded'])}</strong></div>
            <div><span>Basarisiz odeme</span><strong>{sumStatus(paymentBreakdown, ['failed'])}</strong></div>
          </div>
        </section>

        <section className="panel import-monitor-panel">
          <div className="section-title-row">
            <h2>Import / XML Merkezi</h2>
            <Link to="/products/import" className="button-link secondary-link">Import Ac</Link>
          </div>
          {data.imports.length === 0 ? (
            <div className="operation-empty"><UploadCloud size={22} /><span>Import kaydi yok.</span></div>
          ) : (
            <div className="import-live-grid">
              <div><span>Son import</span><strong>{lastImport?.name || lastImport?.file_name || lastImport?.status || '-'}</strong></div>
              <div><span>Basarili urun</span><strong>{lastImport?.success_count || lastImport?.processed_rows || 0}</strong></div>
              <div><span>Hatali urun</span><strong>{lastImport?.failed_rows || lastImport?.error_count || 0}</strong></div>
              <div><span>Son XML</span><strong>{formatDate(lastXml?.updated_at || lastXml?.created_at)}</strong></div>
            </div>
          )}
        </section>

        <section className="panel api-summary-panel">
          <div className="section-title-row">
            <h2>API Log Ozeti</h2>
            <Link to="/api-logs" className="button-link secondary-link">Hata Merkezi</Link>
          </div>
          <div className="api-summary-grid">
            <div><span>Son kritik hata</span><strong>{failedLogs[0] ? `${serviceName(failedLogs[0])} HTTP ${failedLogs[0].status_code}` : 'Yok'}</strong></div>
            <div><span>Son basarili cagri</span><strong>{successLogs[0] ? `${serviceName(successLogs[0])} ${successLogs[0].method}` : 'Yok'}</strong></div>
            <div><span>En cok hata</span><strong>{topErrorService ? `${topErrorService[0]} (${topErrorService[1]})` : 'Yok'}</strong></div>
            <div><span>Rate limit</span><strong>{data.logs.some((log) => Number(log.status_code) === 429) ? 'Uyari var' : 'Normal'}</strong></div>
          </div>
        </section>

        <OperationAlertList alerts={alerts} />
        <ActivityTimeline title="Canli Aktivite" items={recentTimeline} emptyText="Siparis veya API aktivitesi henuz yok." />

        <section className="panel operation-links-panel">
          <h2>Hizli Gecisler</h2>
          <div className="quick-actions-grid">
            <Link to="/queue"><ServerCog size={17} /> Queue</Link>
            <Link to="/api-logs"><AlertTriangle size={17} /> Hata Merkezi</Link>
            <Link to="/marketplaces/onboarding"><Gauge size={17} /> Kurulum Sihirbazi</Link>
            <Link to="/resources"><Database size={17} /> Developer Center</Link>
            <Link to="/products/import"><UploadCloud size={17} /> Import Merkezi</Link>
            <Link to="/shipping"><Truck size={17} /> Kargo Operasyonu</Link>
          </div>
        </section>
      </section>
    </div>
  );
}
