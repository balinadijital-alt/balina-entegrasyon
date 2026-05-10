import { useEffect, useState } from 'react';
import { api } from '../../api/client.js';
import { DataTable } from '../../components/DataTable.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { PageToolbar } from '../../components/PageToolbar.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';

export function OrdersPage() {
  const { notify } = useApp();
  const { loading, error, run } = useAsync();
  const [orders, setOrders] = useState([]);
  const [shippingAccounts, setShippingAccounts] = useState([]);
  const [paymentAccounts, setPaymentAccounts] = useState([]);
  const [accountingAccounts, setAccountingAccounts] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [selectedPaymentAccountId, setSelectedPaymentAccountId] = useState('');
  const [selectedAccountingAccountId, setSelectedAccountingAccountId] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

  const load = async () => {
    await run(async () => {
      const [response, accountResponse, paymentResponse, accountingResponse] = await Promise.all([api.orders.list(), api.shipping.accounts(), api.payments.accounts(), api.accounting.accounts()]);
      setOrders(response.data || []);
      setShippingAccounts(accountResponse.data || []);
      setPaymentAccounts(paymentResponse.data || []);
      setAccountingAccounts(accountingResponse.data || []);
      setSelectedAccountId((accountResponse.data || [])[0]?.id || '');
      setSelectedPaymentAccountId((paymentResponse.data || [])[0]?.id || '');
      setSelectedAccountingAccountId((accountingResponse.data || [])[0]?.id || '');
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

  const createPayment = async (order) => {
    if (!selectedPaymentAccountId) {
      notify('error', 'POS hesabi seciniz.');
      return;
    }

    await run(async () => {
      const payment = await api.payments.create(order.id, { payment_account_id: selectedPaymentAccountId, amount: order.total_amount, method: 'three_d' });
      notify('success', payment.payment_url ? 'Odeme linki olusturuldu.' : 'Odeme kaydi olusturuldu.');
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  const createInvoice = async (orderId) => {
    if (!selectedAccountingAccountId) {
      notify('error', 'Muhasebe entegrasyon hesabi seciniz.');
      return;
    }
    await run(async () => {
      const response = await api.accounting.createInvoice(orderId, { accounting_account_id: selectedAccountingAccountId, type: 'earchive' });
      notify('success', response.message);
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  return (
    <>
      <PageHeader title="Siparis Yonetimi" />
      <PageToolbar
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Siparis no veya musteri ara"
        filters={(
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Tum durumlar</option>
            <option value="new">Yeni</option>
            <option value="processing">Hazirlaniyor</option>
            <option value="shipped">Kargoda</option>
            <option value="delivered">Teslim</option>
            <option value="cancelled">Iptal</option>
          </select>
        )}
      />
      <section className="panel compact-panel">
        <h2>Siparis Kargo Islemleri</h2>
        <select value={selectedAccountId} onChange={(event) => setSelectedAccountId(event.target.value)}>
          <option value="">Kargo hesabi seciniz</option>
          {shippingAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} - {account.carrier?.name}</option>)}
        </select>
        <select value={selectedPaymentAccountId} onChange={(event) => setSelectedPaymentAccountId(event.target.value)}>
          <option value="">POS hesabi seciniz</option>
          {paymentAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} - {account.provider?.name}</option>)}
        </select>
        <select value={selectedAccountingAccountId} onChange={(event) => setSelectedAccountingAccountId(event.target.value)}>
          <option value="">Muhasebe hesabi seciniz</option>
          {accountingAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} - {account.integration?.name}</option>)}
        </select>
      </section>
      {error && <ErrorState message={error} onRetry={load} />}
      {loading && orders.length === 0 ? <LoadingState /> : (
      <DataTable
        rows={orders.filter((order) => {
          const query = search.trim().toLowerCase();
          const matchesSearch = !query || [order.marketplace_order_id, order.customer_name, order.company?.name].some((value) => String(value || '').toLowerCase().includes(query));
          const matchesStatus = !status || order.status === status;
          return matchesSearch && matchesStatus;
        })}
        emptyTitle="Siparis bulunamadi"
        emptyText="Filtreleri temizleyin veya pazaryeri siparis senkronizasyonunu calistirin."
        columns={[
          { key: 'marketplace_code', label: 'Pazaryeri' },
          { key: 'marketplace_order_id', label: 'Siparis No' },
          { key: 'company', label: 'Firma', render: (row) => row.company?.name },
          { key: 'customer_name', label: 'Musteri' },
          { key: 'total_amount', label: 'Tutar' },
          { key: 'status', label: 'Durum' },
          { key: 'payment', label: 'Odeme', render: (row) => row.payments?.[0] ? <span className={`badge ${row.payments[0].status}`}>{row.payments[0].status}</span> : '-' },
          { key: 'invoice', label: 'Fatura', render: (row) => row.invoices?.[0] ? <span className={`badge ${row.invoices[0].status}`}>{row.invoices[0].invoice_number || row.invoices[0].status}</span> : '-' },
          { key: 'shipment', label: 'Kargo', render: (row) => row.shipments?.[0] ? <span className={`badge ${row.shipments[0].status}`}>{row.shipments[0].tracking_number || row.shipments[0].status}</span> : '-' },
          { key: 'actions', label: 'Islem', render: (row) => <div className="row-actions"><button type="button" disabled={loading} onClick={() => createPayment(row)}>Odeme Linki</button><button type="button" disabled={loading} onClick={() => createInvoice(row.id)}>Fatura</button><button type="button" disabled={loading} onClick={() => createShipment(row.id)}>Kargo Olustur</button></div> },
        ]}
      />
      )}
    </>
  );
}
