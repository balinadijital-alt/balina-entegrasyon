export function MetricCard({ icon, label, value, subtitle, tone = '', className = '' }) {
  const classes = [className, tone].filter(Boolean).join(' ');

  return (
    <div className={classes}>
      <span>{icon}</span>
      <strong>{value}</strong>
      <p>{label}</p>
      {subtitle && <small>{subtitle}</small>}
    </div>
  );
}
