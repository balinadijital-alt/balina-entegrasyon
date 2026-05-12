export function ActivityTimeline({ title, items = [], emptyText = 'Kayit bulunamadi.' }) {
  return (
    <section className="panel activity-timeline-panel">
      <h2>{title}</h2>
      {items.length === 0 ? (
        <div className="operation-empty"><span>{emptyText}</span></div>
      ) : items.map((item) => (
        <div className="activity-timeline-row" key={item.id || `${item.title}-${item.time}`}>
          <span />
          <div>
            <strong>{item.title}</strong>
            <small>{item.description}</small>
          </div>
          <em>{item.time}</em>
        </div>
      ))}
    </section>
  );
}
