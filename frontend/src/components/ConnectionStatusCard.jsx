import { AlertTriangle, CheckCircle2, Clock3 } from 'lucide-react';

const icons = {
  success: CheckCircle2,
  error: AlertTriangle,
  idle: Clock3,
};

export function ConnectionStatusCard({ status = 'idle', title, message }) {
  const Icon = icons[status] || Clock3;

  return (
    <div className={`connection-status-card ${status}`}>
      <Icon size={22} />
      <div>
        <strong>{title}</strong>
        <span>{message}</span>
      </div>
    </div>
  );
}
