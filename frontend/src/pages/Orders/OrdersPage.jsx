import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, FileText, PackageCheck, Truck } from 'lucide-react';
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
  { key: 'cancel_returned', label: 'Iptal/Iade' },
  { key: 'problematic', label: 'Sorunlu' },
];

const bulkStatusTabs = [
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

const statusLabels = {
  new: 'Yeni',
  preparing: 'Hazirlaniyor',
  ready_to_ship: 'Kargoya Hazir',
  shipped: 'Kargoda',
  delivered: 'Teslim Edildi',
  cancelled: 'Iptal',
  returned: 'Iade',
  problematic: 'Sorunlu',
  paid: 'Odendi',
  pending: 'Bekliyor',
  failed: 'Hatali',
  queued: 'Bekliyor',
  created: 'Olustu',
};

function badge(value) {
  return value ? <span className={`badge ${value}`}>{statusLabels[value] || value}</span> : '-';
}

function formatMoney(value) {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(Number(value || 0));
}

function payloadItems(order) {
  return order?.payload?.lines || order?.payload?.items || order?.payload?.orderLines || [];
}

function itemCount(order) {
  const items = payloadItems(order);
  if (!Array.isArray(items) || items.length === 0) return order.item_count || 1;

  return items.reduce((sum, item) => sum + Number(item.quantity || item.qty || 1), 0);
}

function orderRisk(order) {
  if (order.status === 'problematic') return 'Sorunlu islem';
  if (!order.shipments?.[0] && ['preparing', 'ready_to_ship'].includes(order.status)) return 'Kargo bekliyor';
  if (!order.invoices?.[0] && ['shipped', 'delivered'].includes(order.status)) return 'Fatura bekliyor';
  if ((order.payments?.[0]?.status || order.payment_status) === 'failed') return 'Odeme hatasi';
  return 'Normal';
}

export function OrdersPage({ initialStatus = '' }) {
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
    status: initialStatus,
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
      const apiFilters = {
        ...filters,
        status: filters.status === 'cancel_returned' ? '' : filters.status,
      };
      const [orderResponse, companyResponse, shippingResponse, accountingResponse] = await Promise.all([
        api.orders.list(apiFilters),
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

  useEffect(() => {
    setFilters((current) => ({ ...current, status: initialStatus }));
    setSelectedOrderIds([]);
  }, [initialStatus]);

  const setFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));

  const rows = useMemo(() => {
    if (filters.status !== 'cancel_returned') return orders;
    return orders.filter((order) => ['cancelled', 'returned'].includes(order.status));
  }, [orders, filters.status]);
  const selectedOrders = useMemo(() => orders.filter((order) => selectedOrderIds.includes(order.id)), [orders, selectedOrderIds]);

  const toggleOrder = (id) => {
    setSelectedOrderIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const runBulk = async (actionOverride = bulkAction) => {
    if (selectedOrderIds.length === 0) {
      notify('error', 'Toplu islem icin siparis seciniz.');
      return;
    }

    const payload = {
      order_ids: selectedOrderIds,
      action: actionOverride,
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
    ? bulkStatusTabs
    : bulkStatusTabs.filter((tab) => selectedOrders.every((order) => order.status === tab.key || (statusFlow[order.status] || []).includes(tab.key)));

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
              <option value="queued">Bekliyor</option>
              <option value="created">Olustu</option>
              <option value="shipped">Kargoda</option>
              <option value="delivered">Teslim</option>
            </select>
            <select value={filters.invoice_status} onChange={(event) => setFilter('invoice_status', event.target.value)}>
              <option value="">Fatura</option>
              <option value="queued">Bekliyor</option>
              <option value="issued">Kesildi</option>
              <option value="failed">Hatali</option>
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

      <section className="state-box bulk-action-bar order-bulk-bar simple-order-actions">
        <strong>{selectedOrderIds.length || 0} siparis secildi</strong>
        <button type="button" disabled={loading || selectedOrderIds.length === 0} onClick={() => runBulk('create_shipment')}><Truck size={16} /> Kargo Olustur</button>
        <button type="button" disabled={loading || selectedOrderIds.length === 0} onClick={() => runBulk('create_invoice')}><FileText size={16} /> Fatura Olustur</button>
        <div className="status-change-inline">
          <select value={bulkStatus} onChange={(event) => setBulkStatus(event.target.value)} disabled={bulkAction !== 'change_status'}>
            {availableBulkStatuses.map((tab) => <option key={tab.key} value={tab.key}>{tab.label}</option>)}
          </select>
          <button type="button" disabled={loading || selectedOrderIds.length === 0} onClick={() => runBulk('change_status')}><ClipboardList size={16} /> Durum Degistir</button>
        </div>
      </section>

      {error && <ErrorState message={error} onRetry={load} />}
      {loading && rows.length === 0 ? <LoadingState /> : (
        <DataTable
          rows={rows}
          emptyTitle="Siparis bulunamadi"
          emptyText="Filtreleri degistirin veya pazaryeri ekranindan siparisleri kontrol edin."
          columns={[
            { key: 'select', label: '', render: (row) => <input type="checkbox" checked={selectedOrderIds.includes(row.id)} onChange={() => toggleOrder(row.id)} /> },
            { key: 'customer_name', label: 'Musteri' },
            { key: 'items', label: 'Urun Adedi', render: (row) => itemCount(row) },
            { key: 'total_amount', label: 'Tutar', render: (row) => formatMoney(row.total_amount) },
            { key: 'marketplace_code', label: 'Pazaryeri' },
            { key: 'shipment', label: 'Kargo', render: (row) => badge(row.shipments?.[0]?.tracking_number || row.shipments?.[0]?.status || row.shipping_status) },
            { key: 'status', label: 'Durum', render: (row) => badge(row.status) },
            { key: 'actions', label: 'Islem', render: (row) => <div className="row-actions"><Link className="button-link" to={`/orders/${row.id}`}><PackageCheck size={15} /> Detay</Link></div> },
          ]}
        />
      )}
    </>
  );
}
