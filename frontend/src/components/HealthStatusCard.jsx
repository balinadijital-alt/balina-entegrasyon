const labels = {
  app: 'API',
  database: 'Database',
  cache: 'Cache',
  queue: 'Queue',
  storage: 'Storage',
  redis: 'Redis',
};

export function HealthStatusCard({ name, status, detail }) {
  const healthy = status === 'ok' || status === true || status === 'connected';

  return (
    <div className={healthy ? 'health-status-card healthy' : 'health-status-card degraded'}>
      <span className={healthy ? 'health-pulse online' : 'health-pulse warning'} />
      <div>
        <strong>{labels[name] || name}</strong>
        <small>{detail || (healthy ? 'Calisiyor' : 'Kontrol gerekli')}</small>
      </div>
      <em>{healthy ? 'OK' : 'Uyari'}</em>
    </div>
  );
}
