import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { DataTable } from '../../components/DataTable.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { useAsync } from '../../hooks/useAsync.js';

export function OrdersPage() {
  const { loading, error, run } = useAsync();
  const [orders, setOrders] = useState([]);

  const load = async () => {
    await run(async () => {
      const response = await api.orders.list();
      setOrders(response.data || []);
    });
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <>
      <PageHeader title="Siparis Yonetimi" />
      {error && <ErrorState message={error} onRetry={load} />}
      {loading && orders.length === 0 ? <LoadingState /> : (
      <DataTable
        rows={orders}
        columns={[
          { key: 'marketplace_code', label: 'Pazaryeri' },
          { key: 'marketplace_order_id', label: 'Siparis No' },
          { key: 'company', label: 'Firma', render: (row) => row.company?.name },
          { key: 'customer_name', label: 'Musteri' },
          { key: 'total_amount', label: 'Tutar' },
          { key: 'status', label: 'Durum' },
        ]}
      />
      )}
    </>
  );
}
