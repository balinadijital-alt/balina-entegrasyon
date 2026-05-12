import { AlertTriangle, CheckCircle2 } from 'lucide-react';

export function OperationAlertList({ alerts = [] }) {
  return (
    <section className="panel operation-alert-panel">
      <div className="section-title-row">
        <h2>Operasyon Uyarilari</h2>
        <span className={alerts.length > 0 ? 'badge failed' : 'badge active'}>{alerts.length || 'Temiz'}</span>
      </div>
      {alerts.length === 0 ? (
        <div className="operation-empty"><CheckCircle2 size={22} /><span>Kritik operasyon uyarisi yok.</span></div>
      ) : alerts.map((alert) => (
        <div className={`operation-alert-row ${alert.tone || 'warning'}`} key={alert.title}>
          <AlertTriangle size={17} />
          <div>
            <strong>{alert.title}</strong>
            <span>{alert.message}</span>
          </div>
        </div>
      ))}
    </section>
  );
}
