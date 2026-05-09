import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { api, jsonBody } from '../../api/client.js';
import { DataTable } from '../../components/DataTable.jsx';
import { Field } from '../../components/Field.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';

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
  const [accounts, setAccounts] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [form, setForm] = useState(initialForm);

  const load = async () => {
    const [accountResponse, companyResponse] = await Promise.all([api('/marketplaces'), api('/companies')]);
    setAccounts(accountResponse.data || []);
    setCompanies(companyResponse.data || []);
  };

  useEffect(() => {
    load();
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    await api('/marketplaces', { method: 'POST', body: jsonBody(form) });
    setForm(initialForm);
    load();
  };

  const sync = async (id, type) => {
    await api(`/marketplaces/${id}/sync-${type}`, { method: 'POST' });
  };

  return (
    <>
      <PageHeader title="Pazaryeri Entegrasyonlari" />
      <section className="panel">
        <form className="form-grid" onSubmit={submit}>
          <Field label="Firma">
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
          <Field label="Hesap Adi"><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
          <Field label="Supplier ID"><input value={form.supplier_id} onChange={(event) => setForm({ ...form, supplier_id: event.target.value })} /></Field>
          <Field label="Merchant ID"><input value={form.merchant_id} onChange={(event) => setForm({ ...form, merchant_id: event.target.value })} /></Field>
          <Field label="API Key"><input value={form.api_key} onChange={(event) => setForm({ ...form, api_key: event.target.value })} /></Field>
          <Field label="API Secret"><input type="password" value={form.api_secret} onChange={(event) => setForm({ ...form, api_secret: event.target.value })} /></Field>
          <button>Entegrasyon Ekle</button>
        </form>
      </section>
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
                <button type="button" onClick={() => sync(row.id, 'products')}><RefreshCw size={15} /> Urun</button>
                <button type="button" onClick={() => sync(row.id, 'orders')}><RefreshCw size={15} /> Siparis</button>
              </div>
            ),
          },
        ]}
      />
    </>
  );
}
