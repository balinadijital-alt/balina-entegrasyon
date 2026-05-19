import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Barcode,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Filter,
  PackageCheck,
  RefreshCcw,
  RotateCcw,
  Search,
  Truck,
  Undo2,
} from 'lucide-react';
import { api, asArray } from '../../api/client.js';
import { DataTable } from '../../components/DataTable.jsx';
import { DetailItem } from '../../components/DetailItem.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { Field } from '../../components/Field.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { MetricCard } from '../../components/MetricCard.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { StatusBadge } from '../../components/StatusBadge.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';

const initialForm = {
  company_id: '',
  shipping_carrier_id: '',
  name: '',
  customer_code: '',
  username: '',
  password: '',
  api_key: '',
  api_secret: '',
  base_url: '',
};

const carrierFilters = [
  { value: 'all', label: 'Tum tasiyicilar' },
  { value: 'yurtici', label: 'Yurtici' },
  { value: 'aras', label: 'Aras' },
  { value: 'mng', label: 'MNG' },
  { value: 'surat', label: 'Surat' },
  { value: 'ptt', label: 'PTT' },
  { value: 'hepsijet', label: 'Hepsijet' },
  { value: 'trendyol_express', label: 'Trendyol Express' },
];

const statusFilters = [
  { value: 'all', label: 'Tum durumlar' },
  { value: 'barcode_pending', label: 'Barkod bekleyen' },
  { value: 'label_created', label: 'Etiket olusturulan' },
  { value: 'in_transit', label: 'Kargoda' },
  { value: 'delivered', label: 'Teslim edildi' },
  { value: 'return_pending', label: 'Iade bekleyen' },
  { value: 'failed', label: 'Hatali islemler' },
];

const statusLabels = {
  pending: 'Bekliyor',
  queued: 'Kuyrukta',
  created: 'Olusturuldu',
  label_created: 'Etiket olustu',
  in_transit: 'Kargoda',
  shipped: 'Kargoda',
  delivered: 'Teslim edildi',
  failed: 'Hatali',
  return_pending: 'Iade bekliyor',
  return_requested: 'Iade bekliyor',
  returned: 'Iade tamamlandi',
};

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

function carrierText(shipment) {
  return shipment.account?.carrier?.name || shipment.carrier?.name || shipment.carrier_name || shipment.carrier_code || '-';
}

function carrierMatches(shipment, carrier) {
  if (carrier === 'all') {
    return true;
  }

  const haystack = normalize([
    shipment.carrier_code,
    shipment.carrier_name,
    shipment.account?.carrier?.code,
    shipment.account?.carrier?.name,
  ].join(' '));

  if (carrier === 'trendyol_express') {
    return haystack.includes('trendyol') || haystack.includes('ty express');
  }

  return haystack.includes(carrier);
}

function hasLabel(shipment) {
  return Boolean(shipment.label_path || shipment.label_url || shipment.label_file);
}

function hasError(shipment) {
  return shipment.status === 'failed' || Boolean(shipment.last_error || shipment.error_message || shipment.api_error);
}

function hasReturnSignal(shipment) {
  return Boolean(shipment.return_code) || ['return_pending', 'return_requested', 'returned'].includes(shipment.status);
}

function statusMatches(shipment, status) {
  if (status === 'all') {
    return true;
  }

  if (status === 'barcode_pending') {
    return !shipment.barcode || ['pending', 'queued'].includes(shipment.status);
  }

  if (status === 'label_created') {
    return hasLabel(shipment) || ['created', 'label_created'].includes(shipment.status);
  }

  if (status === 'in_transit') {
    return ['created', 'in_transit', 'shipped'].includes(shipment.status);
  }

  if (status === 'return_pending') {
    return hasReturnSignal(shipment);
  }

  if (status === 'failed') {
    return hasError(shipment);
  }

  return shipment.status === status;
}

function statusLabel(shipment) {
  return statusLabels[shipment.status] || shipment.status || 'Bilinmiyor';
}

function statusClass(shipment) {
  if (hasError(shipment)) {
    return 'failed';
  }
  if (['delivered', 'returned'].includes(shipment.status)) {
    return 'delivered';
  }
  if (['created', 'label_created', 'in_transit', 'shipped'].includes(shipment.status)) {
    return 'in_transit';
  }
  return shipment.status || 'unknown';
}

function problemSummary(shipment) {
  return shipment.last_error || shipment.error_message || shipment.api_error || shipment.response_payload?.message || 'Hata detayi bulunmuyor.';
}

function metricValue(items, predicate) {
  return items.filter(predicate).length;
}

export function ShippingPage() {
  const { notify } = useApp();
  const { loading, error, run } = useAsync();
  const [companies, setCompanies] = useState([]);
  const [carriers, setCarriers] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [shipments, setShipments] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [selectedShipments, setSelectedShipments] = useState([]);
  const [selectedShipment, setSelectedShipment] = useState(null);
  const [filters, setFilters] = useState({
    carrier: 'all',
    status: 'all',
    search: '',
  });

  const load = async () => {
    await run(async () => {
      const [companyResponse, carrierResponse, accountResponse, shipmentResponse] = await Promise.all([
        api.companies.list(),
        api.shipping.carriers(),
        api.shipping.accounts(),
        api.shipping.shipments(),
      ]);
      const nextCarriers = asArray(carrierResponse);
      const nextShipments = asArray(shipmentResponse);

      setCompanies(asArray(companyResponse));
      setCarriers(nextCarriers);
      setAccounts(asArray(accountResponse));
      setShipments(nextShipments);
      setSelectedShipment((current) => {
        if (!nextShipments.length) {
          return null;
        }

        return nextShipments.find((shipment) => shipment.id === current?.id) || nextShipments[0];
      });
      setForm((current) => ({
        ...current,
        shipping_carrier_id: current.shipping_carrier_id || nextCarriers[0]?.id || '',
      }));
    });
  };

  useEffect(() => {
    load();
  }, []);

  const filteredShipments = useMemo(() => {
    const query = normalize(filters.search);

    return shipments.filter((shipment) => {
      const searchText = normalize([
        shipment.id,
        shipment.barcode,
        shipment.tracking_number,
        shipment.return_code,
        shipment.order?.marketplace_order_id,
        shipment.order?.customer_name,
        carrierText(shipment),
      ].join(' '));

      return carrierMatches(shipment, filters.carrier)
        && statusMatches(shipment, filters.status)
        && (!query || searchText.includes(query));
    });
  }, [filters, shipments]);

  const metrics = useMemo(() => ({
    barcodePending: metricValue(shipments, (shipment) => !shipment.barcode || ['pending', 'queued'].includes(shipment.status)),
    labelCreated: metricValue(shipments, (shipment) => hasLabel(shipment) || ['created', 'label_created'].includes(shipment.status)),
    inTransit: metricValue(shipments, (shipment) => ['created', 'in_transit', 'shipped'].includes(shipment.status)),
    delivered: metricValue(shipments, (shipment) => shipment.status === 'delivered'),
    returnPending: metricValue(shipments, hasReturnSignal),
    failed: metricValue(shipments, hasError),
  }), [shipments]);

  const selectedReadyForLabel = selectedShipments.filter((id) => {
    const shipment = shipments.find((item) => item.id === id);
    return shipment && !hasError(shipment);
  }).length;

  const createAccount = async (event) => {
    event.preventDefault();
    await run(async () => {
      await api.shipping.createAccount({ ...form, settings: { endpoints: {} } });
      setForm(initialForm);
      notify('success', 'Kargo hesabi kaydedildi.');
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  const action = async (shipmentId, fn, successMessage) => {
    await run(async () => {
      const response = await fn(shipmentId);
      notify('success', response.message || successMessage);
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  const bulkLabels = async () => {
    if (selectedShipments.length === 0) {
      notify('error', 'Toplu etiket icin kargo kaydi seciniz.');
      return;
    }

    await run(async () => {
      const response = await api.shipping.bulkLabels({ shipment_ids: selectedShipments });
      notify('success', response.message || 'Toplu etiket olusturma kuyruga alindi.');
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  const downloadLabel = async (shipmentId) => {
    await run(async () => {
      const blob = await api.shipping.downloadLabel(shipmentId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `kargo-etiketi-${shipmentId}`;
      link.click();
      URL.revokeObjectURL(url);
    }, { onError: (message) => notify('error', message) });
  };

  const toggleShipment = (id) => {
    setSelectedShipments((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const toggleAllFiltered = () => {
    const ids = filteredShipments.map((shipment) => shipment.id);
    const allSelected = ids.length > 0 && ids.every((id) => selectedShipments.includes(id));
    setSelectedShipments((current) => allSelected
      ? current.filter((id) => !ids.includes(id))
      : Array.from(new Set([...current, ...ids])));
  };

  return (
    <div className="shipping-page">
      <PageHeader
        title="Kargo Operasyon Merkezi"
        description="Barkod, etiket, takip, iade kodu ve tasiyici durumlarini tek ekrandan yonetin."
        actions={<button type="button" className="secondary" onClick={load} disabled={loading}><RefreshCcw size={16} /> Yenile</button>}
      />

      <section className="shipping-hero">
        <div>
          <span className="eyebrow">Canli kargo akisi</span>
          <h2>Siparisten teslimata kadar tum kargo sureci kontrol altinda.</h2>
          <p>
            Barkod bekleyen, etiketi hazirlanan, takipte olan ve hataya dusen kargo islemlerini tasiyici bazinda filtreleyin.
          </p>
          <div className="shipping-hero-actions">
            <button type="button" onClick={bulkLabels} disabled={loading || selectedShipments.length === 0}>
              <FileText size={16} /> Toplu Etiket
            </button>
            <button type="button" className="secondary" onClick={() => setFilters({ carrier: 'all', status: 'failed', search: '' })}>
              <AlertTriangle size={16} /> Hatalari Gor
            </button>
          </div>
        </div>
        <div className="shipping-hero-status">
          <Truck size={28} />
          <strong>{accounts.length}</strong>
          <span>Tanimli kargo hesabi</span>
          <small>{selectedShipments.length} kayit secildi, {selectedReadyForLabel} kayit toplu etikete uygun.</small>
        </div>
      </section>

      <section className="shipping-stat-grid">
        <MetricCard className="shipping-stat-card" icon={<Barcode size={18} />} label="Barkod bekleyen" value={metrics.barcodePending} tone="orange" />
        <MetricCard className="shipping-stat-card" icon={<FileText size={18} />} label="Etiket olusturulan" value={metrics.labelCreated} tone="blue" />
        <MetricCard className="shipping-stat-card" icon={<Truck size={18} />} label="Kargoda" value={metrics.inTransit} tone="purple" />
        <MetricCard className="shipping-stat-card" icon={<PackageCheck size={18} />} label="Teslim edildi" value={metrics.delivered} tone="green" />
        <MetricCard className="shipping-stat-card" icon={<Undo2 size={18} />} label="Iade bekleyen" value={metrics.returnPending} tone="orange" />
        <MetricCard className="shipping-stat-card" icon={<AlertTriangle size={18} />} label="Hatali islem" value={metrics.failed} tone="red" />
      </section>

      {error && <ErrorState message={error} onRetry={load} />}
      {loading && accounts.length === 0 && shipments.length === 0 ? <LoadingState /> : (
        <>
          <section className="panel shipping-filter-panel">
            <div>
              <h2>Kargo kayitlari</h2>
              <p>Tasiyici, durum veya siparis bilgisiyle arama yaparak islem listesini daraltin.</p>
            </div>
            <div className="shipping-filter-row">
              <label>
                <Filter size={15} />
                <select value={filters.carrier} onChange={(event) => setFilters({ ...filters, carrier: event.target.value })}>
                  {carrierFilters.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label>
                <CheckCircle2 size={15} />
                <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
                  {statusFilters.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="shipping-search">
                <Search size={15} />
                <input
                  value={filters.search}
                  onChange={(event) => setFilters({ ...filters, search: event.target.value })}
                  placeholder="Siparis no, alici, barkod veya takip no ara"
                />
              </label>
            </div>
          </section>

          <section className="shipping-layout">
            <div className="panel shipping-table-panel">
              <div className="shipping-table-header">
                <div>
                  <h2>Operasyon listesi</h2>
                  <p>{filteredShipments.length} kargo kaydi goruntuleniyor.</p>
                </div>
                <div className="row-actions">
                  <button type="button" className="secondary" onClick={toggleAllFiltered} disabled={filteredShipments.length === 0}>
                    Tumunu Sec
                  </button>
                  <button type="button" onClick={bulkLabels} disabled={loading || selectedShipments.length === 0}>
                    <FileText size={15} /> Toplu Etiket
                  </button>
                </div>
              </div>
              <DataTable
                rows={filteredShipments}
                emptyText="Henuz kargo kaydi yok. Siparislerden barkod olusturdugunuzda kayitlar burada gorunur."
                columns={[
                  {
                    key: 'select',
                    label: '',
                    render: (row) => (
                      <input
                        aria-label="Kargo kaydini sec"
                        type="checkbox"
                        checked={selectedShipments.includes(row.id)}
                        onChange={() => toggleShipment(row.id)}
                      />
                    ),
                  },
                  {
                    key: 'order',
                    label: 'Siparis',
                    render: (row) => (
                      <button type="button" className="text-link" onClick={() => setSelectedShipment(row)}>
                        {row.order?.marketplace_order_id || `#${row.order_id || row.id}`}
                      </button>
                    ),
                  },
                  { key: 'customer', label: 'Alici', render: (row) => row.order?.customer_name || '-' },
                  { key: 'carrier', label: 'Tasiyici', render: carrierText },
                  { key: 'tracking_number', label: 'Takip No', render: (row) => row.tracking_number || '-' },
                  { key: 'barcode', label: 'Barkod', render: (row) => row.barcode || <span className="muted-text">Bekliyor</span> },
                  { key: 'return_code', label: 'Iade Kodu', render: (row) => row.return_code || '-' },
                  {
                    key: 'status',
                    label: 'Durum',
                    render: (row) => <StatusBadge tone={statusClass(row)} label={statusLabel(row)} />,
                  },
                  {
                    key: 'actions',
                    label: 'Islem',
                    render: (row) => (
                      <div className="row-actions shipping-row-actions">
                        <button type="button" title="Takip sorgula" onClick={() => action(row.id, api.shipping.track, 'Takip sorgusu kuyruga alindi.')}>
                          <Search size={15} />
                        </button>
                        <button type="button" title="Etiket olustur" onClick={() => action(row.id, api.shipping.label, 'Etiket kuyruga alindi.')}>
                          <FileText size={15} />
                        </button>
                        <button type="button" title="Iade kodu olustur" onClick={() => action(row.id, api.shipping.returnCode, 'Iade kodu kuyruga alindi.')}>
                          <Undo2 size={15} />
                        </button>
                        <button type="button" title="Hatali islemi tekrar dene" onClick={() => action(row.id, api.shipping.retry, 'Tekrar deneme baslatildi.')} disabled={!hasError(row) && row.status !== 'queued'}>
                          <RotateCcw size={15} />
                        </button>
                        <button type="button" title="Etiketi indir" onClick={() => downloadLabel(row.id)} disabled={!hasLabel(row)}>
                          <Download size={15} />
                        </button>
                        <button type="button" title="Detay gor" onClick={() => setSelectedShipment(row)}>
                          <Eye size={15} />
                        </button>
                      </div>
                    ),
                  },
                ]}
              />
            </div>

            <ShipmentDetailPanel
              shipment={selectedShipment}
              onTrack={(id) => action(id, api.shipping.track, 'Takip sorgusu kuyruga alindi.')}
              onLabel={(id) => action(id, api.shipping.label, 'Etiket kuyruga alindi.')}
              onReturn={(id) => action(id, api.shipping.returnCode, 'Iade kodu kuyruga alindi.')}
              onRetry={(id) => action(id, api.shipping.retry, 'Tekrar deneme baslatildi.')}
              onDownload={downloadLabel}
            />
          </section>

          <section className="shipping-lower-grid">
            <div className="panel">
              <h2>Kargo hesaplari</h2>
              <DataTable
                rows={accounts}
                emptyText="Kargo hesabi yok. Tasiyici bilgilerinizi ekleyerek barkod ve etiket islemlerini baslatin."
                columns={[
                  { key: 'name', label: 'Hesap' },
                  { key: 'company', label: 'Firma', render: (row) => row.company?.name || '-' },
                  { key: 'carrier', label: 'Kargo', render: (row) => row.carrier?.name || '-' },
                  { key: 'customer_code', label: 'Musteri Kodu', render: (row) => row.customer_code || '-' },
                  { key: 'last_status', label: 'Durum', render: (row) => <StatusBadge tone={row.last_status || 'unknown'} label={row.last_status || 'Bilinmiyor'} /> },
                ]}
              />
            </div>

            <div className="panel shipping-account-panel">
              <h2>Yeni kargo hesabi</h2>
              <p>API bilgilerini kaydederek barkod, etiket ve takip islemlerini tasiyici uzerinden yurutun.</p>
              <form className="form-grid" onSubmit={createAccount}>
                <Field label="Firma">
                  <select value={form.company_id} onChange={(event) => setForm({ ...form, company_id: event.target.value })}>
                    <option value="">Seciniz</option>
                    {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
                  </select>
                </Field>
                <Field label="Kargo Firmasi">
                  <select value={form.shipping_carrier_id} onChange={(event) => setForm({ ...form, shipping_carrier_id: event.target.value })}>
                    <option value="">Seciniz</option>
                    {carriers.map((carrier) => <option key={carrier.id} value={carrier.id}>{carrier.name}</option>)}
                  </select>
                </Field>
                <Field label="Hesap Adi"><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
                <Field label="Musteri Kodu"><input value={form.customer_code} onChange={(event) => setForm({ ...form, customer_code: event.target.value })} /></Field>
                <Field label="Kullanici Adi"><input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} /></Field>
                <Field label="Sifre"><input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></Field>
                <Field label="Baglanti Anahtari"><input value={form.api_key} onChange={(event) => setForm({ ...form, api_key: event.target.value })} /></Field>
                <Field label="Gizli Anahtar"><input type="password" value={form.api_secret} onChange={(event) => setForm({ ...form, api_secret: event.target.value })} /></Field>
                <Field label="Servis Adresi"><input value={form.base_url} onChange={(event) => setForm({ ...form, base_url: event.target.value })} /></Field>
                <button disabled={loading}>Kargo Hesabi Ekle</button>
              </form>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function ShipmentDetailPanel({ shipment, onTrack, onLabel, onReturn, onRetry, onDownload }) {
  if (!shipment) {
    return (
      <aside className="panel shipping-detail-panel empty">
        <Truck size={34} />
        <h2>Kargo detayini secin</h2>
        <p>Bir kayda tikladiginizda siparis, alici, takip ve hata bilgileri burada gorunur.</p>
      </aside>
    );
  }

  return (
    <aside className="panel shipping-detail-panel">
      <div className="shipping-detail-head">
        <div>
          <span className="eyebrow">Kargo detayi</span>
          <h2>{shipment.order?.marketplace_order_id || `Kargo #${shipment.id}`}</h2>
        </div>
        <StatusBadge tone={statusClass(shipment)} label={statusLabel(shipment)} />
      </div>

      <div className="shipping-detail-grid">
        <DetailItem label="Alici" value={shipment.order?.customer_name || '-'} />
        <DetailItem label="Tasiyici" value={carrierText(shipment)} />
        <DetailItem label="Takip No" value={shipment.tracking_number || '-'} />
        <DetailItem label="Barkod" value={shipment.barcode || 'Bekliyor'} />
        <DetailItem label="Iade Kodu" value={shipment.return_code || '-'} />
        <DetailItem label="Son Durum" value={statusLabel(shipment)} />
      </div>

      {hasError(shipment) ? (
        <div className="shipping-error-card">
          <AlertTriangle size={18} />
          <div>
            <strong>API hata ozeti</strong>
            <p>{problemSummary(shipment)}</p>
          </div>
        </div>
      ) : (
        <div className="shipping-success-card">
          <CheckCircle2 size={18} />
          <div>
            <strong>Islem akisi normal</strong>
            <p>Kargo kaydinda kritik hata gorunmuyor.</p>
          </div>
        </div>
      )}

      <div className="shipping-detail-actions">
        <button type="button" onClick={() => onTrack(shipment.id)}><Search size={15} /> Takip Sorgula</button>
        <button type="button" onClick={() => onLabel(shipment.id)}><FileText size={15} /> Etiket Olustur</button>
        <button type="button" onClick={() => onReturn(shipment.id)}><Undo2 size={15} /> Iade Kodu</button>
        <button type="button" className="secondary" onClick={() => onRetry(shipment.id)} disabled={!hasError(shipment) && shipment.status !== 'queued'}><RotateCcw size={15} /> Tekrar Dene</button>
        <button type="button" className="secondary" onClick={() => onDownload(shipment.id)} disabled={!hasLabel(shipment)}><Download size={15} /> Etiketi Indir</button>
      </div>
    </aside>
  );
}
