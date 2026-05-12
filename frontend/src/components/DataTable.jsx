import { ChevronLeft, ChevronRight, Download, PackageOpen, SlidersHorizontal } from 'lucide-react';

export function DataTable({ columns, rows, emptyText = 'Kayit bulunamadi.', emptyTitle = 'Kayit yok' }) {
  return (
    <div className="table-wrap">
      <div className="table-meta">
        <div>
          <span>{rows.length} kayit</span>
          <div className="filter-chips">
            <small><SlidersHorizontal size={13} /> Filtre</small>
            <small>Durum</small>
            <small>Tarih</small>
          </div>
        </div>
        <div className="table-tools">
          <button type="button" className="icon-button"><Download size={14} /> CSV</button>
          <button type="button" className="icon-button"><ChevronLeft size={14} /></button>
          <small>1 / 1</small>
          <button type="button" className="icon-button"><ChevronRight size={14} /></button>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="empty-cell">
                <div className="empty-state">
                  <PackageOpen size={26} />
                  <strong>{emptyTitle}</strong>
                  <span>{emptyText}</span>
                </div>
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id}>
                {columns.map((column) => (
                  <td key={column.key}>{column.render ? column.render(row) : row[column.key]}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
