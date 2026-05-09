import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { api } from '../../api/client.js';
import { DataTable } from '../../components/DataTable.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';

export function QueuePage() {
  const { notify } = useApp();
  const { loading, error, run } = useAsync();
  const [status, setStatus] = useState(null);

  const load = async () => {
    await run(async () => {
      setStatus(await api.queue.status());
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
      notify('success', response.message);
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  const stats = status?.stats || {};
  const progressTotal = Math.max(1, (stats.queued || 0) + (stats.running || 0) + (stats.completed || 0) + (stats.failed || 0));
  const progress = Math.round(((stats.completed || 0) / progressTotal) * 100);

  return (
    <>
      <PageHeader title="Queue Durumu" />
      {error && <ErrorState message={error} onRetry={load} />}
      {loading && !status ? <LoadingState /> : null}
      {status && (
        <>
          <section className="panel">
            <div className="queue-summary">
              <div>
                <span>Redis</span>
                <strong className={status.redis.connected ? 'ok-text' : 'bad-text'}>{status.redis.connected ? 'Bagli' : 'Baglanti Yok'}</strong>
                <small>{status.redis.message}</small>
              </div>
              <div><span>Kuyrukta</span><strong>{stats.queued}</strong></div>
              <div><span>Calisan</span><strong>{stats.running}</strong></div>
              <div><span>Tamamlanan</span><strong>{stats.completed}</strong></div>
              <div><span>Basarisiz</span><strong>{stats.failed_jobs}</strong></div>
            </div>
            <div className="progress">
              <span style={{ width: `${progress}%` }} />
            </div>
          </section>

          <DataTable
            rows={status.recent_runs || []}
            columns={[
              { key: 'type', label: 'Islem' },
              { key: 'status', label: 'Durum', render: (row) => <span className={`badge ${row.status}`}>{row.status}</span> },
              { key: 'marketplace', label: 'Firma', render: (row) => row.marketplace?.company?.name || '-' },
              { key: 'processed_count', label: 'Adet' },
              { key: 'duration_ms', label: 'Sure', render: (row) => row.duration_ms ? `${row.duration_ms} ms` : '-' },
              { key: 'message', label: 'Mesaj', render: (row) => row.error_message || row.message || '-' },
            ]}
          />

          <section className="panel">
            <h2>Basarisiz Joblar</h2>
            <DataTable
              rows={(status.failed_jobs || []).map((job) => ({ ...job, id: job.uuid }))}
              columns={[
                { key: 'uuid', label: 'UUID' },
                { key: 'queue', label: 'Queue' },
                { key: 'failed_at', label: 'Tarih' },
                { key: 'actions', label: 'Islem', render: (row) => <button type="button" onClick={() => retry(row.uuid)}><RotateCcw size={15} /> Retry</button> },
              ]}
            />
          </section>

          <section className="panel">
            <h2>Queue Bildirimleri</h2>
            <DataTable
              rows={status.notifications || []}
              columns={[
                { key: 'level', label: 'Seviye' },
                { key: 'title', label: 'Baslik' },
                { key: 'message', label: 'Mesaj' },
                { key: 'created_at', label: 'Tarih' },
              ]}
            />
          </section>
        </>
      )}
    </>
  );
}
