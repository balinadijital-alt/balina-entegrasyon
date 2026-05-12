export function MarketplaceOptionCard({ option, selected, onSelect }) {
  const Icon = option.icon;

  return (
    <button type="button" className={selected ? 'marketplace-option-card selected' : 'marketplace-option-card'} disabled={option.disabled} onClick={onSelect}>
      <span className="marketplace-option-icon"><Icon size={22} /></span>
      <strong>{option.name}</strong>
      <small>{option.description}</small>
      <span className={option.disabled ? 'status-pill blocked' : 'status-pill ready'}>{option.status}</span>
    </button>
  );
}
