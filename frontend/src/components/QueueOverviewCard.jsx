export function QueueOverviewCard({ stats = {}, redis }) {
  const total = Math.max(1, Number(stats.queued || 0) + Number(stats.running || 0) + Number(stats.completed || 0) + Number(stats.failed || 0));
  const completed = Math.round((Number(stats.completed || 0) / total) * 100);

  return (
    <section className="panel queue-overview-card">
      <div className="section-title-row">
        <h2>Canli Queue Izleme</h2>
        <span className={redis?.connected ? 'badge active' : 'badge failed'}>{redis?.connected ? 'Redis bagli' : 'Redis uyari'}</span>
      </div>
      <div className="queue-live-grid">
        <div><span>Pending jobs</span><strong>{stats.queued || 0}</strong></div>
        <div><span>Running jobs</span><strong>{stats.running || 0}</strong></div>
        <div><span>Failed jobs</span><strong>{stats.failed_jobs || stats.failed || 0}</strong></div>
        <div><span>Tamamlanan</span><strong>{stats.completed || 0}</strong></div>
      </div>
      <div className="operation-progress"><span style={{ width: `${completed}%` }} /></div>
      <small>{redis?.message || 'Queue durumu izleniyor.'}</small>
    </section>
  );
}
