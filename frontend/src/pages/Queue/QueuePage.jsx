import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Eye, RefreshCcw, RotateCcw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, asArray, asObject } from '../../api/client.js';
import { hasPermission } from '../../auth/permissions.js';
import { DataTable } from '../../components/DataTable.jsx';
import { DetailItem } from '../../components/DetailItem.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { ReferenceModuleNav } from '../../components/ReferenceModuleNav.jsx';
import { SoftEmpty } from '../../components/SoftEmpty.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { StatusPill } from '../../components/StatusPill.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';

function parsePayload(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function jobName(job) {
  const payload = parsePayload(job.payload);
  const displayName = payload.displayName || payload.job || payload.data?.commandName;
  return displayName ? String(displayName).split('\\').pop() : 'Queue Job';
}

function exceptionText(job) {
  return String(job.exception || job.error || '').split('\n')[0] || 'Hata detayi kayitli degil.';
}

function jobModule(job) {
  const text = `${jobName(job)} ${job.queue || ''} ${exceptionText(job)}`.toLowerCase();
  if (text.includes('trendyol') || text.includes('hepsiburada') || text.includes('marketplace')) return 'Pazaryeri';
  if (text.includes('import') || text.includes('xml') || text.includes('excel')) return 'Import';
  if (text.includes('shipment') || text.includes('shipping') || text.includes('kargo')) return 'Kargo';
  if (text.includes('payment') || text.includes('pos')) return 'Odeme';
  if (text.includes('invoice') || text.includes('accounting')) return 'Muhasebe';
  return 'Sistem';
}

function moduleLink(module) {
  return {
    Pazaryeri: '/marketplaces',
    Import: '/products/import',
    Kargo: '/shipping',
    Odeme: '/payments',
    Muhasebe: '/accounting',
    Sistem: '/operations',
  }[module] || '/operations';
}

function friendlyJobMessage(job) {
  const module = jobModule(job);
  const exception = exceptionText(job).toLowerCase();
  if (exception.includes('timeout') || exception.includes('timed out')) return `${module}: Islem zaman asimina ugramis olabilir. Tekrar denemeden once servis durumunu kontrol edin.`;
  if (exception.includes('connection') || exception.includes('redis')) return `${module}: Baglanti veya servis erisimi kontrol edilmeli.`;
  if (exception.includes('unauthorized') || exception.includes('401')) return `${module}: Yetki veya API bilgisi hatasi olabilir.`;
  if (exception.includes('validation') || exception.includes('422')) return `${module}: Eksik veya gecersiz veri nedeniyle job tamamlanamadi.`;
  return `${module}: Job basarisiz oldu, detaydaki exception ozetini kontrol edin.`;
}

function formatDate(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function statusLabel(status) {
  return {
    queued: 'Kuyrukta',
    running: 'Calisiyor',
    completed: 'Tamamlandi',
    failed: 'Basarisiz',
  }[status] || status || '-';
}

export function QueuePage() {
  const { notify, user } = useApp();
  const { loading, error, run } = useAsync();
  const [status, setStatus] = useState(null);
  const [selectedJob, setSelectedJob] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  const load = async () => {
    await run(async () => {
      const response = await api.queue.status();
      const nextStatus = asObject(response, { stats: {}, redis: { connected: false }, failed_jobs: [], recent_runs: [], notifications: [] });
      setStatus(nextStatus);
      setSelectedJob((current) => current || asArray(nextStatus.failed_jobs)[0] || null);
    }, { onError: (message) => notify('error', message) });
  };

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 15000);
    return () => window.clearInterval(timer);
  }, []);

  const retry = async (uuid) => {
    await run(async () => {
      const response = await api.queue.retry(uuid);
      setRetryCount((current) => current + 1);
      notify('success', response.message);
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  const stats = asObject(status?.stats);
  const redis = asObject(status?.redis, { connected: false });
  const failedJobs = asArray(status?.failed_jobs).map((job) => ({ ...job, id: job.uuid }));
  const lastFailedJob = failedJobs[0] || null;
  const progressTotal = Math.max(1, Number(stats.queued || 0) + Number(stats.running || 0) + Number(stats.completed || 0) + Number(stats.failed || 0));
  const completedProgress = Math.round((Number(stats.completed || 0) / progressTotal) * 100);
  const queueHealthy = Boolean(redis.connected) && Number(stats.failed_jobs || 0) === 0;
  const jobPayload = useMemo(() => parsePayload(selectedJob?.payload), [selectedJob]);
  const selectedModule = selectedJob ? jobModule(selectedJob) : null;
  const canRetryQueue = hasPermission(user, 'queue.retry');

  return (
    <>
      <PageHeader
        title="Queue Merkezi"
        description="Bekleyen, calisan, tamamlanan ve hatali islemleri takip edin; gerekenleri guvenli sekilde tekrar deneyin."
        actions={<button type="button" onClick={load} disabled={loading}><RefreshCcw size={16} /> Yenile</button>}
      />
      <ReferenceModuleNav
        section="operations"
        note="Queue Merkezi arka planda calisan aktarim, senkronizasyon, import, kargo ve fatura islemlerinin durumunu sade bir akisla gosterir."
        next="Siradaki islem: once hatali islem sayisini kontrol edin, gerekiyorsa job detayindan ilgili module gidin veya retry aksiyonunu kullanin."
      />
      {error && <ErrorState message={error} onRetry={load} />}
      {loading && !status ? <LoadingState /> : null}

      {status && (
        <>
          <section className="queue-reference-flow" aria-label="Queue akis ozeti">
            {[
              ['1', 'Bekleyen', stats.queued || 0, 'Sirada calisacak islemler'],
              ['2', 'Calisan', stats.running || 0, 'Su an devam eden joblar'],
              ['3', 'Basarili', stats.completed || 0, 'Tamamlanan islemler'],
              ['4', 'Hatali', stats.failed_jobs || 0, 'Mudahale bekleyen joblar'],
              ['5', 'Tekrar Dene', retryCount, 'Bu oturumdaki retry'],
            ].map(([step, label, value, help]) => (
              <div key={step}>
                <strong>{step}</strong>
                <span>{label}</span>
                <small>{value} kayit</small>
                <em>{help}</em>
              </div>
            ))}
          </section>

          <section className="queue-reference-summary" aria-label="Queue kisa ozet">
            <div>
              <span>Queue Durumu</span>
              <strong>{queueHealthy ? 'Saglikli' : 'Kontrol'}</strong>
              <small>{redis.connected ? 'Redis bagli' : 'Redis baglantisi yok'}</small>
            </div>
            <div>
              <span>Basari Orani</span>
              <strong>%{completedProgress}</strong>
              <small>Tamamlanan is payi</small>
            </div>
            <div>
              <span>Hatali Islem</span>
              <strong>{stats.failed_jobs || 0}</strong>
              <small>Retry veya inceleme bekler</small>
            </div>
            <div>
              <span>Son Hata</span>
              <strong>{lastFailedJob ? jobName(lastFailedJob) : 'Yok'}</strong>
              <small>{lastFailedJob ? formatDate(lastFailedJob.failed_at) : 'Failed job yok'}</small>
            </div>
          </section>

          <section className="queue-command-row">
            <div>
              <h2>Ne yapmaliyim?</h2>
              <p>Hatali islem varsa kaydi secin, hata ozetini okuyun ve ilgili module gecerek duzeltin.</p>
            </div>
            <div>
              <Link className="button-link secondary-link" to="/api-logs">Hata Merkezi</Link>
              <Link className="button-link secondary-link" to="/operations">Operasyon Merkezi</Link>
              {canRetryQueue && selectedJob && <button type="button" disabled={loading} onClick={() => retry(selectedJob.uuid)}><RotateCcw size={15} /> Secileni Retry Et</button>}
            </div>
          </section>

          <section className={`queue-health-strip ${queueHealthy ? 'healthy' : 'warning'}`}>
            {queueHealthy ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            <div>
              <strong>{queueHealthy ? 'Arka plan islemleri normal calisiyor.' : 'Arka plan islemleri kontrol istiyor.'}</strong>
              <span>{redis.message || 'Queue durumu 15 saniyede bir otomatik yenilenir.'}</span>
            </div>
          </section>

          <section className="retry-layout">
            <section className="panel">
              <div className="section-title-row">
                <h2>Failed Job Listesi</h2>
                <StatusBadge tone={failedJobs.length ? 'failed' : 'active'} label={failedJobs.length || 'Temiz'} />
              </div>
              <DataTable
                rows={failedJobs}
                emptyTitle="Failed job yok"
                emptyText="Basarisiz queue job olustugunda burada retry aksiyonuyla gorunur."
                columns={[
                  { key: 'job', label: 'Job', render: (row) => <div className="table-product-title"><strong>{jobName(row)}</strong><span>{jobModule(row)}</span></div> },
                  { key: 'queue', label: 'Queue', render: (row) => row.queue || '-' },
                  { key: 'exception', label: 'Hata Ozeti', render: (row) => exceptionText(row) },
                  { key: 'failed_at', label: 'Tarih', render: (row) => formatDate(row.failed_at) },
                  {
                    key: 'actions',
                    label: 'Islem',
                    render: (row) => (
                      <div className="row-actions">
                        <button type="button" className="secondary-button" onClick={() => setSelectedJob(row)}><Eye size={15} /> Detay</button>
                        {canRetryQueue && <button type="button" disabled={loading} onClick={() => retry(row.uuid)}><RotateCcw size={15} /> Retry</button>}
                      </div>
                    ),
                  },
                ]}
              />
            </section>

            <aside className="panel retry-detail-panel">
              <div className="section-title-row">
                <h2>Job Detayi</h2>
                {selectedJob && <StatusPill tone="blocked" label="Failed" />}
              </div>
              {!selectedJob ? (
                <SoftEmpty>Detay icin failed job secin.</SoftEmpty>
              ) : (
                <>
                  <div className="retry-explanation-card">
                    <AlertTriangle size={18} />
                    <div>
                      <strong>{friendlyJobMessage(selectedJob)}</strong>
                      <span>{exceptionText(selectedJob)}</span>
                    </div>
                  </div>
                  <div className="retry-detail-grid">
                    <DetailItem label="Job adi" value={jobName(selectedJob)} />
                    <DetailItem label="Queue" value={selectedJob.queue || '-'} />
                    <DetailItem label="Modul" value={selectedModule} />
                    <DetailItem label="Tarih" value={formatDate(selectedJob.failed_at)} />
                  </div>
                  <details className="json-collapse" open>
                    <summary>Exception ozeti</summary>
                    <pre>{exceptionText(selectedJob)}</pre>
                  </details>
                  <details className="json-collapse">
                    <summary>Payload ozeti</summary>
                    <pre>{JSON.stringify(jobPayload, null, 2)}</pre>
                  </details>
                  <div className="row-actions">
                    {canRetryQueue && <button type="button" disabled={loading} onClick={() => retry(selectedJob.uuid)}><RotateCcw size={15} /> Retry Et</button>}
                    <Link className="button-link secondary-link" to={moduleLink(selectedModule)}>Ilgili Module Git</Link>
                  </div>
                </>
              )}
            </aside>
          </section>

          <section className="retry-lower-grid">
            <section className="panel">
              <h2>Queue Son Islemler</h2>
              <DataTable
                rows={asArray(status.recent_runs)}
                emptyTitle="Queue islemi yok"
                emptyText="Senkronizasyon veya aktarim joblari calistikca burada gorunur."
                columns={[
                  { key: 'type', label: 'Islem' },
                  { key: 'status', label: 'Durum', render: (row) => <StatusPill tone={row.status === 'completed' ? 'ready' : row.status === 'failed' ? 'blocked' : 'warning'} label={statusLabel(row.status)} /> },
                  { key: 'marketplace', label: 'Firma', render: (row) => row.marketplace?.company?.name || '-' },
                  { key: 'processed_count', label: 'Adet' },
                  { key: 'duration_ms', label: 'Sure', render: (row) => row.duration_ms ? `${row.duration_ms} ms` : '-' },
                  { key: 'message', label: 'Mesaj', render: (row) => row.error_message || row.message || '-' },
                ]}
              />
            </section>

            <section className="panel">
              <h2>Queue Bildirimleri</h2>
              <DataTable
                rows={asArray(status.notifications)}
                emptyTitle="Bildirim yok"
                emptyText="Retry, queue veya failed job bildirimi olustugunda burada gorunur."
                columns={[
                  { key: 'level', label: 'Seviye' },
                  { key: 'title', label: 'Baslik' },
                  { key: 'message', label: 'Mesaj' },
                  { key: 'created_at', label: 'Tarih', render: (row) => formatDate(row.created_at) },
                ]}
              />
            </section>
          </section>
        </>
      )}
    </>
  );
}
