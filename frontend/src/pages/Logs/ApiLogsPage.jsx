import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { DataTable } from '../../components/DataTable.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';

export function ApiLogsPage() {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    api('/api-logs').then((response) => setLogs(response.data || []));
  }, []);

  return (
    <>
      <PageHeader title="API Loglari" />
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
    </>
  );
}
