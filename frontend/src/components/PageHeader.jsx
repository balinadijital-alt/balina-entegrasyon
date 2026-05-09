export function PageHeader({ title, actions }) {
  return (
    <div className="page-header">
      <h1>{title}</h1>
      <div className="page-actions">{actions}</div>
    </div>
  );
}
