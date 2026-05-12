import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import { DataTable } from '../../components/DataTable.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { PageToolbar } from '../../components/PageToolbar.jsx';
import { useAsync } from '../../hooks/useAsync.js';

function friendlyError(log) {
  const endpoint = String(log.endpoint || '').toLowerCase();
  const status = Number(log.status_code || 0);
  if (endpoint.includes('category')) return `${log.marketplace_code || 'Pazaryeri'}: Kategori eslesmesi bulunamadi`;
  if (endpoint.includes('product')) return `${log.marketplace_code || 'Pazaryeri'}: Urun bilgisinde eksik alan var`;
  if (endpoint.includes('image')) return 'Gorsel zorunlu';
  if (status === 401) return `${log.marketplace_code || 'Pazaryeri'}: Baglanti bilgileri hatali`;
  if (status >= 500) return `${log.marketplace_code || 'Pazaryeri'}: Pazaryeri gecici hata verdi`;
  return `${log.marketplace_code || 'Pazaryeri'}: Islem kontrol edilmeli`;
}

function fixLink(log) {
  const endpoint = String(log.endpoint || '').toLowerCase();
  if (endpoint.includes('category')) return '/products/category-mapping';
  if (endpoint.includes('product') || endpoint.includes('image')) return '/products';
  return '/marketplaces';
}

export function ApiLogsPage() {
  const { loading, error, run } = useAsync();
  const [logs, setLogs] = useState([]);
  const [search, setSearch] = useState('');

  const load = async () => {
    await run(async () => {
      const response = await api.logs.list();
      setLogs(response.data || []);
    });
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <>
      <PageHeader title="Hata Merkezi" />
      <PageToolbar search={search} onSearch={setSearch} searchPlaceholder="Pazaryeri, islem veya durum ara" />
      {error && <ErrorState message={error} onRetry={load} />}
      {loading && logs.length === 0 ? <LoadingState /> : (
      <DataTable
        rows={logs.filter((log) => {
          const query = search.trim().toLowerCase();
          const failed = Number(log.status_code || 0) >= 400;
          const matches = !query || [log.marketplace_code, log.method, log.endpoint, log.status_code].some((value) => String(value || '').toLowerCase().includes(query));
          return failed && matches;
        })}
        emptyTitle="Hata kaydi yok"
        emptyText="Pazaryeri islemlerinde hata veya uyari olustugunda burada gorunur."
        columns={[
          { key: 'marketplace_code', label: 'Pazaryeri' },
          { key: 'message', label: 'Hata', render: (row) => friendlyError(row) },
          { key: 'status_code', label: 'Durum Kodu' },
          { key: 'created_at', label: 'Tarih' },
          { key: 'actions', label: 'Islem', render: (row) => <Link className="button-link secondary-link" to={fixLink(row)}>Duzelt</Link> },
        ]}
      />
      )}
    </>
  );
}
