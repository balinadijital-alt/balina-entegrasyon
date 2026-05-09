import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { DataTable } from '../../components/DataTable.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';

export function OrdersPage() {
  const { notify } = useApp();
  const { loading, error, run } = useAsync();
  const [orders, setOrders] = useState([]);
  const [shippingAccounts, setShippingAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');

  const load = async () => {
    await run(async () => {
      const [response, accountResponse] = await Promise.all([api.orders.list(), api.shipping.accounts()]);
      setOrders(response.data || []);
      setShippingAccounts(accountResponse.data || []);
      setSelectedAccountId((accountResponse.data || [])[0]?.id || '');
    });
  };

  useEffect(() => {
    load();
  }, []);

  const createShipment = async (orderId) => {
    if (!selectedAccountId) {
      notify('error', 'Kargo hesabi seciniz.');
      return;
    }

    await run(async () => {
      const response = await api.shipping.createShipment(orderId, { shipping_account_id: selectedAccountId });
      notify('success', response.message);
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  return (
    <>
      <PageHeader title="Siparis Yonetimi" />
      <section className="panel compact-panel">
        <h2>Siparis Kargo Islemleri</h2>
        <select value={selectedAccountId} onChange={(event) => setSelectedAccountId(event.target.value)}>
          <option value="">Kargo hesabi seciniz</option>
          {shippingAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} - {account.carrier?.name}</option>)}
        </select>
      </section>
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
          { key: 'shipment', label: 'Kargo', render: (row) => row.shipments?.[0] ? <span className={`badge ${row.shipments[0].status}`}>{row.shipments[0].tracking_number || row.shipments[0].status}</span> : '-' },
          { key: 'actions', label: 'Islem', render: (row) => <div className="row-actions"><button type="button" disabled={loading} onClick={() => createShipment(row.id)}>Kargo Olustur</button></div> },
        ]}
      />
      )}
    </>
  );
}
