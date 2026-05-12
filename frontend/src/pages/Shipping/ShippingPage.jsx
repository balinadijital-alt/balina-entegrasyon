import { useEffect, useState } from 'react';
import { Download, FileText, RotateCcw, Search, Undo2 } from 'lucide-react';
import { api } from '../../api/client.js';
import { DataTable } from '../../components/DataTable.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { Field } from '../../components/Field.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
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

export function ShippingPage() {
  const { notify } = useApp();
  const { loading, error, run } = useAsync();
  const [companies, setCompanies] = useState([]);
  const [carriers, setCarriers] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [shipments, setShipments] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [selectedShipments, setSelectedShipments] = useState([]);

  const load = async () => {
    await run(async () => {
      const [companyResponse, carrierResponse, accountResponse, shipmentResponse] = await Promise.all([
        api.companies.list(),
        api.shipping.carriers(),
        api.shipping.accounts(),
        api.shipping.shipments(),
      ]);
      setCompanies(companyResponse.data || []);
      setCarriers(carrierResponse || []);
      setAccounts(accountResponse.data || []);
      setShipments(shipmentResponse.data || []);
      setForm((current) => ({ ...current, shipping_carrier_id: current.shipping_carrier_id || carrierResponse?.[0]?.id || '' }));
    });
  };

  useEffect(() => {
    load();
  }, []);

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
      notify('error', 'Etiket icin kargo kaydi seciniz.');
      return;
    }

    await run(async () => {
      const response = await api.shipping.bulkLabels({ shipment_ids: selectedShipments });
      notify('success', response.message);
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

  return (
    <>
      <PageHeader title="Kargo Yonetimi" />
      <section className="kpi-grid">
        <div className="kpi-card"><span>Kargo Hesabi</span><strong>{accounts.length}</strong><small>Aktif hesap</small></div>
        <div className="kpi-card"><span>Etiket Bekleyen</span><strong>{shipments.filter((shipment) => !shipment.label_path && !shipment.label_url).length}</strong><small>Olusturulacak</small></div>
        <div className="kpi-card"><span>Kargoda</span><strong>{shipments.filter((shipment) => ['created', 'in_transit', 'shipped'].includes(shipment.status)).length}</strong><small>Takipte</small></div>
        <div className="kpi-card"><span>Secili</span><strong>{selectedShipments.length}</strong><small>Toplu etiket</small></div>
      </section>
      <section className="panel">
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
      </section>

      {error && <ErrorState message={error} onRetry={load} />}
      {loading && accounts.length === 0 ? <LoadingState /> : (
        <>
          <section className="panel">
            <h2>Kargo Hesaplari</h2>
            <DataTable
              rows={accounts}
              columns={[
                { key: 'name', label: 'Hesap' },
                { key: 'company', label: 'Firma', render: (row) => row.company?.name },
                { key: 'carrier', label: 'Kargo', render: (row) => row.carrier?.name },
                { key: 'customer_code', label: 'Musteri Kodu' },
                { key: 'last_status', label: 'Durum', render: (row) => <span className={`badge ${row.last_status || 'unknown'}`}>{row.last_status || 'unknown'}</span> },
              ]}
            />
          </section>

          <section className="panel">
            <div className="page-header">
              <h2>Toplu Kargo Etiketi</h2>
              <button type="button" onClick={bulkLabels} disabled={loading}><FileText size={16} /> Toplu Etiket Olustur</button>
            </div>
            <DataTable
              rows={shipments}
              columns={[
                { key: 'select', label: '', render: (row) => <input type="checkbox" checked={selectedShipments.includes(row.id)} onChange={() => toggleShipment(row.id)} /> },
                { key: 'carrier_code', label: 'Kargo' },
                { key: 'order', label: 'Siparis', render: (row) => row.order?.marketplace_order_id },
                { key: 'tracking_number', label: 'Takip No' },
                { key: 'barcode', label: 'Barkod' },
                { key: 'return_code', label: 'Iade Kodu', render: (row) => row.return_code || '-' },
                { key: 'status', label: 'Durum', render: (row) => <span className={`badge ${row.status}`}>{row.status}</span> },
                {
                  key: 'actions',
                  label: 'Islem',
                  render: (row) => (
                    <div className="row-actions">
                      <button type="button" onClick={() => action(row.id, api.shipping.track, 'Takip sorgusu kuyruga alindi.')}><Search size={15} /> Takip</button>
                      <button type="button" onClick={() => action(row.id, api.shipping.label, 'Etiket kuyruga alindi.')}><FileText size={15} /> Etiket</button>
                      <button type="button" onClick={() => action(row.id, api.shipping.returnCode, 'Iade kodu kuyruga alindi.')}><Undo2 size={15} /> Iade</button>
                      <button type="button" onClick={() => action(row.id, api.shipping.retry, 'Tekrar deneme baslatildi.')} disabled={row.status !== 'failed'}><RotateCcw size={15} /> Tekrar Dene</button>
                      <button type="button" onClick={() => downloadLabel(row.id)}><Download size={15} /> Indir</button>
                    </div>
                  ),
                },
              ]}
            />
          </section>
        </>
      )}
    </>
  );
}
