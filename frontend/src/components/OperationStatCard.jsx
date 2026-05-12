export function OperationStatCard({ title, value, subtitle, icon: Icon, tone = 'neutral', progress = null }) {
  return (
    <article className={`operation-stat-card ${tone}`}>
      <div className="operation-stat-top">
        <span>{Icon && <Icon size={19} />}</span>
        {progress !== null && <small>{progress}%</small>}
      </div>
      <strong>{value}</strong>
      <p>{title}</p>
      {subtitle && <small>{subtitle}</small>}
      {progress !== null && <div className="operation-progress"><span style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} /></div>}
    </article>
  );
}
