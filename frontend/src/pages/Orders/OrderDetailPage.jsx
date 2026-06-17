import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, Banknote, FileText, MessageSquarePlus, PackageCheck, ReceiptText, RotateCcw, Truck } from 'lucide-react';
import { api, asArray } from '../../api/client.js';
import { DataTable } from '../../components/DataTable.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { ReferenceModuleNav } from '../../components/ReferenceModuleNav.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';

const statuses = [
  ['new', 'Yeni'],
  ['preparing', 'Hazirlaniyor'],
  ['ready_to_ship', 'Kargoya Hazir'],
  ['shipped', 'Kargoda'],
  ['delivered', 'Teslim Edildi'],
  ['cancelled', 'Iptal'],
  ['returned', 'Iade'],
  ['problematic', 'Sorunlu'],
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

function payloadItems(order) {
  return asArray(order?.items).length ? asArray(order.items) : (order?.payload?.lines || order?.payload?.items || order?.payload?.orderLines || []);
}

function addressText(address) {
  if (!address) return '-';
  if (typeof address === 'string') return address;
  return [address.fullName, address.address, address.city, address.district, address.postalCode].filter(Boolean).join(' / ') || JSON.stringify(address);
}

function statusBadge(value) {
  return value ? <span className={`badge ${value}`}>{value}</span> : <span>-</span>;
}

export function OrderDetailPage() {
  const { id } = useParams();
  const { notify } = useApp();
  const { loading, error, run } = useAsync();
  const [order, setOrder] = useState(null);
  const [shippingAccounts, setShippingAccounts] = useState([]);
  const [accountingAccounts, setAccountingAccounts] = useState([]);
  const [selectedShippingAccount, setSelectedShippingAccount] = useState('');
  const [selectedAccountingAccount, setSelectedAccountingAccount] = useState('');
  const [nextStatus, setNextStatus] = useState('preparing');
  const [note, setNote] = useState('');
  const [resolution, setResolution] = useState({ type: 'problem', reason: '' });
  const [packageStatus, setPackageStatus] = useState('Picking');
  const [cancelLineId, setCancelLineId] = useState('');
  const [cancelReasonId, setCancelReasonId] = useState('');
  const [cancelDescription, setCancelDescription] = useState('Tedarik edilemedi');
  const [trendyolInvoiceLink, setTrendyolInvoiceLink] = useState('');
  const [trendyolInvoiceFileName, setTrendyolInvoiceFileName] = useState('fatura.pdf');
  const [trendyolInvoiceFileContent, setTrendyolInvoiceFileContent] = useState('');

  const items = useMemo(() => payloadItems(order), [order]);
  const latestShipment = order?.shipments?.[0];
  const latestInvoice = order?.invoices?.[0];
  const latestPayment = order?.payments?.[0];
  const marketplaceAccountId = order?.marketplace_account_id || order?.marketplaceAccount?.id;
  const providerPackageId = order?.provider_shipment_package_id || order?.marketplace_order_id;
  const marketplaceOps = asArray(order?.marketplace_operations || order?.marketplaceOperations);
  const invoiceOps = marketplaceOps.filter((operation) => String(operation.operation_type || '').startsWith('invoice_'));

  const load = async () => {
    await run(async () => {
      const [orderResponse, shippingResponse, accountingResponse] = await Promise.all([
        api.orders.show(id),
        api.shipping.accounts(),
        api.accounting.accounts(),
      ]);
      setOrder(orderResponse);
      setShippingAccounts(shippingResponse.data || []);
      setAccountingAccounts(accountingResponse.data || []);
      setSelectedShippingAccount((shippingResponse.data || [])[0]?.id || '');
      setSelectedAccountingAccount((accountingResponse.data || [])[0]?.id || '');
      setNextStatus(orderResponse.status || 'preparing');
      setPackageStatus(orderResponse.provider_package_status || 'Picking');
      setCancelLineId(asArray(orderResponse.items)[0]?.provider_line_id || '');
    });
  };

  useEffect(() => {
    load();
  }, [id]);

  const transition = async () => {
    await run(async () => {
      const response = await api.orders.transition(id, { status: nextStatus });
      setOrder(response);
      notify('success', 'Siparis durumu guncellendi.');
    }, { onError: (message) => notify('error', message) });
  };

  const addNote = async () => {
    if (!note.trim()) {
      notify('error', 'Not metni zorunludur.');
      return;
    }
    await run(async () => {
      await api.orders.addNote(id, { note, type: 'internal' });
      setNote('');
      notify('success', 'Siparis notu eklendi.');
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  const createShipment = async () => {
    if (!selectedShippingAccount) {
      notify('error', 'Kargo hesabi seciniz.');
      return;
    }
    await run(async () => {
      const response = await api.shipping.createShipment(id, { shipping_account_id: selectedShippingAccount });
      notify('success', response.message);
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  const createLabel = async () => {
    if (!latestShipment?.id) {
      notify('error', 'Etiket icin once kargo kaydi olusturun.');
      return;
    }
    await run(async () => {
      const response = await api.shipping.label(latestShipment.id);
      notify('success', response.message);
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  const createInvoice = async () => {
    if (!selectedAccountingAccount) {
      notify('error', 'Muhasebe hesabi seciniz.');
      return;
    }
    await run(async () => {
      const response = await api.accounting.createInvoice(id, { accounting_account_id: selectedAccountingAccount, type: 'earchive' });
      notify('success', response.message);
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  const trackShipment = async () => {
    if (!latestShipment?.id) {
      notify('error', 'Takip icin once kargo kaydi olusturun.');
      return;
    }
    await run(async () => {
      const response = await api.shipping.track(latestShipment.id);
      notify('success', response.message || 'Kargo takip sorgusu kuyruga alindi.');
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  const createReturnCode = async () => {
    if (!latestShipment?.id) {
      notify('error', 'Iade kodu icin once kargo kaydi olusturun.');
      return;
    }
    await run(async () => {
      const response = await api.shipping.returnCode(latestShipment.id);
      notify('success', response.message || 'Iade kargo kodu kuyruga alindi.');
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  const queryInvoice = async () => {
    if (!latestInvoice?.id) {
      notify('error', 'Sorgulama icin once fatura olusturun.');
      return;
    }
    await run(async () => {
      const response = await api.accounting.queryInvoice(latestInvoice.id);
      notify('success', response.message || 'Fatura durum sorgusu kuyruga alindi.');
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  const createInvoicePdf = async () => {
    if (!latestInvoice?.id) {
      notify('error', 'PDF icin once fatura olusturun.');
      return;
    }
    await run(async () => {
      const response = await api.accounting.createPdf(latestInvoice.id);
      notify('success', response.message || 'Fatura PDF olusturma kuyruga alindi.');
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  const returnInvoice = async () => {
    if (!latestInvoice?.id) {
      notify('error', 'Iade faturasi icin once fatura olusturun.');
      return;
    }
    await run(async () => {
      const response = await api.accounting.returnInvoice(latestInvoice.id);
      notify('success', response.message || 'Iade faturasi kuyruga alindi.');
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  const queryPayment = async () => {
    if (!latestPayment?.id) {
      notify('error', 'Odeme kaydi bulunmuyor.');
      return;
    }
    await run(async () => {
      const response = await api.payments.query(latestPayment.id);
      notify('success', response.message || 'Odeme durumu sorgulandi.');
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  const sendResolution = async () => {
    if (!resolution.reason.trim()) {
      notify('error', 'Iptal/iade/sorun nedeni zorunludur.');
      return;
    }
    await run(async () => {
      const response = await api.orders.resolution(id, resolution);
      setOrder(response);
      setResolution({ ...resolution, reason: '' });
      notify('success', 'Talep siparis akisine islendi.');
    }, { onError: (message) => notify('error', message) });
  };

  const updateTrendyolPackageStatus = async () => {
    if (!marketplaceAccountId || !providerPackageId) {
      notify('error', 'Trendyol magazasi veya paket ID bulunamadi.');
      return;
    }

    await run(async () => {
      const response = await api.marketplaces.trendyolUpdatePackageStatus(marketplaceAccountId, order.id, {
        shipmentPackageId: providerPackageId,
        status: packageStatus,
      });
      notify('success', response.operation?.error_message || response.message);
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  const cancelTrendyolItem = async () => {
    if (!marketplaceAccountId || !providerPackageId || !cancelLineId || !cancelReasonId.trim()) {
      notify('error', 'Paket ID, line ID ve reasonId zorunludur.');
      return;
    }

    await run(async () => {
      const response = await api.marketplaces.trendyolCancelPackageItem(marketplaceAccountId, order.id, {
        shipmentPackageId: providerPackageId,
        lineId: cancelLineId,
        quantity: 1,
        reasonId: cancelReasonId,
        description: cancelDescription,
      });
      notify('success', response.operation?.error_message || response.message);
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  const sendTrendyolInvoiceLink = async () => {
    if (!marketplaceAccountId || !providerPackageId || !trendyolInvoiceLink.trim()) {
      notify('error', 'Trendyol magazasi, paket ID ve fatura linki zorunludur.');
      return;
    }

    await run(async () => {
      const response = await api.marketplaces.trendyolSendOrderInvoiceLink(marketplaceAccountId, order.id, {
        shipmentPackageId: providerPackageId,
        invoiceLink: trendyolInvoiceLink,
      });
      notify('success', response.operation?.error_message || response.message);
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  const deleteTrendyolInvoiceLink = async () => {
    if (!marketplaceAccountId || !providerPackageId) {
      notify('error', 'Trendyol magazasi veya paket ID bulunamadi.');
      return;
    }

    await run(async () => {
      const response = await api.marketplaces.trendyolDeleteOrderInvoiceLink(marketplaceAccountId, order.id);
      notify('success', response.operation?.error_message || response.message);
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  const sendTrendyolInvoiceFile = async () => {
    if (!marketplaceAccountId || !providerPackageId || !trendyolInvoiceFileName.trim() || !trendyolInvoiceFileContent.trim()) {
      notify('error', 'Trendyol magazasi, paket ID, dosya adi ve base64 dosya icerigi zorunludur.');
      return;
    }

    await run(async () => {
      const response = await api.marketplaces.trendyolSendOrderInvoiceFile(marketplaceAccountId, order.id, {
        shipmentPackageId: providerPackageId,
        fileName: trendyolInvoiceFileName,
        fileContent: trendyolInvoiceFileContent,
      });
      notify('success', response.operation?.error_message || response.message);
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  if (loading && !order) return <LoadingState />;

  return (
    <>
      <PageHeader title={`Siparis Detayi ${order?.marketplace_order_id || ''}`} actions={<Link className="button-link secondary-link" to="/orders"><ArrowLeft size={16} /> Listeye Don</Link>} />
      <ReferenceModuleNav section="orders" />
      {error && <ErrorState message={error} onRetry={load} />}
      {order && (
        <>
          <section className="order-command-strip">
            <div>
              <span>Durum</span>
              <strong>{statuses.find(([key]) => key === order.status)?.[1] || order.status}</strong>
            </div>
            <div>
              <span>Odeme</span>
              <strong>{latestPayment?.status || order.payment_status || '-'}</strong>
            </div>
            <div>
              <span>Kargo</span>
              <strong>{latestShipment?.tracking_number || latestShipment?.status || order.shipping_status || '-'}</strong>
            </div>
            <div>
              <span>Fatura</span>
              <strong>{latestInvoice?.invoice_number || latestInvoice?.status || order.invoice_status || '-'}</strong>
            </div>
          </section>

          <section className="detail-grid">
            <div className="panel detail-card">
              <h2>Musteri</h2>
              <strong>{order.customer_name || '-'}</strong>
              <span>{order.customer_email || '-'}</span>
              <span>{order.customer_phone || '-'}</span>
            </div>
            <div className="panel detail-card">
              <h2>Pazaryeri</h2>
              <strong>{order.marketplace_code}</strong>
              <span>{order.marketplace_order_id}</span>
              <span>{order.company?.name}</span>
            </div>
            <div className="panel detail-card">
              <h2>Adres</h2>
              <span>{addressText(order.shipping_address || order.payload?.shipmentAddress || order.payload?.shippingAddress)}</span>
              <small>Fatura: {addressText(order.billing_address || order.payload?.invoiceAddress || order.payload?.billingAddress)}</small>
            </div>
            <div className="panel detail-card">
              <h2>Durum</h2>
              <strong>{order.status}</strong>
              <span>{order.total_amount} TRY</span>
            </div>
          </section>

          <section className="panel compact-panel">
            <div className="panel-heading">
              <div>
                <span>Workflow</span>
                <h2>Operasyon Aksiyonlari</h2>
              </div>
              <PackageCheck size={18} />
            </div>
            <div className="bulk-grid">
              <select value={nextStatus} onChange={(event) => setNextStatus(event.target.value)}>
                {statuses.map(([key, label]) => {
                  const allowed = key === order.status || (statusFlow[order.status] || []).includes(key);
                  return <option key={key} value={key} disabled={!allowed}>{label}{allowed ? '' : ' (workflow kapali)'}</option>;
                })}
              </select>
              <button type="button" disabled={loading} onClick={transition}><PackageCheck size={16} /> Durum Gecir</button>
              <select value={selectedShippingAccount} onChange={(event) => setSelectedShippingAccount(event.target.value)}>
                <option value="">Kargo hesabi</option>
                {shippingAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} - {account.carrier?.name}</option>)}
              </select>
              <button type="button" disabled={loading} onClick={createShipment}><Truck size={16} /> Kargo Olustur</button>
              <button type="button" disabled={loading} onClick={createLabel}><FileText size={16} /> Etiket Olustur</button>
              <select value={selectedAccountingAccount} onChange={(event) => setSelectedAccountingAccount(event.target.value)}>
                <option value="">Muhasebe hesabi</option>
                {accountingAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} - {account.integration?.name}</option>)}
              </select>
              <button type="button" disabled={loading} onClick={createInvoice}><FileText size={16} /> Fatura Olustur</button>
            </div>
            <div className="workflow-help">Bu alandaki durum gecisleri backend workflow kurallariyla tekrar dogrulanir.</div>
          </section>

          <section className="detail-grid two">
            <div className="panel">
              <h2>Urunler</h2>
              <DataTable
                rows={items.map((item, index) => ({ id: index + 1, ...item }))}
                emptyTitle="Urun satiri yok"
                emptyText="Pazaryeri payload icinde urun satiri bulunamadi."
                columns={[
                  { key: 'name', label: 'Urun', render: (row) => row.name || row.productName || row.title || 'Siparis kalemi' },
                  { key: 'sku', label: 'SKU', render: (row) => row.sku || row.merchantSku || row.stockCode || '-' },
                  { key: 'barcode', label: 'Barkod', render: (row) => row.barcode || '-' },
                  { key: 'quantity', label: 'Adet', render: (row) => row.quantity || row.qty || 1 },
                  { key: 'provider_status', label: 'Provider', render: (row) => row.provider_status || row.status || '-' },
                  { key: 'total', label: 'Tutar', render: (row) => row.total || row.amount || row.price || '-' },
                ]}
              />
            </div>
            <div className="panel status-stack">
              <h2>Odeme / Kargo / Fatura</h2>
              <div><strong>Odeme</strong>{statusBadge(latestPayment?.status || order.payment_status)}</div>
              <div><strong>Kargo</strong>{statusBadge(latestShipment?.tracking_number || latestShipment?.status || order.shipping_status)}</div>
              <div><strong>Fatura</strong>{statusBadge(latestInvoice?.invoice_number || latestInvoice?.status || order.invoice_status)}</div>
            </div>
          </section>

          {order.marketplace_code === 'trendyol' && (
            <section className="panel trendyol-order-ops">
              <div className="panel-heading">
                <div>
                  <span>Trendyol Paket Operasyonu</span>
                  <h2>Paket durumu ve tedarik aksiyonlari</h2>
                </div>
                <Truck size={18} />
              </div>
              <div className="ops-warning">
                <AlertTriangle size={18} />
                <span>Canli paket status update/cancel islemleri guvenlik flag'i kapaliyken provider'a gonderilmez; islem dry-run olarak loglanir.</span>
              </div>
              <div className="trendyol-ops-grid">
                <div>
                  <span>Magaza</span>
                  <strong>{order.marketplaceAccount?.name || marketplaceAccountId || '-'}</strong>
                </div>
                <div>
                  <span>Shipment Package ID</span>
                  <strong>{providerPackageId || '-'}</strong>
                </div>
                <div>
                  <span>Paket Status</span>
                  <strong>{order.provider_package_status || order.shipping_status || '-'}</strong>
                </div>
                <div>
                  <span>Kargo</span>
                  <strong>{order.cargo_provider_name || order.cargo_tracking_number || '-'}</strong>
                </div>
              </div>
              <div className="trendyol-ops-actions">
                <label>
                  Paket status
                  <select value={packageStatus} onChange={(event) => setPackageStatus(event.target.value)}>
                    <option value="Picking">Picking</option>
                    <option value="Invoiced">Invoiced</option>
                    <option value="Shipped">Shipped</option>
                    <option value="Delivered">Delivered</option>
                    <option value="Cancelled">Cancelled</option>
                  </select>
                </label>
                <button type="button" disabled={loading || !marketplaceAccountId} onClick={updateTrendyolPackageStatus}>Paket Durumunu Kaydet</button>
                <label>
                  Iptal line
                  <select value={cancelLineId} onChange={(event) => setCancelLineId(event.target.value)}>
                    <option value="">Line sec</option>
                    {items.map((item, index) => <option key={`${item.provider_line_id || item.lineId || index}`} value={item.provider_line_id || item.lineId || ''}>{item.provider_line_id || item.lineId || item.sku || `Kalem ${index + 1}`}</option>)}
                  </select>
                </label>
                <label>
                  Reason ID
                  <input value={cancelReasonId} onChange={(event) => setCancelReasonId(event.target.value)} placeholder="Trendyol reasonId" />
                </label>
                <label>
                  Aciklama
                  <input value={cancelDescription} onChange={(event) => setCancelDescription(event.target.value)} />
                </label>
                <button type="button" className="secondary-button" disabled={loading || !marketplaceAccountId} onClick={cancelTrendyolItem}>Tedarik Edememe Bildir</button>
              </div>
              <div className="orders-history-list">
                {marketplaceOps.length ? marketplaceOps.slice(0, 6).map((operation) => (
                  <div key={operation.id}>
                    <strong>{operation.operation_type} - {operation.status}</strong>
                    <span>{operation.error_message || operation.provider_shipment_package_id || '-'}</span>
                    <small>{operation.created_at}</small>
                  </div>
                )) : <div><strong>Operasyon kaydi yok</strong><span>Paket status ve tedarik aksiyonlari burada izlenir.</span></div>}
              </div>
            </section>
          )}

          {order.marketplace_code === 'trendyol' && (
            <section className="panel trendyol-order-ops">
              <div className="panel-heading">
                <div>
                  <span>Trendyol Fatura Operasyonu</span>
                  <h2>Fatura linki ve dosyasi</h2>
                </div>
                <ReceiptText size={18} />
              </div>
              <div className="ops-warning">
                <AlertTriangle size={18} />
                <span>Canli fatura link/dosya islemleri guvenlik flag'i kapaliyken provider'a gonderilmez; islem dry-run olarak loglanir.</span>
              </div>
              <div className="trendyol-ops-grid">
                <div>
                  <span>Magaza</span>
                  <strong>{order.marketplaceAccount?.name || marketplaceAccountId || '-'}</strong>
                </div>
                <div>
                  <span>Shipment Package ID</span>
                  <strong>{providerPackageId || '-'}</strong>
                </div>
                <div>
                  <span>Son fatura operasyonu</span>
                  <strong>{invoiceOps[0]?.operation_type || 'Kayit yok'}</strong>
                </div>
                <div>
                  <span>Durum</span>
                  <strong>{invoiceOps[0]?.status || order.invoice_status || '-'}</strong>
                </div>
              </div>
              <div className="trendyol-ops-actions">
                <label>
                  Fatura PDF linki
                  <input value={trendyolInvoiceLink} onChange={(event) => setTrendyolInvoiceLink(event.target.value)} placeholder="https://..." />
                </label>
                <button type="button" disabled={loading || !marketplaceAccountId || !providerPackageId} onClick={sendTrendyolInvoiceLink}>Fatura Linki Gonder</button>
                <button type="button" className="secondary-button" disabled={loading || !marketplaceAccountId || !providerPackageId} onClick={deleteTrendyolInvoiceLink}>Fatura Linki Sil</button>
                <label>
                  Dosya adi
                  <input value={trendyolInvoiceFileName} onChange={(event) => setTrendyolInvoiceFileName(event.target.value)} placeholder="fatura.pdf" />
                </label>
                <label>
                  Base64 dosya
                  <input value={trendyolInvoiceFileContent} onChange={(event) => setTrendyolInvoiceFileContent(event.target.value)} placeholder="Base64 PDF icerigi" />
                </label>
                <button type="button" disabled={loading || !marketplaceAccountId || !providerPackageId} onClick={sendTrendyolInvoiceFile}>Fatura Dosyasi Yukle</button>
              </div>
              <div className="orders-history-list">
                {invoiceOps.length ? invoiceOps.slice(0, 6).map((operation) => (
                  <div key={operation.id}>
                    <strong>{operation.operation_type} - {operation.status}</strong>
                    <span>{operation.error_message || operation.provider_shipment_package_id || '-'}</span>
                    <small>{operation.created_at}</small>
                  </div>
                )) : <div><strong>Fatura operasyon kaydi yok</strong><span>Link, silme ve dosya yukleme aksiyonlari burada izlenir.</span></div>}
              </div>
            </section>
          )}

          <section className="order-operation-grid">
            <div className="panel operation-card">
              <Banknote size={20} />
              <h2>Odeme Operasyonu</h2>
              <p>{latestPayment?.provider_code || latestPayment?.method || 'Odeme kaydi bekleniyor.'}</p>
              <div className="row-actions">
                <button type="button" className="secondary-button" disabled={loading || !latestPayment?.id} onClick={queryPayment}>Durum Sorgula</button>
              </div>
            </div>
            <div className="panel operation-card">
              <Truck size={20} />
              <h2>Kargo Operasyonu</h2>
              <p>{latestShipment?.tracking_number || latestShipment?.carrier_code || 'Kargo kaydi bekleniyor.'}</p>
              <div className="row-actions">
                <button type="button" className="secondary-button" disabled={loading} onClick={trackShipment}>Takip Sorgula</button>
                <button type="button" className="secondary-button" disabled={loading} onClick={createReturnCode}>Iade Kodu</button>
                <button type="button" disabled={loading} onClick={createLabel}>Etiket Olustur</button>
              </div>
            </div>
            <div className="panel operation-card">
              <ReceiptText size={20} />
              <h2>Fatura Operasyonu</h2>
              <p>{latestInvoice?.invoice_number || latestInvoice?.status || 'Fatura kaydi bekleniyor.'}</p>
              <div className="row-actions">
                <button type="button" className="secondary-button" disabled={loading} onClick={queryInvoice}>Durum Sorgula</button>
                <button type="button" className="secondary-button" disabled={loading} onClick={createInvoicePdf}>PDF Olustur</button>
                <button type="button" disabled={loading} onClick={returnInvoice}>Iade Faturasi</button>
              </div>
            </div>
          </section>

          <section className="detail-grid two">
            <div className="panel">
              <h2>Siparis Notlari</h2>
              <div className="note-form">
                <textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Operasyon notu ekle" />
                <button type="button" disabled={loading} onClick={addNote}><MessageSquarePlus size={16} /> Not Ekle</button>
              </div>
              <div className="timeline">
                {(order.notes || []).map((item) => <div key={item.id}><strong>{item.type}</strong><span>{item.note}</span><small>{item.created_at}</small></div>)}
              </div>
            </div>
            <div className="panel">
              <h2>Iptal / Iade / Sorun</h2>
              <div className="note-form">
                <select value={resolution.type} onChange={(event) => setResolution({ ...resolution, type: event.target.value })}>
                  <option value="problem">Sorunlu</option>
                  <option value="cancel">Iptal</option>
                  <option value="return">Iade</option>
                </select>
                <textarea value={resolution.reason} onChange={(event) => setResolution({ ...resolution, reason: event.target.value })} placeholder="Talep nedeni" />
                <button type="button" disabled={loading} onClick={sendResolution}><RotateCcw size={16} /> Talebi Isle</button>
              </div>
            </div>
          </section>

          <section className="panel">
            <h2>Operasyon Gecmisi</h2>
            <div className="timeline">
              {(order.operation_histories || []).map((item) => (
                <div key={item.id}>
                  <strong>{item.event}</strong>
                  <span>{item.from_status || '-'} {'->'} {item.to_status || '-'}</span>
                  <small>{item.created_at}</small>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </>
  );
}
