export function ErrorState({ message, onRetry }) {
  return (
    <div className="state-box error-state">
      <span>{message}</span>
      {onRetry && <button type="button" onClick={onRetry}>Tekrar Dene</button>}
    </div>
  );
}
