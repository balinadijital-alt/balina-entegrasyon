import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { DataTable } from '../../components/DataTable.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { useAsync } from '../../hooks/useAsync.js';

export function ApiLogsPage() {
  const { loading, error, run } = useAsync();
  const [logs, setLogs] = useState([]);

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
      <PageHeader title="API Loglari" />
      {error && <ErrorState message={error} onRetry={load} />}
      {loading && logs.length === 0 ? <LoadingState /> : (
      <DataTable
        rows={logs}
        columns={[
          { key: 'marketplace_code', label: 'Pazaryeri' },
          { key: 'method', label: 'Metod' },
          { key: 'endpoint', label: 'Endpoint' },
          { key: 'status_code', label: 'Durum Kodu' },
          { key: 'duration_ms', label: 'Sure' },
          { key: 'created_at', label: 'Tarih' },
        ]}
      />
      )}
    </>
  );
}
