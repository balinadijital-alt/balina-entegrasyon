import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { DataTable } from '../../components/DataTable.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';

export function OrdersPage() {
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    api('/orders').then((response) => setOrders(response.data || []));
  }, []);

  return (
    <>
      <PageHeader title="Siparis Yonetimi" />
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
    </>
  );
}
