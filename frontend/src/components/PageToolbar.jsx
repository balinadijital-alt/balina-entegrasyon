import { Search } from 'lucide-react';

export function PageToolbar({ search, onSearch, searchPlaceholder = 'Ara...', filters, actions }) {
  return (
    <div className="page-toolbar">
      {onSearch && (
        <label className="toolbar-search">
          <Search size={17} />
          <input value={search} onChange={(event) => onSearch(event.target.value)} placeholder={searchPlaceholder} />
        </label>
      )}
      {filters && <div className="toolbar-filters">{filters}</div>}
      {actions && <div className="toolbar-actions">{actions}</div>}
    </div>
  );
}
