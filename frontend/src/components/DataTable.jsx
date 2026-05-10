import { PackageOpen } from 'lucide-react';

export function DataTable({ columns, rows, emptyText = 'Kayit bulunamadi.', emptyTitle = 'Kayit yok' }) {
  return (
    <div className="table-wrap">
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
