export function StatusPill({ tone = '', label, children, className = '' }) {
  const classes = ['status-pill', tone, className].filter(Boolean).join(' ');

  return <span className={classes}>{children || label}</span>;
}
