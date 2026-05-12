import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Banknote, FileText, MessageSquarePlus, PackageCheck, ReceiptText, RotateCcw, Truck } from 'lucide-react';
import { api } from '../../api/client.js';
import { DataTable } from '../../components/DataTable.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
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
  return order?.payload?.lines || order?.payload?.items || order?.payload?.orderLines || [];
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

  const items = useMemo(() => payloadItems(order), [order]);
  const latestShipment = order?.shipments?.[0];
  const latestInvoice = order?.invoices?.[0];
  const latestPayment = order?.payments?.[0];

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

  if (loading && !order) return <LoadingState />;

  return (
    <>
      <PageHeader title={`Siparis Detayi ${order?.marketplace_order_id || ''}`} actions={<Link className="button-link secondary-link" to="/orders"><ArrowLeft size={16} /> Listeye Don</Link>} />
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
                  { key: 'sku', label: 'SKU', render: (row) => row.sku || row.merchantSku || '-' },
                  { key: 'quantity', label: 'Adet', render: (row) => row.quantity || row.qty || 1 },
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
