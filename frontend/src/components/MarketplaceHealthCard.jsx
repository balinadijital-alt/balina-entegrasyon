export function MarketplaceHealthCard({ name, account, logs = [], runs = [] }) {
  const failures = logs.filter((log) => String(log.marketplace_code || '').toLowerCase() === name.toLowerCase() && Number(log.status_code || 0) >= 400);
  const pending = runs.filter((run) => String(run.marketplace?.code || '').toLowerCase() === name.toLowerCase() && ['queued', 'running'].includes(run.status));
  const connected = account?.connection_status === 'connected' || (!account?.last_error && failures.length === 0);

  return (
    <article className="marketplace-health-panel">
      <div>
        <span>{name}</span>
        <strong>{connected ? 'Stabil' : 'Kontrol gerekli'}</strong>
      </div>
      <span className={connected ? 'status-pill ready' : 'status-pill blocked'}>{account ? 'Hesap var' : 'Hesap yok'}</span>
      <div className="marketplace-health-metrics">
        <div><small>Son senkron</small><b>{account?.last_product_sync_at || account?.last_order_sync_at ? new Date(account.last_product_sync_at || account.last_order_sync_at).toLocaleString('tr-TR') : '-'}</b></div>
        <div><small>Bekleyen</small><b>{pending.length}</b></div>
        <div><small>Basarisiz</small><b>{failures.length + (account?.last_error ? 1 : 0)}</b></div>
      </div>
    </article>
  );
}
