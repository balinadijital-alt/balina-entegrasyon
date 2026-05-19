export function SoftEmpty({ icon, title, text, actions, children, className = '' }) {
  const classes = ['soft-empty', className].filter(Boolean).join(' ');

  return (
    <div className={classes}>
      {children || (
        <>
          {icon}
          {title && <strong>{title}</strong>}
          {text && <span>{text}</span>}
          {actions}
        </>
      )}
    </div>
  );
}
