import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  ClipboardList,
  Eye,
  FileText,
  Filter,
  PackageCheck,
  ReceiptText,
  RefreshCcw,
  Search,
  ShoppingBag,
  Truck,
  Undo2,
  UserRound,
} from 'lucide-react';
import { api, asArray, asObject } from '../../api/client.js';
import { DataTable } from '../../components/DataTable.jsx';
import { DetailItem } from '../../components/DetailItem.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { ReferenceModuleNav } from '../../components/ReferenceModuleNav.jsx';
import { SoftEmpty } from '../../components/SoftEmpty.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';

const statusTabs = [
  { key: '', label: 'Tum' },
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

const marketplaceFilters = [
  { value: '', label: 'Tum kanallar' },
  { value: 'trendyol', label: 'Trendyol' },
  { value: 'hepsiburada', label: 'Hepsiburada' },
  { value: 'manual', label: 'Manuel / diger' },
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
  queued: 'Kuyrukta',
  created: 'Olustu',
  issued: 'Kesildi',
};

function badge(value) {
  return value ? <StatusBadge tone={value} label={statusLabels[value] || value} /> : '-';
}

function normalize(value) {
  return String(value || '')
    .toLowerCase()
    .replaceAll('\u0131', 'i')
    .replaceAll('\u011f', 'g')
    .replaceAll('\u00fc', 'u')
    .replaceAll('\u015f', 's')
    .replaceAll('\u00f6', 'o')
    .replaceAll('\u00e7', 'c')
    .replace(/[^a-z0-9]+/g, ' ');
}

function formatMoney(value) {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

function payloadItems(order) {
  const persistedItems = asArray(order?.items);
  return persistedItems.length ? persistedItems : asArray(order?.payload?.lines || order?.payload?.items || order?.payload?.orderLines);
}

function itemCount(order) {
  const items = payloadItems(order);
  if (!Array.isArray(items) || items.length === 0) return order.item_count || 1;

  return items.reduce((sum, item) => sum + Number(item.quantity || item.qty || 1), 0);
}

function latestPayment(order) {
  return order?.payments?.[0] || null;
}

function latestShipment(order) {
  return order?.shipments?.[0] || null;
}

function latestInvoice(order) {
  return order?.invoices?.[0] || null;
}

function paymentStatus(order) {
  return latestPayment(order)?.status || order.payment_status || 'pending';
}

function shippingStatus(order) {
  return latestShipment(order)?.status || order.shipping_status || '';
}

function invoiceStatus(order) {
  return latestInvoice(order)?.status || order.invoice_status || '';
}

function marketplaceLabel(order) {
  const code = normalize(order.marketplace_code);
  if (code.includes('trendyol')) return 'Trendyol';
  if (code.includes('hepsiburada')) return 'Hepsiburada';
  if (!code || code.includes('manual')) return 'Manuel / Diger';
  return order.marketplace_code;
}

function marketplaceMatches(order, filter) {
  if (!filter) return true;
  const code = normalize(order.marketplace_code);
  if (filter === 'manual') {
    return !code || (!code.includes('trendyol') && !code.includes('hepsiburada'));
  }
  return code.includes(filter);
}

function orderRisk(order) {
  if (order.status === 'problematic') return 'Sorunlu islem';
  if (paymentStatus(order) === 'failed') return 'Odeme hatasi';
  if (!latestShipment(order) && ['preparing', 'ready_to_ship'].includes(order.status)) return 'Kargo bekliyor';
  if (!latestInvoice(order) && ['shipped', 'delivered'].includes(order.status)) return 'Fatura bekliyor';
  return 'Normal';
}

function addressText(address) {
  if (!address) return '-';
  if (typeof address === 'string') return address;
  return [address.fullName, address.full_name, address.name, address.address, address.city, address.district, address.postalCode].filter(Boolean).join(' / ') || JSON.stringify(address);
}

export function OrdersPage({ initialStatus = '' }) {
  const { notify } = useApp();
  const { loading, error, run } = useAsync();
  const [orders, setOrders] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [shippingAccounts, setShippingAccounts] = useState([]);
  const [accountingAccounts, setAccountingAccounts] = useState([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
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
        marketplace_code: filters.marketplace_code === 'manual' ? '' : filters.marketplace_code,
        status: filters.status === 'cancel_returned' ? '' : filters.status,
      };
      const [orderResponse, companyResponse, shippingResponse, accountingResponse] = await Promise.all([
        api.orders.list(apiFilters),
        api.companies.list(),
        api.shipping.accounts(),
        api.accounting.accounts(),
      ]);
      const nextOrders = asArray(orderResponse);
      setOrders(nextOrders);
      const nextCompanies = asArray(companyResponse);
      const nextShippingAccounts = asArray(shippingResponse);
      const nextAccountingAccounts = asArray(accountingResponse);
      setCompanies(nextCompanies);
      setShippingAccounts(nextShippingAccounts);
      setAccountingAccounts(nextAccountingAccounts);
      setSelectedAccountId((current) => current || nextShippingAccounts[0]?.id || '');
      setSelectedAccountingAccountId((current) => current || nextAccountingAccounts[0]?.id || '');
      setSelectedOrder((current) => {
        if (!nextOrders.length) return null;
        return nextOrders.find((order) => order.id === current?.id) || nextOrders[0];
      });
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
    let nextRows = orders;
    if (filters.status === 'cancel_returned') {
      nextRows = nextRows.filter((order) => ['cancelled', 'returned'].includes(order.status));
    }
    if (filters.marketplace_code === 'manual') {
      nextRows = nextRows.filter((order) => marketplaceMatches(order, 'manual'));
    }
    return nextRows;
  }, [filters.marketplace_code, filters.status, orders]);

  const selectedOrders = useMemo(() => orders.filter((order) => selectedOrderIds.includes(order.id)), [orders, selectedOrderIds]);

  const metrics = useMemo(() => ({
    newOrders: rows.filter((order) => order.status === 'new').length,
    preparing: rows.filter((order) => order.status === 'preparing').length,
    readyToShip: rows.filter((order) => order.status === 'ready_to_ship').length,
    shipped: rows.filter((order) => order.status === 'shipped').length,
    delivered: rows.filter((order) => order.status === 'delivered').length,
    cancelReturn: rows.filter((order) => ['cancelled', 'returned'].includes(order.status)).length,
    paymentFailed: rows.filter((order) => paymentStatus(order) === 'failed').length,
    invoicePending: rows.filter((order) => !latestInvoice(order) || ['queued', 'pending', 'failed'].includes(invoiceStatus(order))).length,
  }), [rows]);

  const availableBulkStatuses = selectedOrders.length === 0
    ? bulkStatusTabs
    : bulkStatusTabs.filter((tab) => selectedOrders.every((order) => order.status === tab.key || (statusFlow[order.status] || []).includes(tab.key)));

  const selectOrder = async (order) => {
    setSelectedOrder(order);
    setDetailLoading(true);
    try {
      const detail = await api.orders.show(order.id);
      setSelectedOrder(asObject(detail, order));
    } catch (err) {
      notify('error', err.response?.data?.message || err.message || 'Siparis detayi alinamadi.');
    } finally {
      setDetailLoading(false);
    }
  };

  const toggleOrder = (id) => {
    setSelectedOrderIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  };

  const toggleAllRows = () => {
    const ids = rows.map((order) => order.id);
    const allSelected = ids.length > 0 && ids.every((id) => selectedOrderIds.includes(id));
    setSelectedOrderIds((current) => allSelected ? current.filter((id) => !ids.includes(id)) : Array.from(new Set([...current, ...ids])));
  };

  const runBulk = async (action, ids = selectedOrderIds, status = bulkStatus) => {
    if (ids.length === 0) {
      notify('error', 'Toplu islem icin siparis seciniz.');
      return;
    }

    if (action === 'create_shipment' && !selectedAccountId) {
      notify('error', 'Kargo hesabi seciniz.');
      return;
    }

    if (action === 'create_invoice' && !selectedAccountingAccountId) {
      notify('error', 'Muhasebe hesabi seciniz.');
      return;
    }

    const payload = {
      order_ids: ids,
      action,
      status,
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

  const requestResolution = async (order, type) => {
    await run(async () => {
      const response = await api.orders.resolution(order.id, { type, reason: 'Operasyon merkezi uzerinden talep edildi.' });
      notify('success', type === 'return' ? 'Iade talebi siparis akisine islendi.' : 'Iptal talebi siparis akisine islendi.');
      setSelectedOrder(response);
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  return (
    <div className="orders-page">
      <PageHeader
        title="Siparisler"
        description="Pazaryerlerinden gelen siparisleri filtreleyin, durumunu guncelleyin, kargo ve fatura islemlerini takip edin."
        actions={<button type="button" className="secondary" onClick={load} disabled={loading}><RefreshCcw size={16} /> Yenile</button>}
      />
      <ReferenceModuleNav
        section="orders"
        note="Siparis listesi ana operasyon alanidir; durum takibi, kargo, fatura ve iade islemleri buradan baslar."
        next="Siradaki islem: siparisi durumuna gore filtreleyin, kaydi secin ve sag panelden gerekli aksiyonu tamamlayin."
      />

      <section className="orders-reference-flow" aria-label="Siparis durum akisi">
        {statusTabs.map((tab) => (
          <button
            key={tab.key || 'all'}
            type="button"
            className={filters.status === tab.key ? 'active' : ''}
            onClick={() => setFilter('status', tab.key)}
          >
            <span>{tab.label}</span>
            <strong>
              {tab.key === '' && rows.length}
              {tab.key === 'new' && metrics.newOrders}
              {tab.key === 'preparing' && metrics.preparing}
              {tab.key === 'ready_to_ship' && metrics.readyToShip}
              {tab.key === 'shipped' && metrics.shipped}
              {tab.key === 'delivered' && metrics.delivered}
              {tab.key === 'cancel_returned' && metrics.cancelReturn}
              {tab.key === 'problematic' && rows.filter((order) => order.status === 'problematic').length}
            </strong>
          </button>
        ))}
      </section>

      <section className="orders-reference-summary">
        <div>
          <span>Toplam Siparis</span>
          <strong>{rows.length}</strong>
          <small>Listelenen kayit</small>
        </div>
        <div>
          <span>Kargoya Hazir</span>
          <strong>{metrics.readyToShip}</strong>
          <small>Aksiyon bekliyor</small>
        </div>
        <div>
          <span>Odeme Hatali</span>
          <strong>{metrics.paymentFailed}</strong>
          <small>Kontrol gerekli</small>
        </div>
        <div>
          <span>Fatura Bekleyen</span>
          <strong>{metrics.invoicePending}</strong>
          <small>Muhasebe islemi</small>
        </div>
      </section>

      <section className="orders-reference-filter">
        <div className="orders-reference-filter-title">
          <strong>Filtreleme Secenekleri</strong>
          <span>Pazaryeri, siparis durumu, odeme, kargo ve fatura bilgisine gore kayitlari daraltin.</span>
        </div>
        <div className="orders-filter-row">
          <label>
            <Filter size={15} />
            <select value={filters.marketplace_code} onChange={(event) => setFilter('marketplace_code', event.target.value)}>
              {marketplaceFilters.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label>
            <ClipboardList size={15} />
            <select value={filters.status} onChange={(event) => setFilter('status', event.target.value)}>
              {statusTabs.map((tab) => <option key={tab.key || 'all'} value={tab.key}>{tab.label}</option>)}
            </select>
          </label>
          <label className="orders-search">
            <Search size={15} />
            <input value={filters.search} onChange={(event) => setFilter('search', event.target.value)} placeholder="Siparis, musteri, e-posta veya telefon ara" />
          </label>
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
          <select value={filters.company_id} onChange={(event) => setFilter('company_id', event.target.value)}>
            <option value="">Tum firmalar</option>
            {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
          </select>
          <input type="date" value={filters.date_from} onChange={(event) => setFilter('date_from', event.target.value)} />
          <input type="date" value={filters.date_to} onChange={(event) => setFilter('date_to', event.target.value)} />
          <button type="button" onClick={load} disabled={loading}>Filtrele</button>
        </div>
      </section>

      <section className="orders-command-row">
        <div>
          <h2>Siparis Listesi</h2>
          <p>{rows.length} siparis goruntuleniyor. Secim yaparak toplu kargo, fatura veya durum islemi baslatabilirsiniz.</p>
        </div>
        <div>
          <button type="button" className="secondary" onClick={() => setFilter('payment_status', 'failed')}><AlertTriangle size={16} /> Odeme Hatalari</button>
          <Link className="button-link secondary-link" to="/api-logs">API Loglari</Link>
        </div>
      </section>

      <section className="orders-bulk-bar">
        <strong>{selectedOrderIds.length || 0} siparis secildi</strong>
        <select value={selectedAccountId} onChange={(event) => setSelectedAccountId(event.target.value)}>
          <option value="">Kargo hesabi</option>
          {shippingAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
        </select>
        <select value={selectedAccountingAccountId} onChange={(event) => setSelectedAccountingAccountId(event.target.value)}>
          <option value="">Muhasebe hesabi</option>
          {accountingAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
        </select>
        <button type="button" disabled={loading || selectedOrderIds.length === 0} onClick={() => runBulk('create_shipment')}><Truck size={16} /> Kargo Olustur</button>
        <button type="button" disabled={loading || selectedOrderIds.length === 0} onClick={() => runBulk('create_invoice')}><FileText size={16} /> Fatura Olustur</button>
        <select value={bulkStatus} onChange={(event) => setBulkStatus(event.target.value)}>
          {availableBulkStatuses.map((tab) => <option key={tab.key} value={tab.key}>{tab.label}</option>)}
        </select>
        <button type="button" disabled={loading || selectedOrderIds.length === 0} onClick={() => runBulk('change_status')}><ClipboardList size={16} /> Durum Degistir</button>
      </section>

      {error && <ErrorState message={error} onRetry={load} />}
      {loading && rows.length === 0 ? <LoadingState /> : (
        <section className="orders-layout">
          <div className="panel orders-table-panel">
            <div className="orders-table-header">
              <div>
                <h2>Operasyon Tablosu</h2>
                <p>Siparis satirina tiklayarak sag panelde musteri, urun, odeme, kargo ve fatura detayini gorun.</p>
              </div>
              <button type="button" className="secondary" onClick={toggleAllRows} disabled={rows.length === 0}>Tumunu Sec</button>
            </div>
            <DataTable
              rows={rows}
              emptyTitle="Siparis bulunamadi"
              emptyText="Filtreleri degistirin veya pazaryeri ekranindan siparisleri tekrar cekin."
              columns={[
                { key: 'select', label: '', render: (row) => <input type="checkbox" checked={selectedOrderIds.includes(row.id)} onChange={() => toggleOrder(row.id)} /> },
                {
                  key: 'order',
                  label: 'Siparis No',
                  render: (row) => (
                    <button type="button" className="text-link" onClick={() => selectOrder(row)}>
                      {row.marketplace_order_id || `#${row.id}`}
                    </button>
                  ),
                },
                { key: 'marketplace_code', label: 'Marketplace', render: marketplaceLabel },
                { key: 'customer_name', label: 'Musteri', render: (row) => row.customer_name || '-' },
                { key: 'total_amount', label: 'Tutar', render: (row) => formatMoney(row.total_amount) },
                { key: 'payment', label: 'Odeme', render: (row) => badge(paymentStatus(row)) },
                { key: 'shipment', label: 'Kargo', render: (row) => badge(shippingStatus(row)) },
                { key: 'invoice', label: 'Fatura', render: (row) => badge(invoiceStatus(row)) },
                { key: 'created_at', label: 'Tarih', render: (row) => formatDate(row.created_at) },
                {
                  key: 'actions',
                  label: 'Islem',
                  render: (row) => (
                    <div className="row-actions orders-row-actions">
                      <button type="button" title="Detay paneli" onClick={() => selectOrder(row)}><Eye size={15} /></button>
                      <Link className="button-link" title="Detay sayfasi" to={`/orders/${row.id}`}><PackageCheck size={15} /></Link>
                    </div>
                  ),
                },
              ]}
            />
          </div>

          <OrderDetailPanel
            order={selectedOrder}
            loading={detailLoading}
            onCreateShipment={(order) => runBulk('create_shipment', [order.id])}
            onCreateInvoice={(order) => runBulk('create_invoice', [order.id])}
            onCancel={(order) => requestResolution(order, 'cancel')}
            onReturn={(order) => requestResolution(order, 'return')}
          />
        </section>
      )}
    </div>
  );
}

function OrderDetailPanel({ order, loading, onCreateShipment, onCreateInvoice, onCancel, onReturn }) {
  if (!order) {
    return (
      <aside className="panel orders-detail-panel empty">
        <ShoppingBag size={34} />
        <h2>Siparis detayini secin</h2>
        <p>Bir siparise tikladiginizda musteri, urun, odeme, kargo, fatura ve operasyon gecmisi burada gorunur.</p>
      </aside>
    );
  }

  const items = payloadItems(order);
  const shipment = latestShipment(order);
  const payment = latestPayment(order);
  const invoice = latestInvoice(order);
  const histories = asArray(order.operation_histories || order.operationHistories);
  const marketplaceOps = asArray(order.marketplace_operations || order.marketplaceOperations);
  const notes = asArray(order.notes);

  return (
    <aside className="panel orders-detail-panel">
      <div className="orders-detail-head">
        <div>
          <span className="eyebrow">Siparis detayi</span>
          <h2>{order.marketplace_order_id || `Siparis #${order.id}`}</h2>
        </div>
        {badge(order.status)}
      </div>

      {loading && <SoftEmpty>Detay yukleniyor...</SoftEmpty>}

      <div className="orders-detail-grid">
        <DetailItem label="Marketplace" value={marketplaceLabel(order)} />
        <DetailItem label="Tutar" value={formatMoney(order.total_amount)} />
        <DetailItem label="Odeme" value={statusLabels[paymentStatus(order)] || paymentStatus(order) || '-'} />
        <DetailItem label="Kargo" value={shipment?.tracking_number || statusLabels[shippingStatus(order)] || shippingStatus(order) || '-'} />
        <DetailItem label="Fatura" value={invoice?.invoice_number || statusLabels[invoiceStatus(order)] || invoiceStatus(order) || '-'} />
        <DetailItem label="Risk" value={orderRisk(order)} />
      </div>

      {order.marketplace_code === 'trendyol' && (
        <div className="orders-trendyol-package-card">
          <div>
            <span>Trendyol Paket</span>
            <strong>{order.provider_shipment_package_id || order.marketplace_order_id || '-'}</strong>
          </div>
          <div>
            <span>Status</span>
            <strong>{order.provider_package_status || order.shipping_status || '-'}</strong>
          </div>
          <div>
            <span>Kargo</span>
            <strong>{order.cargo_provider_name || order.cargo_tracking_number || '-'}</strong>
          </div>
          <small>Canli paket operasyonlari guvenlik onayi olmadan provider'a gonderilmez.</small>
        </div>
      )}

      <div className={orderRisk(order) === 'Normal' ? 'orders-success-card' : 'orders-error-card'}>
        {orderRisk(order) === 'Normal' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
        <div>
          <strong>{orderRisk(order) === 'Normal' ? 'Operasyon akisi normal' : orderRisk(order)}</strong>
          <p>{orderRisk(order) === 'Normal' ? 'Odeme, kargo ve fatura tarafinda kritik uyari gorunmuyor.' : 'Bu siparis icin ilgili aksiyonu tamamlayin veya detay sayfasindan inceleyin.'}</p>
        </div>
      </div>

      <div className="orders-customer-card">
        <UserRound size={18} />
        <div>
          <strong>{order.customer_name || '-'}</strong>
          <span>{order.customer_email || '-'}</span>
          <span>{order.customer_phone || '-'}</span>
          <small>{addressText(order.shipping_address)}</small>
        </div>
      </div>

      <div>
        <h3 className="orders-detail-subtitle">Urun kalemleri</h3>
        <div className="orders-item-list">
          {items.length ? items.slice(0, 4).map((item, index) => (
            <div key={`${item.sku || item.barcode || index}`}>
              <strong>{item.name || item.product_name || item.title || 'Urun'}</strong>
              <span>{item.sku || item.merchantSku || '-'} / {item.barcode || '-'} - {item.quantity || item.qty || 1} adet</span>
            </div>
          )) : <div><strong>Kalem bilgisi yok</strong><span>Toplam urun adedi: {itemCount(order)}</span></div>}
        </div>
      </div>

      <div className="orders-detail-actions">
        <button type="button" onClick={() => onCreateShipment(order)}><Truck size={15} /> Kargo Olustur</button>
        <button type="button" onClick={() => onCreateInvoice(order)}><FileText size={15} /> Fatura Olustur</button>
        <Link className="button-link secondary-link" to="/payments"><Banknote size={15} /> Odeme Detayi</Link>
        <Link className="button-link secondary-link" to="/shipping"><Truck size={15} /> Kargo Detayi</Link>
        <button type="button" className="secondary" onClick={() => onReturn(order)} disabled={order.status === 'returned'}><Undo2 size={15} /> Iade Islemi</button>
        <button type="button" className="secondary" onClick={() => onCancel(order)} disabled={order.status === 'cancelled'}><AlertTriangle size={15} /> Iptal Islemi</button>
        <Link className="button-link secondary-link" to="/accounting"><ReceiptText size={15} /> Fatura Detayi</Link>
        <Link className="button-link secondary-link" to="/api-logs"><ClipboardList size={15} /> Loglari Gor</Link>
      </div>

      <div>
        <h3 className="orders-detail-subtitle">Operasyon gecmisi</h3>
        <div className="orders-history-list">
          {marketplaceOps.slice(0, 4).map((operation) => (
            <div key={`marketplace-${operation.id}`}>
              <strong>{operation.operation_type} - {operation.status}</strong>
              <span>{operation.error_message || operation.provider_shipment_package_id || '-'}</span>
              <small>{formatDate(operation.created_at)}</small>
            </div>
          ))}
          {histories.length ? histories.slice(0, 5).map((history) => (
            <div key={history.id}>
              <strong>{history.event}</strong>
              <span>{statusLabels[history.from_status] || history.from_status || '-'} {'->'} {statusLabels[history.to_status] || history.to_status || '-'}</span>
              <small>{formatDate(history.created_at)}</small>
            </div>
          )) : marketplaceOps.length === 0 ? <div><strong>Gecmis yok</strong><span>Operasyon aksiyonlari burada listelenir.</span></div> : null}
        </div>
      </div>

      {notes.length > 0 && (
        <div>
          <h3 className="orders-detail-subtitle">Son notlar</h3>
          <div className="orders-history-list">
            {notes.slice(0, 3).map((note) => <div key={note.id}><strong>{note.type}</strong><span>{note.note}</span></div>)}
          </div>
        </div>
      )}
    </aside>
  );
}
