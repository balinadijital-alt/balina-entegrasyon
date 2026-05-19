export function DetailItem({ label, value, className = '' }) {
  return (
    <div className={className || undefined}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
