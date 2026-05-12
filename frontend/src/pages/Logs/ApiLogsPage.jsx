import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { DataTable } from '../../components/DataTable.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { PageToolbar } from '../../components/PageToolbar.jsx';
import { useAsync } from '../../hooks/useAsync.js';

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
          return !query || [log.marketplace_code, log.method, log.endpoint, log.status_code].some((value) => String(value || '').toLowerCase().includes(query));
        })}
        emptyTitle="Hata kaydi yok"
        emptyText="Pazaryeri islemlerinde hata veya uyari olustugunda burada gorunur."
        columns={[
          { key: 'marketplace_code', label: 'Pazaryeri' },
          { key: 'method', label: 'Islem Turu' },
          { key: 'endpoint', label: 'Islem Adresi' },
          { key: 'status_code', label: 'Durum Kodu' },
          { key: 'duration_ms', label: 'Sure' },
          { key: 'created_at', label: 'Tarih' },
        ]}
      />
      )}
    </>
  );
}
