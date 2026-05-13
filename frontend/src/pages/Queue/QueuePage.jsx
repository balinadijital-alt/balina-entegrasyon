import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Eye, PlayCircle, RadioTower, RefreshCcw, RotateCcw, ServerCog, Timer, Workflow } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import { DataTable } from '../../components/DataTable.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
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
  const { notify } = useApp();
  const { loading, error, run } = useAsync();
  const [status, setStatus] = useState(null);
  const [selectedJob, setSelectedJob] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  const load = async () => {
    await run(async () => {
      const response = await api.queue.status();
      setStatus(response);
      setSelectedJob((current) => current || response.failed_jobs?.[0] || null);
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

  const stats = status?.stats || {};
  const failedJobs = (status?.failed_jobs || []).map((job) => ({ ...job, id: job.uuid }));
  const lastFailedJob = failedJobs[0] || null;
  const progressTotal = Math.max(1, Number(stats.queued || 0) + Number(stats.running || 0) + Number(stats.completed || 0) + Number(stats.failed || 0));
  const completedProgress = Math.round((Number(stats.completed || 0) / progressTotal) * 100);
  const queueHealthy = Boolean(status?.redis?.connected) && Number(stats.failed_jobs || 0) === 0;
  const jobPayload = useMemo(() => parsePayload(selectedJob?.payload), [selectedJob]);
  const selectedModule = selectedJob ? jobModule(selectedJob) : null;

  return (
    <>
      <PageHeader
        title="Queue Retry Merkezi"
        description="Bekleyen, calisan ve basarisiz joblari izleyin; failed job detaylarini inceleyip retry aksiyonlarini yonetin."
        actions={<button type="button" onClick={load} disabled={loading}><RefreshCcw size={16} /> Yenile</button>}
      />
      {error && <ErrorState message={error} onRetry={load} />}
      {loading && !status ? <LoadingState /> : null}

      {status && (
        <>
          <section className="retry-hero-panel">
            <div>
              <span className="eyebrow"><RadioTower size={15} /> Queue Health</span>
              <h2>{queueHealthy ? 'Queue saglikli calisiyor.' : 'Queue kontrol istiyor.'}</h2>
              <p>Redis baglantisi, bekleyen isler, calisan joblar ve failed job kayitlari 15 saniyede bir yenilenir.</p>
            </div>
            <div className="retry-health-card">
              <span className={status.redis.connected ? 'health-dot online' : 'health-dot warning'} />
              <strong>{status.redis.connected ? 'Redis bagli' : 'Redis baglantisi yok'}</strong>
              <small>{status.redis.message || '-'}</small>
              <div className="progress"><span style={{ width: `${completedProgress}%` }} /></div>
            </div>
          </section>

          <section className="retry-stat-grid">
            <div className="retry-stat-card"><Clock3 size={19} /><span>Pending jobs</span><strong>{stats.queued || 0}</strong><small>Kuyrukta bekleyen is</small></div>
            <div className="retry-stat-card danger"><AlertTriangle size={19} /><span>Failed jobs</span><strong>{stats.failed_jobs || 0}</strong><small>Retry bekleyen job</small></div>
            <div className="retry-stat-card"><PlayCircle size={19} /><span>Running jobs</span><strong>{stats.running || 0}</strong><small>Su anda calisan</small></div>
            <div className="retry-stat-card success"><RotateCcw size={19} /><span>Retry edilen</span><strong>{retryCount}</strong><small>Bu oturumda tekrar denendi</small></div>
            <div className="retry-stat-card warning"><ServerCog size={19} /><span>Son basarisiz job</span><strong>{lastFailedJob ? jobName(lastFailedJob) : 'Yok'}</strong><small>{lastFailedJob ? formatDate(lastFailedJob.failed_at) : 'Failed job yok'}</small></div>
          </section>

          <section className="retry-layout">
            <section className="panel">
              <div className="section-title-row">
                <h2>Failed Job Listesi</h2>
                <span className={failedJobs.length ? 'badge failed' : 'badge active'}>{failedJobs.length || 'Temiz'}</span>
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
                        <button type="button" disabled={loading} onClick={() => retry(row.uuid)}><RotateCcw size={15} /> Retry</button>
                      </div>
                    ),
                  },
                ]}
              />
            </section>

            <aside className="panel retry-detail-panel">
              <div className="section-title-row">
                <h2>Job Detayi</h2>
                {selectedJob && <span className="status-pill blocked">Failed</span>}
              </div>
              {!selectedJob ? (
                <div className="soft-empty">Detay icin failed job secin.</div>
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
                    <div><span>Job adi</span><strong>{jobName(selectedJob)}</strong></div>
                    <div><span>Queue</span><strong>{selectedJob.queue || '-'}</strong></div>
                    <div><span>Modul</span><strong>{selectedModule}</strong></div>
                    <div><span>Tarih</span><strong>{formatDate(selectedJob.failed_at)}</strong></div>
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
                    <button type="button" disabled={loading} onClick={() => retry(selectedJob.uuid)}><RotateCcw size={15} /> Retry Et</button>
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
                rows={status.recent_runs || []}
                emptyTitle="Queue islemi yok"
                emptyText="Senkronizasyon veya aktarim joblari calistikca burada gorunur."
                columns={[
                  { key: 'type', label: 'Islem' },
                  { key: 'status', label: 'Durum', render: (row) => <span className={`status-pill ${row.status === 'completed' ? 'ready' : row.status === 'failed' ? 'blocked' : 'warning'}`}>{statusLabel(row.status)}</span> },
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
                rows={status.notifications || []}
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
