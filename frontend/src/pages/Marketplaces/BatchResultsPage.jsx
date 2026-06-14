import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client.js';
import { DataTable } from '../../components/DataTable.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { ReferenceModuleNav } from '../../components/ReferenceModuleNav.jsx';
import { useAsync } from '../../hooks/useAsync.js';

function statusText(status) {
  if (status === 'queued') return 'Gonderildi';
  if (status === 'ready') return 'Hazir';
  if (status === 'blocked') return 'Eksik bilgi var';
  return status || '-';
}

export function BatchResultsPage() {
  const { loading, error, run } = useAsync();
  const [drafts, setDrafts] = useState([]);

  const load = async () => {
    await run(async () => {
      const response = await api.productPublish.drafts();
      setDrafts(response.data || []);
    });
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <>
      <PageHeader title="Batch Sonuclari" description="Pazaryerine gonderilen urunlerin sonucunu sade ozet olarak takip edin." />
      <ReferenceModuleNav section="marketplace" />
      {error && <ErrorState message={error} onRetry={load} />}
      {loading && drafts.length === 0 ? <LoadingState /> : (
        <DataTable
          rows={drafts}
          emptyTitle="Aktarim sonucu yok"
          emptyText="Urunleri aktarim listesinden gonderdiginde sonuclar burada gorunur."
          columns={[
            { key: 'id', label: 'Kayit' },
            { key: 'marketplace_code', label: 'Pazaryeri' },
            { key: 'status', label: 'Durum', render: (row) => statusText(row.status) },
            { key: 'result', label: 'Sonuc', render: (row) => row.result_summary?.message || row.error_message || '-' },
            { key: 'actions', label: 'Islem', render: () => <Link className="button-link secondary-link" to="/products/publish-queue">Aktarim Listesi</Link> },
          ]}
        />
      )}
    </>
  );
}
