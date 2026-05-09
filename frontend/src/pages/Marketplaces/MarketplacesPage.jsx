import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { api } from '../../api/client.js';
import { DataTable } from '../../components/DataTable.jsx';
import { ErrorState } from '../../components/ErrorState.jsx';
import { Field } from '../../components/Field.jsx';
import { LoadingState } from '../../components/LoadingState.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { useApp } from '../../context/AppContext.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { firstError, validateMarketplace } from '../../utils/validation.js';

const initialForm = {
  company_id: '',
  code: 'trendyol',
  name: '',
  supplier_id: '',
  merchant_id: '',
  api_key: '',
  api_secret: '',
  is_active: true,
};

export function MarketplacesPage() {
  const { notify } = useApp();
  const { loading, error, setError, run } = useAsync();
  const [accounts, setAccounts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});

  const load = async () => {
    await run(async () => {
      const [accountResponse, companyResponse] = await Promise.all([api.marketplaces.list(), api.companies.list()]);
      setAccounts(accountResponse.data || []);
      setCompanies(companyResponse.data || []);
    });
  };

  useEffect(() => {
    load();
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    const validationErrors = validateMarketplace(form);
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      setError(firstError(validationErrors));
      return;
    }

    await run(async () => {
      await api.marketplaces.create(form);
      setForm(initialForm);
      notify('success', 'Entegrasyon kaydedildi.');
      await load();
    });
  };

  const sync = async (id, type) => {
    await run(async () => {
      const response = type === 'products' ? await api.marketplaces.syncProducts(id) : await api.marketplaces.syncOrders(id);
      notify('success', response.message);
      await load();
    });
  };

  return (
    <>
      <PageHeader title="Pazaryeri Entegrasyonlari" />
      <section className="panel">
        <form className="form-grid" onSubmit={submit}>
          <Field label="Firma" error={errors.company_id}>
            <select value={form.company_id} onChange={(event) => setForm({ ...form, company_id: event.target.value })}>
              <option value="">Seciniz</option>
              {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </select>
          </Field>
          <Field label="Pazaryeri">
            <select value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })}>
              <option value="trendyol">Trendyol</option>
              <option value="hepsiburada">Hepsiburada</option>
            </select>
          </Field>
          <Field label="Hesap Adi" error={errors.name}><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
          <Field label="Supplier ID" error={errors.supplier_id}><input value={form.supplier_id} onChange={(event) => setForm({ ...form, supplier_id: event.target.value })} /></Field>
          <Field label="Merchant ID" error={errors.merchant_id}><input value={form.merchant_id} onChange={(event) => setForm({ ...form, merchant_id: event.target.value })} /></Field>
          <Field label="API Key"><input value={form.api_key} onChange={(event) => setForm({ ...form, api_key: event.target.value })} /></Field>
          <Field label="API Secret"><input type="password" value={form.api_secret} onChange={(event) => setForm({ ...form, api_secret: event.target.value })} /></Field>
          <button disabled={loading}>{loading ? 'Kaydediliyor...' : 'Entegrasyon Ekle'}</button>
        </form>
      </section>
      {error && <ErrorState message={error} onRetry={load} />}
      {loading && accounts.length === 0 ? <LoadingState /> : (
      <DataTable
        rows={accounts}
        columns={[
          { key: 'name', label: 'Hesap' },
          { key: 'code', label: 'Pazaryeri' },
          { key: 'company', label: 'Firma', render: (row) => row.company?.name },
          { key: 'is_active', label: 'Durum', render: (row) => (row.is_active ? 'Aktif' : 'Pasif') },
          {
            key: 'actions',
            label: 'Islemler',
            render: (row) => (
              <div className="row-actions">
                <button type="button" disabled={loading} onClick={() => sync(row.id, 'products')}><RefreshCw size={15} /> Urun</button>
                <button type="button" disabled={loading} onClick={() => sync(row.id, 'orders')}><RefreshCw size={15} /> Siparis</button>
              </div>
            ),
          },
        ]}
      />
      )}
    </>
  );
}
