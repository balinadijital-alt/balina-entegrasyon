import { CheckCircle2, CircleAlert } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';

export function ToastHost() {
  const { toasts } = useApp();

  return (
    <div className="toast-host">
      {toasts.map((toast) => {
        const Icon = toast.type === 'success' ? CheckCircle2 : CircleAlert;

        return (
          <div className={`toast ${toast.type}`} key={toast.id}>
            <Icon size={18} />
            <span>{toast.message}</span>
          </div>
        );
      })}
    </div>
  );
}
