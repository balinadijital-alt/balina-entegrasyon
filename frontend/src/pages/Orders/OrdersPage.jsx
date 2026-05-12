import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ClipboardList, FileText, PackageCheck, Truck } from 'lucide-react';
import { api } from '../../api/client.js';
import { DataTable } from '../../components/DataTable.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { PageToolbar } from '../../components/PageToolbar.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';

const statusTabs = [
  { key: 'new', label: 'Yeni' },
  { key: 'preparing', label: 'Hazirlaniyor' },
  { key: 'ready_to_ship', label: 'Kargoya Hazir' },
  { key: 'shipped', label: 'Kargoda' },
  { key: 'delivered', label: 'Teslim Edildi' },
  { key: 'cancelled', label: 'Iptal' },
  { key: 'returned', label: 'Iade' },
  { key: 'problematic', label: 'Sorunlu' },
];

const statusFlow = {
  new: ['preparing', 'cancelled', 'problematic'],
  preparing: ['ready_to_ship', 'cancelled', 'problematic'],
  ready_to_ship: ['shipped', 'cancelled', 'problematic'],
  shipped: ['delivered', 'returned', 'problematic'],
  delivered: ['returned'],
  problematic: ['preparing', 'cancelled', 'returned'],
  cancelled: [],
  returned: [],
};

function badge(value) {
  return value ? <span className={`badge ${value}`}>{value}</span> : '-';
}

function orderRisk(order) {
  if (order.status === 'problematic') return 'Sorunlu islem';
  if (!order.shipments?.[0] && ['preparing', 'ready_to_ship'].includes(order.status)) return 'Kargo bekliyor';
  if (!order.invoices?.[0] && ['shipped', 'delivered'].includes(order.status)) return 'Fatura bekliyor';
  if ((order.payments?.[0]?.status || order.payment_status) === 'failed') return 'Odeme hatasi';
  return 'Normal';
}

export function OrdersPage() {
  const { notify } = useApp();
  const { loading, error, run } = useAsync();
  const [orders, setOrders] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [shippingAccounts, setShippingAccounts] = useState([]);
  const [accountingAccounts, setAccountingAccounts] = useState([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState([]);
  const [bulkAction, setBulkAction] = useState('change_status');
  const [bulkStatus, setBulkStatus] = useState('preparing');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [selectedAccountingAccountId, setSelectedAccountingAccountId] = useState('');
  const [filters, setFilters] = useState({
    search: '',
    status: 'new',
    marketplace_code: '',
    company_id: '',
    payment_status: '',
    shipping_status: '',
    invoice_status: '',
    date_from: '',
    date_to: '',
  });

  const load = async () => {
    await run(async () => {
      const [orderResponse, companyResponse, shippingResponse, accountingResponse] = await Promise.all([
        api.orders.list(filters),
        api.companies.list(),
        api.shipping.accounts(),
        api.accounting.accounts(),
      ]);
      setOrders(orderResponse.data || []);
      setCompanies(companyResponse.data || []);
      setShippingAccounts(shippingResponse.data || []);
      setAccountingAccounts(accountingResponse.data || []);
      setSelectedAccountId((shippingResponse.data || [])[0]?.id || '');
      setSelectedAccountingAccountId((accountingResponse.data || [])[0]?.id || '');
    });
  };

  useEffect(() => {
    load();
  }, [filters.status]);

  const setFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));

  const rows = useMemo(() => orders, [orders]);
  const selectedOrders = useMemo(() => orders.filter((order) => selectedOrderIds.includes(order.id)), [orders, selectedOrderIds]);

  const toggleOrder = (id) => {
    setSelectedOrderIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const runBulk = async () => {
    if (selectedOrderIds.length === 0) {
      notify('error', 'Toplu islem icin siparis seciniz.');
      return;
    }

    const payload = {
      order_ids: selectedOrderIds,
      action: bulkAction,
      status: bulkStatus,
      shipping_account_id: selectedAccountId,
      accounting_account_id: selectedAccountingAccountId,
      type: 'earchive',
    };

    await run(async () => {
      const response = await api.orders.bulk(payload);
      notify('success', response.message);
      setSelectedOrderIds([]);
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  const availableBulkStatuses = selectedOrders.length === 0
    ? statusTabs
    : statusTabs.filter((tab) => selectedOrders.every((order) => order.status === tab.key || (statusFlow[order.status] || []).includes(tab.key)));

  return (
    <>
      <PageHeader title="Siparis Operasyonu" />
      <div className="tabs">
        {statusTabs.map((tab) => (
          <button type="button" className={filters.status === tab.key ? 'tab active' : 'tab'} key={tab.key} onClick={() => setFilter('status', tab.key)}>
            {tab.label}
          </button>
        ))}
      </div>
      <PageToolbar
        search={filters.search}
        onSearch={(value) => setFilter('search', value)}
        searchPlaceholder="Siparis, musteri, e-posta veya telefon ara"
        actions={<button type="button" className="secondary-button" onClick={load}>Filtrele</button>}
        filters={(
          <>
            <select value={filters.company_id} onChange={(event) => setFilter('company_id', event.target.value)}>
              <option value="">Tum firmalar</option>
              {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
            <select value={filters.marketplace_code} onChange={(event) => setFilter('marketplace_code', event.target.value)}>
              <option value="">Tum pazaryerleri</option>
              <option value="trendyol">Trendyol</option>
              <option value="hepsiburada">Hepsiburada</option>
              <option value="test">Test</option>
            </select>
            <select value={filters.payment_status} onChange={(event) => setFilter('payment_status', event.target.value)}>
              <option value="">Odeme</option>
              <option value="paid">Odendi</option>
              <option value="pending">Bekliyor</option>
              <option value="failed">Basarisiz</option>
            </select>
            <select value={filters.shipping_status} onChange={(event) => setFilter('shipping_status', event.target.value)}>
              <option value="">Kargo</option>
              <option value="queued">Kuyrukta</option>
              <option value="created">Olustu</option>
              <option value="shipped">Kargoda</option>
              <option value="delivered">Teslim</option>
            </select>
            <select value={filters.invoice_status} onChange={(event) => setFilter('invoice_status', event.target.value)}>
              <option value="">Fatura</option>
              <option value="queued">Kuyrukta</option>
              <option value="issued">Kesildi</option>
              <option value="failed">Basarisiz</option>
            </select>
            <input type="date" value={filters.date_from} onChange={(event) => setFilter('date_from', event.target.value)} />
            <input type="date" value={filters.date_to} onChange={(event) => setFilter('date_to', event.target.value)} />
          </>
        )}
      />
      <section className="kpi-grid">
        <div className="kpi-card"><span>Bu Sekme</span><strong>{orders.length}</strong><small>{statusTabs.find((tab) => tab.key === filters.status)?.label}</small></div>
        <div className="kpi-card"><span>Odeme Bekleyen</span><strong>{orders.filter((order) => ['pending', null, undefined].includes(order.payments?.[0]?.status || order.payment_status)).length}</strong><small>Kontrol gerekli</small></div>
        <div className="kpi-card"><span>Kargo Bekleyen</span><strong>{orders.filter((order) => !order.shipments?.[0]).length}</strong><small>Etiket aksiyonu</small></div>
        <div className="kpi-card"><span>Operasyon Riski</span><strong>{orders.filter((order) => orderRisk(order) !== 'Normal').length}</strong><small>Oncelikli takip</small></div>
      </section>

      {selectedOrderIds.length > 0 && (
        <section className="state-box bulk-action-bar order-bulk-bar">
          <strong>{selectedOrderIds.length} siparis secildi</strong>
          <span>{selectedOrders.map((order) => order.marketplace_order_id).slice(0, 4).join(', ')}</span>
          <button type="button" disabled={loading} onClick={runBulk}><ClipboardList size={16} /> Toplu islemi uygula</button>
        </section>
      )}

      <section className="panel compact-panel operation-panel">
        <div className="panel-heading">
          <div>
            <span>Toplu operasyon</span>
            <h2>Depo, kargo ve muhasebe aksiyonlari</h2>
          </div>
          <CalendarDays size={18} />
        </div>
        <div className="bulk-grid">
          <select value={bulkAction} onChange={(event) => setBulkAction(event.target.value)}>
            <option value="change_status">Durum Degistir</option>
            <option value="create_shipment">Kargo Olustur</option>
            <option value="create_invoice">Fatura Olustur</option>
          </select>
          <select value={bulkStatus} onChange={(event) => setBulkStatus(event.target.value)} disabled={bulkAction !== 'change_status'}>
            {availableBulkStatuses.map((tab) => <option key={tab.key} value={tab.key}>{tab.label}</option>)}
          </select>
          <select value={selectedAccountId} onChange={(event) => setSelectedAccountId(event.target.value)} disabled={bulkAction !== 'create_shipment'}>
            <option value="">Kargo hesabi</option>
            {shippingAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} - {account.carrier?.name}</option>)}
          </select>
          <select value={selectedAccountingAccountId} onChange={(event) => setSelectedAccountingAccountId(event.target.value)} disabled={bulkAction !== 'create_invoice'}>
            <option value="">Muhasebe hesabi</option>
            {accountingAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} - {account.integration?.name}</option>)}
          </select>
          <button type="button" disabled={loading} onClick={runBulk}><ClipboardList size={16} /> {selectedOrderIds.length} Siparise Uygula</button>
        </div>
        <div className="workflow-help">
          Workflow kurallari gecersiz durum gecislerini engeller. Iptal/iade/sorun talepleri detay ekranindan neden girilerek islenir.
        </div>
      </section>

      {error && <ErrorState message={error} onRetry={load} />}
      {loading && rows.length === 0 ? <LoadingState /> : (
        <DataTable
          rows={rows}
          emptyTitle="Siparis bulunamadi"
          emptyText="Filtreleri degistirin veya pazaryeri siparis senkronizasyonunu calistirin."
          columns={[
            { key: 'select', label: '', render: (row) => <input type="checkbox" checked={selectedOrderIds.includes(row.id)} onChange={() => toggleOrder(row.id)} /> },
            { key: 'marketplace_order_id', label: 'Siparis No', render: (row) => <Link to={`/orders/${row.id}`}>{row.marketplace_order_id}</Link> },
            { key: 'marketplace_code', label: 'Pazaryeri' },
            { key: 'company', label: 'Firma', render: (row) => row.company?.name },
            { key: 'customer_name', label: 'Musteri' },
            { key: 'total_amount', label: 'Tutar' },
            { key: 'status', label: 'Durum', render: (row) => badge(row.status) },
            { key: 'payment', label: 'Odeme', render: (row) => badge(row.payments?.[0]?.status || row.payment_status) },
            { key: 'invoice', label: 'Fatura', render: (row) => badge(row.invoices?.[0]?.invoice_number || row.invoices?.[0]?.status || row.invoice_status) },
            { key: 'shipment', label: 'Kargo', render: (row) => badge(row.shipments?.[0]?.tracking_number || row.shipments?.[0]?.status || row.shipping_status) },
            { key: 'risk', label: 'Operasyon', render: (row) => <span className={orderRisk(row) === 'Normal' ? 'status-pill ready' : 'status-pill blocked'}>{orderRisk(row)}</span> },
            { key: 'actions', label: 'Islem', render: (row) => <div className="row-actions"><Link className="button-link" to={`/orders/${row.id}`}><PackageCheck size={15} /> Detay</Link><span title="Fatura ve kargo aksiyonlari detay ekraninda"><FileText size={15} /><Truck size={15} /></span></div> },
          ]}
        />
      )}
    </>
  );
}
