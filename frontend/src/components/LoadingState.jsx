export function LoadingState({ label = 'Yukleniyor...' }) {
  return (
    <div className="state-box skeleton-state">
      <div>
        <span className="skeleton-line wide" />
        <span className="skeleton-line" />
      </div>
      <strong>{label}</strong>
    </div>
  );
}
