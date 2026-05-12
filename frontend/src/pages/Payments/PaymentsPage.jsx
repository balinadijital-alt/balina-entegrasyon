import { useEffect, useState } from 'react';
import { Link, RotateCcw, Undo2 } from 'lucide-react';
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
  payment_provider_id: '',
  name: '',
  merchant_id: '',
  api_key: '',
  api_secret: '',
  client_id: '',
  client_secret: '',
  base_url: '',
  webhook_secret: '',
};

export function PaymentsPage() {
  const { notify } = useApp();
  const { loading, error, run } = useAsync();
  const [companies, setCompanies] = useState([]);
  const [providers, setProviders] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [payments, setPayments] = useState([]);
  const [logs, setLogs] = useState([]);
  const [form, setForm] = useState(initialForm);

  const load = async () => {
    await run(async () => {
      const [companyResponse, providerResponse, accountResponse, paymentResponse, logResponse] = await Promise.all([
        api.companies.list(),
        api.payments.providers(),
        api.payments.accounts(),
        api.payments.list(),
        api.payments.logs(),
      ]);
      setCompanies(companyResponse.data || []);
      setProviders(providerResponse || []);
      setAccounts(accountResponse.data || []);
      setPayments(paymentResponse.data || []);
      setLogs(logResponse.data || []);
      setForm((current) => ({ ...current, payment_provider_id: current.payment_provider_id || providerResponse?.[0]?.id || '' }));
    });
  };

  useEffect(() => {
    load();
  }, []);

  const createAccount = async (event) => {
    event.preventDefault();
    await run(async () => {
      await api.payments.createAccount({
        ...form,
        installment_rates: { 1: 0, 2: 2.5, 3: 3.5 },
        commission_rates: { 1: 0, 2: 2.5, 3: 3.5 },
        settings: { endpoints: {} },
      });
      setForm(initialForm);
      notify('success', 'POS hesabi kaydedildi.');
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  const action = async (paymentId, fn, payload, fallback) => {
    await run(async () => {
      const response = await fn(paymentId, payload);
      notify('success', response.message || fallback);
      await load();
    }, { onError: (message) => notify('error', message) });
  };

  return (
    <>
      <PageHeader title="Odeme Yonetimi" />
      <section className="kpi-grid">
        <div className="kpi-card"><span>POS Hesabi</span><strong>{accounts.length}</strong><small>Aktif hesap</small></div>
        <div className="kpi-card"><span>Basarili</span><strong>{payments.filter((payment) => payment.status === 'paid').length}</strong><small>Odeme</small></div>
        <div className="kpi-card"><span>Bekleyen</span><strong>{payments.filter((payment) => payment.status === 'pending').length}</strong><small>Sorgulanacak</small></div>
        <div className="kpi-card"><span>Hatali</span><strong>{payments.filter((payment) => payment.status === 'failed').length}</strong><small>Kontrol gerekli</small></div>
      </section>
      <section className="panel">
        <form className="form-grid" onSubmit={createAccount}>
          <Field label="Firma">
            <select value={form.company_id} onChange={(event) => setForm({ ...form, company_id: event.target.value })}>
              <option value="">Seciniz</option>
              {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
          </Field>
          <Field label="Saglayici">
            <select value={form.payment_provider_id} onChange={(event) => setForm({ ...form, payment_provider_id: event.target.value })}>
              <option value="">Seciniz</option>
              {providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}
            </select>
          </Field>
          <Field label="Hesap Adi"><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
          <Field label="Merchant ID"><input value={form.merchant_id} onChange={(event) => setForm({ ...form, merchant_id: event.target.value })} /></Field>
          <Field label="Baglanti Anahtari"><input value={form.api_key} onChange={(event) => setForm({ ...form, api_key: event.target.value })} /></Field>
          <Field label="Gizli Anahtar"><input type="password" value={form.api_secret} onChange={(event) => setForm({ ...form, api_secret: event.target.value })} /></Field>
          <Field label="Client ID"><input value={form.client_id} onChange={(event) => setForm({ ...form, client_id: event.target.value })} /></Field>
          <Field label="Client Secret"><input type="password" value={form.client_secret} onChange={(event) => setForm({ ...form, client_secret: event.target.value })} /></Field>
          <Field label="Servis Adresi"><input value={form.base_url} onChange={(event) => setForm({ ...form, base_url: event.target.value })} /></Field>
          <Field label="Bildirim Anahtari"><input type="password" value={form.webhook_secret} onChange={(event) => setForm({ ...form, webhook_secret: event.target.value })} /></Field>
          <button disabled={loading}>POS Hesabi Ekle</button>
        </form>
      </section>

      {error && <ErrorState message={error} onRetry={load} />}
      {loading && accounts.length === 0 ? <LoadingState /> : (
        <>
          <section className="panel">
            <h2>Odeme Hesaplari</h2>
            <DataTable
              rows={accounts}
              columns={[
                { key: 'name', label: 'Hesap' },
                { key: 'company', label: 'Firma', render: (row) => row.company?.name },
                { key: 'provider', label: 'Saglayici', render: (row) => row.provider?.name },
                { key: 'base_url', label: 'Base URL', render: (row) => row.base_url || 'Mock/Fallback' },
              ]}
            />
          </section>

          <section className="panel">
            <h2>Odemeler</h2>
            <DataTable
              rows={payments}
              columns={[
                { key: 'provider_code', label: 'Saglayici' },
                { key: 'order', label: 'Siparis', render: (row) => row.order?.marketplace_order_id },
                { key: 'amount', label: 'Tutar' },
                { key: 'installment_count', label: 'Taksit' },
                { key: 'commission_amount', label: 'Komisyon' },
                { key: 'status', label: 'Durum', render: (row) => <span className={`badge ${row.status}`}>{row.status}</span> },
                { key: 'payment_url', label: 'Link', render: (row) => row.payment_url ? <a href={row.payment_url} target="_blank" rel="noreferrer"><Link size={15} /> Ac</a> : '-' },
                { key: 'actions', label: 'Islem', render: (row) => <div className="row-actions"><button type="button" onClick={() => action(row.id, api.payments.query, null, 'Sorgu kuyruga alindi.')}><RotateCcw size={15} /> Sorgula</button><button type="button" onClick={() => action(row.id, api.payments.refund, { amount: row.amount }, 'Iade islendi.')} disabled={!['paid', 'partially_refunded'].includes(row.status)}><Undo2 size={15} /> Iade</button><button type="button" onClick={() => action(row.id, api.payments.refund, { amount: Number(row.amount) / 2 }, 'Kismi iade islendi.')} disabled={!['paid', 'partially_refunded'].includes(row.status)}>Kismi Iade</button></div> },
              ]}
            />
          </section>

          <section className="panel">
            <h2>Odeme Hatalari</h2>
            <DataTable
              rows={logs.filter((log) => log.status === 'failed' || log.error_message)}
              columns={[
                { key: 'provider_code', label: 'Saglayici' },
                { key: 'event', label: 'Islem' },
                { key: 'status', label: 'Durum' },
                { key: 'duration_ms', label: 'Sure' },
                { key: 'error_message', label: 'Hata', render: (row) => row.error_message || '-' },
              ]}
            />
          </section>
        </>
      )}
    </>
  );
}
