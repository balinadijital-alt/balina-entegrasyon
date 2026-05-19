export function StatusBadge({ tone = '', label, children, className = '' }) {
  const classes = ['badge', tone, className].filter(Boolean).join(' ');

  return <span className={classes}>{children || label}</span>;
}
